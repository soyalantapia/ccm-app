import type {
  AnalyticsEvent,
  Application,
  ApplicationStatus,
  CatalogProfile,
  Convocatoria,
  ContentItem,
  DeviceProfile,
  EventBlock,
  EventItem,
  Gallery,
  OrderStatus,
  PlanId,
  ProfileFieldKey,
  Registration,
  Sponsor,
  AdSlot,
  SponsorCreative,
  TicketOrder,
  TicketPlan,
} from '../types'
import type {
  BlockAvailability,
  DataStore,
  NewBlock,
  NewEvent,
  NewGallery,
  NewSponsor,
  PhotoDownload,
} from './DataStore'
import { readJSON, writeJSON, newId } from '../../lib/storage'
import { mergeOverlay, overlayCreate, overlayDelete, overlayEdit, slugify } from './overlay'
import { track as doTrack, getLocalAnalytics } from '../../lib/track'
import * as identity from '../../lib/identity'
import { seedPlans } from '../../config/plans'
import { seedEvents } from '../seed/events'
import { seedBlocks } from '../seed/blocks'
import { seedCatalog } from '../seed/catalog'
import { seedGalleries } from '../seed/galleries'
import { seedSponsors } from '../seed/sponsors'
import { seedContents } from '../seed/contents'
import { seedConvocatorias } from '../seed/convocatorias'
import { seedApplications } from '../seed/applications'
import { seedAnalytics } from '../seed/analytics'

const K = {
  registrations: 'registrations',
  orders: 'orders',
  favorites: 'favorites',
  downloads: 'downloads',
  applications: 'applications',
  applicationOverrides: 'applicationOverrides',
  planOverrides: 'planOverrides',
  eventsOverlay: 'eventsOverlay',
  blocksOverlay: 'blocksOverlay',
  galleriesOverlay: 'galleriesOverlay',
  sponsorsOverlay: 'sponsorsOverlay',
} as const

type PlanOverride = { price?: number | null; mpLink?: string }
type AppOverride = { status: ApplicationStatus; decidedAt: string }

/** Implementación Fase 0: seed estático + localStorage (cero backend). */
export class LocalDataStore implements DataStore {
  /* ─── Perfil ─── */

  getProfile(): DeviceProfile {
    return identity.getProfile()
  }

  saveProfileFields(values: Partial<Record<ProfileFieldKey, string>>, source: string): void {
    const before = identity.getProfile().fields
    identity.saveProfileFields(values, source)
    for (const [field, value] of Object.entries(values)) {
      if (value && !before[field as ProfileFieldKey]?.value) {
        this.track('profile_field_captured', { field, source })
      }
    }
  }

  saveConsents(consents: { terms?: boolean; news?: boolean; sponsors?: boolean }): void {
    identity.saveConsents(consents)
  }

  /* ─── Eventos ─── */

  getEvents(): EventItem[] {
    return mergeOverlay(seedEvents, K.eventsOverlay).sort((a, b) => a.startDate.localeCompare(b.startDate))
  }

  getEvent(slug: string): EventItem | undefined {
    return this.getEvents().find((e) => e.slug === slug)
  }

  getEventById(id: string): EventItem | undefined {
    return this.getEvents().find((e) => e.id === id)
  }

  createEvent(input: NewEvent): EventItem {
    const existing = new Set(this.getEvents().map((e) => e.slug))
    const base = input.slug || slugify(input.title)
    let slug = base
    for (let i = 2; existing.has(slug); i++) slug = `${base}-${i}`
    const event: EventItem = { ...input, id: newId('ev'), slug }
    overlayCreate(K.eventsOverlay, event)
    this.track('admin_event_created', { eventId: event.id, type: event.type })
    return event
  }

  updateEvent(id: string, patch: Partial<EventItem>): void {
    overlayEdit(K.eventsOverlay, id, patch)
    this.track('admin_event_updated', { eventId: id })
  }

  deleteEvent(id: string): void {
    // Borra el evento y, en cascada, sus bloques.
    this.getBlocks(id).forEach((b) => overlayDelete(K.blocksOverlay, b.id))
    overlayDelete(K.eventsOverlay, id)
    this.track('admin_event_deleted', { eventId: id })
  }

  getBlocks(eventId: string): EventBlock[] {
    return mergeOverlay(seedBlocks, K.blocksOverlay).filter((b) => b.eventId === eventId)
  }

  getBlock(blockId: string): EventBlock | undefined {
    return mergeOverlay(seedBlocks, K.blocksOverlay).find((b) => b.id === blockId)
  }

  createBlock(input: NewBlock): EventBlock {
    const block: EventBlock = { ...input, id: newId('blk') }
    overlayCreate(K.blocksOverlay, block)
    this.track('admin_block_created', { blockId: block.id, eventId: block.eventId })
    return block
  }

  updateBlock(id: string, patch: Partial<EventBlock>): void {
    overlayEdit(K.blocksOverlay, id, patch)
    this.track('admin_block_updated', { blockId: id })
  }

  deleteBlock(id: string): void {
    overlayDelete(K.blocksOverlay, id)
    this.track('admin_block_deleted', { blockId: id })
  }

  blockAvailability(blockId: string): BlockAvailability {
    const block = this.getBlock(blockId)
    if (!block) return { capacity: 0, taken: 0, left: 0, full: true }
    const localTaken = this.getRegistrations().filter(
      (r) => r.blockId === blockId && r.status === 'confirmada',
    ).length
    const taken = Math.min(block.capacity, block.seedTaken + localTaken)
    return { capacity: block.capacity, taken, left: block.capacity - taken, full: taken >= block.capacity }
  }

  getRegistrations(): Registration[] {
    return readJSON<Registration[]>(K.registrations, [])
  }

  isRegistered(eventId: string, blockId?: string): boolean {
    return this.getRegistrations().some(
      (r) =>
        r.status === 'confirmada' &&
        r.eventId === eventId &&
        (blockId === undefined ? r.blockId === undefined : r.blockId === blockId),
    )
  }

  register(eventId: string, blockId?: string): Registration | null {
    if (this.isRegistered(eventId, blockId)) {
      return (
        this.getRegistrations().find(
          (r) => r.status === 'confirmada' && r.eventId === eventId && r.blockId === blockId,
        ) ?? null
      )
    }
    if (blockId && this.blockAvailability(blockId).full) return null
    const registration: Registration = {
      id: newId('reg'),
      eventId,
      ...(blockId ? { blockId } : {}),
      ts: new Date().toISOString(),
      status: 'confirmada',
    }
    writeJSON(K.registrations, [...this.getRegistrations(), registration])
    this.track('registration_created', { eventId, blockId: blockId ?? null })
    return registration
  }

  cancelRegistration(registrationId: string): void {
    const regs = this.getRegistrations()
    const reg = regs.find((r) => r.id === registrationId)
    if (!reg) return
    writeJSON(
      K.registrations,
      regs.map((r) => (r.id === registrationId ? { ...r, status: 'cancelada' as const } : r)),
    )
    this.track('registration_cancelled', { eventId: reg.eventId, blockId: reg.blockId ?? null })
  }

  /* ─── Planes y órdenes ─── */

  getPlans(): TicketPlan[] {
    const overrides = readJSON<Partial<Record<PlanId, PlanOverride>>>(K.planOverrides, {})
    return seedPlans.map((plan) => {
      const o = overrides[plan.id]
      return o ? { ...plan, ...(o.price !== undefined ? { price: o.price } : {}), ...(o.mpLink ? { mpLink: o.mpLink } : {}) } : plan
    })
  }

  getPlan(id: PlanId): TicketPlan | undefined {
    return this.getPlans().find((p) => p.id === id)
  }

  updatePlan(id: PlanId, patch: { price?: number | null; mpLink?: string }): void {
    const overrides = readJSON<Partial<Record<PlanId, PlanOverride>>>(K.planOverrides, {})
    overrides[id] = { ...overrides[id], ...patch }
    writeJSON(K.planOverrides, overrides)
  }

  createOrder(planId: PlanId, qty = 1): TicketOrder {
    const profile = this.getProfile()
    const plan = this.getPlan(planId)
    const unit = (plan?.price ?? 0) + (plan?.serviceCharge ?? 0)
    const order: TicketOrder = {
      id: newId('ord'),
      planId,
      ts: new Date().toISOString(),
      status: 'iniciada',
      buyerName: identity.displayName() || undefined,
      buyerEmail: profile.fields.email?.value,
      qty,
      total: unit * qty,
    }
    writeJSON(K.orders, [...this.getOrders(), order])
    this.track('ticket_order_created', { planId, orderId: order.id, qty, total: order.total })
    return order
  }

  markOrderRedirected(orderId: string): void {
    this.setOrderStatusInternal(orderId, 'redirigida_mp')
    const order = this.getOrders().find((o) => o.id === orderId)
    this.track('ticket_order_redirected_mp', { orderId, planId: order?.planId })
  }

  setOrderStatus(orderId: string, status: OrderStatus): void {
    this.setOrderStatusInternal(orderId, status)
    if (status === 'confirmada') {
      const order = this.getOrders().find((o) => o.id === orderId)
      this.track('ticket_order_confirmed', { orderId, planId: order?.planId })
    }
  }

  private setOrderStatusInternal(orderId: string, status: OrderStatus): void {
    const orders = this.getOrders()
    if (!orders.some((o) => o.id === orderId)) return
    writeJSON(
      K.orders,
      orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
    )
  }

  getOrders(): TicketOrder[] {
    return readJSON<TicketOrder[]>(K.orders, [])
  }

  /* ─── Catálogo ─── */

  getCatalog(): CatalogProfile[] {
    return seedCatalog
  }

  getCatalogProfile(slug: string): CatalogProfile | undefined {
    return seedCatalog.find((p) => p.slug === slug)
  }

  /* ─── Fotos ─── */

  getGalleries(): Gallery[] {
    return mergeOverlay(seedGalleries, K.galleriesOverlay)
  }

  getGallery(slug: string): Gallery | undefined {
    return this.getGalleries().find((g) => g.slug === slug)
  }

  createGallery(input: NewGallery): Gallery {
    const existing = new Set(this.getGalleries().map((g) => g.slug))
    const base = input.slug || slugify(input.title)
    let slug = base
    for (let i = 2; existing.has(slug); i++) slug = `${base}-${i}`
    const gallery: Gallery = { ...input, id: newId('gal'), slug }
    overlayCreate(K.galleriesOverlay, gallery)
    this.track('admin_gallery_created', { galleryId: gallery.id })
    return gallery
  }

  updateGallery(id: string, patch: Partial<Gallery>): void {
    overlayEdit(K.galleriesOverlay, id, patch)
    this.track('admin_gallery_updated', { galleryId: id })
  }

  deleteGallery(id: string): void {
    overlayDelete(K.galleriesOverlay, id)
    this.track('admin_gallery_deleted', { galleryId: id })
  }

  getFavorites(): string[] {
    return readJSON<string[]>(K.favorites, [])
  }

  toggleFavorite(photoId: string): void {
    const favorites = this.getFavorites()
    if (favorites.includes(photoId)) {
      writeJSON(K.favorites, favorites.filter((id) => id !== photoId))
    } else {
      writeJSON(K.favorites, [...favorites, photoId])
      this.track('photo_favorite', { photoId })
    }
  }

  recordDownload(photoId: string, galleryId: string): void {
    const gallery = seedGalleries.find((g) => g.id === galleryId)
    const download: PhotoDownload = {
      photoId,
      galleryId,
      sponsorId: gallery?.sponsorId ?? '',
      ts: new Date().toISOString(),
    }
    writeJSON(K.downloads, [...this.getDownloads(), download])
    this.track('photo_download', { photoId, galleryId, sponsorId: download.sponsorId })
  }

  getDownloads(): PhotoDownload[] {
    return readJSON<PhotoDownload[]>(K.downloads, [])
  }

  /* ─── Contenido ─── */

  getContents(): ContentItem[] {
    return [...seedContents].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  /* ─── Sponsors ─── */

  getSponsors(): Sponsor[] {
    return mergeOverlay(seedSponsors, K.sponsorsOverlay)
  }

  getSponsor(id: string): Sponsor | undefined {
    return this.getSponsors().find((s) => s.id === id)
  }

  createSponsor(input: NewSponsor): Sponsor {
    const sponsor: Sponsor = { ...input, id: newId('sp') }
    overlayCreate(K.sponsorsOverlay, sponsor)
    this.track('admin_sponsor_created', { sponsorId: sponsor.id, level: sponsor.level })
    return sponsor
  }

  updateSponsor(id: string, patch: Partial<Sponsor>): void {
    overlayEdit(K.sponsorsOverlay, id, patch)
    this.track('admin_sponsor_updated', { sponsorId: id })
  }

  deleteSponsor(id: string): void {
    overlayDelete(K.sponsorsOverlay, id)
    this.track('admin_sponsor_deleted', { sponsorId: id })
  }

  getCreative(slot: AdSlot, index = 0): { sponsor: Sponsor; creative: SponsorCreative } | undefined {
    const withSlot = this.getSponsors().flatMap((sponsor) =>
      sponsor.creatives.filter((c) => c.slot === slot).map((creative) => ({ sponsor, creative })),
    )
    if (withSlot.length === 0) return undefined
    return withSlot[index % withSlot.length]
  }

  /* ─── Convocatorias ─── */

  getConvocatoria(slug: string): Convocatoria | undefined {
    return seedConvocatorias.find((c) => c.slug === slug)
  }

  submitApplication(convocatoriaId: string, data: Record<string, string>): Application {
    const application: Application = {
      id: newId('app'),
      convocatoriaId,
      ts: new Date().toISOString(),
      status: 'preinscripta',
      data,
    }
    const local = readJSON<Application[]>(K.applications, [])
    writeJSON(K.applications, [...local, application])
    this.track('application_submitted', { convocatoriaId, applicationId: application.id })
    return application
  }

  getApplications(): Application[] {
    const overrides = readJSON<Record<string, AppOverride>>(K.applicationOverrides, {})
    const seeded = seedApplications.map((app) => {
      const o = overrides[app.id]
      return o ? { ...app, status: o.status, decidedAt: o.decidedAt } : app
    })
    const local = readJSON<Application[]>(K.applications, []).map((app) => {
      const o = overrides[app.id]
      return o ? { ...app, status: o.status, decidedAt: o.decidedAt } : app
    })
    return [...seeded, ...local].sort((a, b) => b.ts.localeCompare(a.ts))
  }

  decideApplication(applicationId: string, status: Exclude<ApplicationStatus, 'preinscripta'>): void {
    const overrides = readJSON<Record<string, AppOverride>>(K.applicationOverrides, {})
    overrides[applicationId] = { status, decidedAt: new Date().toISOString() }
    writeJSON(K.applicationOverrides, overrides)
    this.track(status === 'aceptada' ? 'application_accepted' : 'application_rejected', { applicationId })
  }

  /* ─── Analytics ─── */

  track(event: string, payload?: Record<string, unknown>): void {
    doTrack(event, payload)
  }

  getAnalytics(): AnalyticsEvent[] {
    return [...seedAnalytics, ...getLocalAnalytics()].sort((a, b) => a.ts.localeCompare(b.ts))
  }
}
