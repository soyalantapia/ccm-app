import type {
  AdCampaign,
  AnalyticsEvent,
  AdminStats,
  Application,
  ApplicationStatus,
  CatalogProfile,
  Convocatoria,
  ContentItem,
  DeviceProfile,
  EventBlock,
  EventItem,
  Gallery,
  Membership,
  OrderStatus,
  PlanId,
  ProfileFieldKey,
  Registration,
  Sponsor,
  AdSlot,
  SponsorCreative,
  MpStatus,
  TicketOrder,
  TicketPlan,
  Benefit,
  NewBenefit,
  Banner,
  NewBanner,
  Nota,
  NewNota,
  InscriptoAdmin,
  SpeakersByEvent,
} from '../types'
import type {
  BlockAvailability,
  CheckoutItem,
  CatalogSpeakerAppearances,
  DataStore,
  HydratableResource,
  NewBlock,
  NewPlan,
  NewCampaign,
  NewCatalogProfile,
  NewContent,
  NewConvocatoria,
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
import { seedBenefits } from '../seed/benefits'
import { seedBanners } from '../seed/banners'
import { seedNotas } from '../seed/notas'

/** Claves de localStorage. Exportadas porque RemoteDataStore hace write-through sobre las
 *  device-scoped: así el fallback `?? super.getX()` devuelve el último snapshot real del
 *  server en vez del seed de demo o una lista vacía cuando la hidratación falla. */
export const K = {
  registrations: 'registrations',
  orders: 'orders',
  favorites: 'favorites',
  downloads: 'downloads',
  applications: 'applications',
  applicationOverrides: 'applicationOverrides',
  planOverrides: 'planOverrides',
  planExtra: 'planExtra', // tipos de entrada creados en demo (el seed es de sólo lectura)
  eventsOverlay: 'eventsOverlay',
  blocksOverlay: 'blocksOverlay',
  galleriesOverlay: 'galleriesOverlay',
  sponsorsOverlay: 'sponsorsOverlay',
  catalogOverlay: 'catalogOverlay',
  contentsOverlay: 'contentsOverlay',
  campaigns: 'campaigns',
  membership: 'membership',
  benefitsOverlay: 'benefitsOverlay',
  bannersOverlay: 'bannersOverlay',
  notasOverlay: 'notasOverlay',
  convocatoriasOverlay: 'convocatoriasOverlay',
} as const

/** Una campaña autogestionada se presenta como sponsor sintético en los slots. */
function campaignSponsor(c: AdCampaign): Sponsor {
  return {
    id: c.id,
    name: c.brand,
    industry: 'Autogestión',
    level: 'Plata',
    exclusive: false,
    tagline: c.tagline || 'Espacio autogestionado',
    creatives: [{ slot: c.slot, headline: c.headline, ...(c.cta ? { cta: c.cta } : {}) }],
  }
}

/** Campos editados de un plan en la demo. Ya no es sólo {price, mpLink}: desde que el panel
 *  edita nombre, bajada y tipo, el override tiene que poder reflejar cualquiera de ellos. */
type PlanOverride = Partial<Omit<TicketPlan, 'id' | 'eventId'>>
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

  /* ─── Membresía (niveles de suscripción) ─── */

  getMembership(): Membership {
    return readJSON<Membership>(K.membership, { tier: 'free', since: '', paid: 0 })
  }

  isSocio(): boolean {
    return this.getMembership().tier === 'socio'
  }

  becomeSocio(paid: number): Membership {
    const membership: Membership = { tier: 'socio', since: new Date().toISOString(), paid }
    writeJSON(K.membership, membership)
    this.track('membership_purchased', { tier: 'socio', total: paid })
    return membership
  }

  /** Demo/seed: nunca "hidratando" — el seed es autoritativo al instante. */
  isHydrating(_resource: HydratableResource): boolean {
    return false
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

  /** Sin backend el dispositivo ES la fuente completa, así que acá el total siempre se conoce.
   *  El tipo admite null porque RemoteDataStore sí puede no conocerlo (ver DataStore). */
  generalRegistrationCount(eventId: string): number | null {
    return this.getRegistrations().filter(
      (r) => r.eventId === eventId && !r.blockId && r.status === 'confirmada',
    ).length
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

  /** El panel: incluye las retiradas. En demo el seed no tiene ninguna, pero se mantiene la
   *  distinción para que los consumidores del panel usen la misma API que en remoto. */
  getAdminPlans(eventId?: string): TicketPlan[] {
    const overrides = readJSON<Partial<Record<PlanId, PlanOverride>>>(K.planOverrides, {})
    const extra = readJSON<TicketPlan[]>(K.planExtra, [])
    return [...seedPlans, ...extra]
      .filter((plan) => !eventId || plan.eventId === eventId)
      .map((plan) => {
        const o = overrides[plan.id]
        return o
          ? {
              ...plan,
              ...(o.price !== undefined ? { price: o.price } : {}),
              ...(o.mpLink ? { mpLink: o.mpLink } : {}),
              // Sin esto, retirar/reactivar en demo era un no-op: el override guardaba `archived`
              // pero la lectura nunca lo aplicaba, así que la entrada seguía a la venta.
              ...(o.archived !== undefined ? { archived: o.archived } : {}),
            }
          : plan
      })
  }

  getPlans(eventId?: string): TicketPlan[] {
    // Público: sin las retiradas de la venta.
    return this.getAdminPlans(eventId).filter((plan) => !plan.archived)
  }

  getPlan(id: PlanId): TicketPlan | undefined {
    return this.getPlans().find((p) => p.id === id)
  }

  /** En demo los planes salen del seed, que es de sólo lectura: el alta y la baja viven en un
   *  override local, igual que los precios editados. */
  createPlan(eventId: string, input: NewPlan): void {
    const extra = readJSON<TicketPlan[]>(K.planExtra, [])
    const id = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entrada'}-${Math.random().toString(36).slice(2, 8)}`
    writeJSON(K.planExtra, [...extra, { ...input, id, eventId }])
  }

  deletePlan(id: PlanId): void {
    const extra = readJSON<TicketPlan[]>(K.planExtra, [])
    writeJSON(K.planExtra, extra.filter((p) => p.id !== id))
  }

  updatePlan(id: PlanId, patch: Partial<Omit<TicketPlan, 'id' | 'eventId'>>): void {
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

  /** En demo no hay backend que esperar: las órdenes ya están creadas cuando `createOrder` vuelve. */
  async createOrders(sel: { planId: PlanId; qty: number }[]): Promise<TicketOrder[]> {
    return sel.map((s) => this.createOrder(s.planId, s.qty))
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

  /** En demo no hay separación device/organizador: las órdenes del navegador son todas. */
  getAdminOrders(): TicketOrder[] {
    return this.getOrders()
  }

  /* ─── Catálogo ─── */

  getCatalog(): CatalogProfile[] {
    return mergeOverlay(seedCatalog, K.catalogOverlay)
  }

  getCatalogProfile(slug: string): CatalogProfile | undefined {
    return this.getCatalog().find((p) => p.slug === slug)
  }

  createCatalogProfile(input: NewCatalogProfile & CatalogSpeakerAppearances): CatalogProfile {
    // `speakerAppearances` se ignora acá a propósito: la demo no tiene tabla EventSpeaker
    // (esa relación sólo existe contra el backend real, ver RemoteDataStore).
    const { speakerAppearances: _speakerAppearances, ...rest } = input
    const existing = new Set(this.getCatalog().map((p) => p.slug))
    const base = rest.slug || slugify(rest.name)
    let slug = base
    for (let i = 2; existing.has(slug); i++) slug = `${base}-${i}`
    const profile: CatalogProfile = { ...rest, id: newId('cat'), slug }
    overlayCreate(K.catalogOverlay, profile)
    this.track('admin_catalog_created', { profileId: profile.id })
    return profile
  }

  updateCatalogProfile(id: string, patch: Partial<CatalogProfile> & CatalogSpeakerAppearances): void {
    // Igual que en createCatalogProfile: sin tabla EventSpeaker en la demo, se ignora.
    const { speakerAppearances: _speakerAppearances, ...rest } = patch
    overlayEdit(K.catalogOverlay, id, rest)
    this.track('admin_catalog_updated', { profileId: id })
  }

  deleteCatalogProfile(id: string): void {
    overlayDelete(K.catalogOverlay, id)
    this.track('admin_catalog_deleted', { profileId: id })
  }

  /** La demo no tiene tabla EventSpeaker (esa relación sólo la persiste el backend real): no
   *  hay forma de derivar "quién habla en qué evento" del seed estático, así que se devuelve
   *  vacío en vez de simular una agrupación con datos inventados. */
  getSpeakersByEvent(): SpeakersByEvent[] {
    return []
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
    return mergeOverlay(seedContents, K.contentsOverlay).sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    )
  }

  createContent(input: NewContent): ContentItem {
    const content: ContentItem = { ...input, id: newId('vid') }
    overlayCreate(K.contentsOverlay, content)
    this.track('admin_content_created', { contentId: content.id })
    return content
  }

  updateContent(id: string, patch: Partial<ContentItem>): void {
    overlayEdit(K.contentsOverlay, id, patch)
    this.track('admin_content_updated', { contentId: id })
  }

  deleteContent(id: string): void {
    overlayDelete(K.contentsOverlay, id)
    this.track('admin_content_deleted', { contentId: id })
  }

  /* ─── Sponsors ─── */

  getSponsors(): Sponsor[] {
    return mergeOverlay(seedSponsors, K.sponsorsOverlay)
  }

  getSponsor(id: string): Sponsor | undefined {
    const sponsor = this.getSponsors().find((s) => s.id === id)
    if (sponsor) return sponsor
    // Campañas autogestionadas: se resuelven como sponsor sintético (para medirlas).
    const campaign = this.getCampaigns().find((c) => c.id === id)
    return campaign ? campaignSponsor(campaign) : undefined
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

  /* ─── Notas / novedades (CMS editorial) ─── */

  getNotas(): Nota[] {
    return mergeOverlay(seedNotas, K.notasOverlay)
      .filter((n) => n.published)
      .sort((a, b) => a.order - b.order || b.publishedAt.localeCompare(a.publishedAt))
  }

  /** En modo demo no hay gate de socio: la lista de contenidos ya viene completa. */
  getAdminContents(): ContentItem[] {
    return this.getContents()
  }

  /** En modo demo no hay borradores: todo lo cargado se ve, así que el panel usa la misma lista. */
  getAdminEvents(): EventItem[] {
    return this.getEvents()
  }

  getAdminNotas(): Nota[] {
    return mergeOverlay(seedNotas, K.notasOverlay).sort(
      (a, b) => a.order - b.order || b.publishedAt.localeCompare(a.publishedAt),
    )
  }

  getNota(slug: string): Nota | undefined {
    return mergeOverlay(seedNotas, K.notasOverlay).find((n) => n.slug === slug && n.published)
  }

  createNota(input: NewNota): Nota {
    const taken = new Set(mergeOverlay(seedNotas, K.notasOverlay).map((n) => n.slug))
    const base = input.slug || slugify(input.title)
    let slug = base
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
    const nota: Nota = { ...input, id: newId('nota'), slug }
    overlayCreate(K.notasOverlay, nota)
    this.track('admin_nota_created', { notaId: nota.id })
    return nota
  }

  updateNota(id: string, patch: Partial<Nota>): void {
    overlayEdit(K.notasOverlay, id, patch)
    this.track('admin_nota_updated', { notaId: id })
  }

  deleteNota(id: string): void {
    overlayDelete(K.notasOverlay, id)
    this.track('admin_nota_deleted', { notaId: id })
  }

  /** Sin backend no hay vista admin separada: no-op. */
  refetchAdminScoped(): void {}

  /* ─── Banners gestionados (publicidad simple) ─── */

  getBanners(): Banner[] {
    return mergeOverlay(seedBanners, K.bannersOverlay)
      .filter((b) => b.active)
      .sort((a, b) => a.order - b.order)
  }

  getAdminBanners(): Banner[] {
    return mergeOverlay(seedBanners, K.bannersOverlay).sort((a, b) => a.order - b.order)
  }

  createBanner(input: NewBanner): Banner {
    const banner: Banner = { ...input, id: newId('bnr') }
    overlayCreate(K.bannersOverlay, banner)
    this.track('admin_banner_created', { bannerId: banner.id, slot: banner.slot })
    return banner
  }

  updateBanner(id: string, patch: Partial<Banner>): void {
    overlayEdit(K.bannersOverlay, id, patch)
    this.track('admin_banner_updated', { bannerId: id })
  }

  deleteBanner(id: string): void {
    overlayDelete(K.bannersOverlay, id)
    this.track('admin_banner_deleted', { bannerId: id })
  }

  /* ─── Beneficios (descuentos para registrados) ─── */

  getBenefits(): Benefit[] {
    const registered = this.getRegistrations().some((r) => r.status === 'confirmada')
    return mergeOverlay(seedBenefits, K.benefitsOverlay)
      .filter((b) => b.active)
      .sort((a, b) => a.order - b.order)
      .map((b) => (registered ? b : { ...b, code: undefined }))
  }

  getAdminBenefits(): Benefit[] {
    return mergeOverlay(seedBenefits, K.benefitsOverlay).sort((a, b) => a.order - b.order)
  }

  createBenefit(input: NewBenefit): Benefit {
    const benefit: Benefit = { ...input, id: newId('ben') }
    overlayCreate(K.benefitsOverlay, benefit)
    this.track('admin_benefit_created', { benefitId: benefit.id, category: benefit.category })
    return benefit
  }

  updateBenefit(id: string, patch: Partial<Benefit>): void {
    overlayEdit(K.benefitsOverlay, id, patch)
    this.track('admin_benefit_updated', { benefitId: id })
  }

  deleteBenefit(id: string): void {
    overlayDelete(K.benefitsOverlay, id)
    this.track('admin_benefit_deleted', { benefitId: id })
  }

  getCreative(slot: AdSlot, index = 0): { sponsor: Sponsor; creative: SponsorCreative } | undefined {
    // Prioridad: una campaña autogestionada comprada para este slot ocupa el espacio.
    const campaign = this.getActiveCampaign(slot)
    if (campaign && index === 0) {
      const sponsor = campaignSponsor(campaign)
      return { sponsor, creative: sponsor.creatives[0] }
    }
    // Rota primero por SPONSOR (slots consecutivos = marcas distintas) y recién
    // después por creatividad dentro del mismo sponsor — aplanar por creative
    // hacía que dos banners seguidos mostraran la misma marca (se leía a relleno).
    const bySponsor = this.getSponsors()
      .map((sponsor) => ({ sponsor, creatives: sponsor.creatives.filter((c) => c.slot === slot) }))
      .filter((e) => e.creatives.length > 0)
    if (bySponsor.length === 0) return undefined
    const entry = bySponsor[index % bySponsor.length]
    const creative = entry.creatives[Math.floor(index / bySponsor.length) % entry.creatives.length]
    return { sponsor: entry.sponsor, creative }
  }

  /* ─── Publicidad autogestionada (self-serve) ─── */

  createCampaign(input: NewCampaign): AdCampaign {
    const campaign: AdCampaign = { ...input, id: newId('camp'), ts: new Date().toISOString() }
    writeJSON(K.campaigns, [...this.getCampaigns(), campaign])
    this.track('ad_campaign_purchased', {
      campaignId: campaign.id,
      slot: campaign.slot,
      hours: campaign.hours,
      total: campaign.total,
    })
    return campaign
  }

  getCampaigns(): AdCampaign[] {
    return readJSON<AdCampaign[]>(K.campaigns, [])
  }

  getActiveCampaign(slot: AdSlot): AdCampaign | undefined {
    // La última campaña comprada para el slot (en la demo se considera activa).
    const forSlot = this.getCampaigns().filter((c) => c.slot === slot)
    return forSlot.length ? forSlot[forSlot.length - 1] : undefined
  }

  /* ─── Convocatorias ─── */

  getConvocatorias(): Convocatoria[] {
    return mergeOverlay(seedConvocatorias, K.convocatoriasOverlay)
  }

  getConvocatoria(slug: string): Convocatoria | undefined {
    return this.getConvocatorias().find((c) => c.slug === slug)
  }

  createConvocatoria(input: NewConvocatoria): Convocatoria {
    const taken = new Set(this.getConvocatorias().map((c) => c.slug))
    const base = input.slug || slugify(input.title)
    let slug = base
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
    const convocatoria: Convocatoria = { ...input, id: newId('conv'), slug }
    overlayCreate(K.convocatoriasOverlay, convocatoria)
    this.track('admin_convocatoria_created', { convocatoriaId: convocatoria.id })
    return convocatoria
  }

  updateConvocatoria(id: string, patch: Partial<Convocatoria>): void {
    overlayEdit(K.convocatoriasOverlay, id, patch)
    this.track('admin_convocatoria_updated', { convocatoriaId: id })
  }

  deleteConvocatoria(id: string): void {
    overlayDelete(K.convocatoriasOverlay, id)
    this.track('admin_convocatoria_deleted', { convocatoriaId: id })
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

  /**
   * A diferencia de getAdminStats() (que en demo devuelve null porque las métricas no tienen
   * NINGÚN equivalente legítimo: se calculan sobre tablas que acá no existen), acá el seed de
   * postulaciones SÍ es el contenido de la demo — igual que getAdminEvents/getAdminNotas/
   * getAdminBenefits. Devolverlo no es mentir: en modo demo, todo es demo y se sabe.
   */
  getAdminApplications(): Application[] | null {
    return this.getApplications()
  }

  /** Nunca falla: sin backend no hay fetch que pueda fallar. */
  applicationsFailed(): boolean {
    return false
  }

  /** Demo: no hay backend admin, así que "mis" = todas (los consumidores filtran !fromSeed). */
  getMyApplications(): Application[] {
    return this.getApplications()
  }

  decideApplication(
    applicationId: string,
    status: ApplicationStatus,
    _opts?: { note?: string; skipEmail?: boolean },
  ): void {
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

  /** Sin backend no hay métricas reales que mostrar. null → el Dashboard pinta su estado
   *  vacío en vez de inventar números con el seed. */
  getAdminStats(): AdminStats | null {
    return null
  }

  refetchAdminStats(): void {
    /* no-op: sin backend no hay nada que re-pedir */
  }

  /** No falló: es que no hay backend. Son cosas distintas y el Dashboard las muestra distinto. */
  statsFailed(): boolean {
    return false
  }

  /** Esta es la capa de la DEMO: seed + localStorage, sin backend. */
  hasBackend(): boolean {
    return false
  }

  /* ─── Cobros con Mercado Pago ─── */

  /** Sin backend no hay nada conectado: la demo local siempre arranca desconectada. */
  getMpStatus(): MpStatus | undefined {
    return { conectado: false }
  }

  async connectMp(): Promise<string> {
    throw new Error('Mercado Pago no está disponible en la demo local')
  }

  async disconnectMp(): Promise<void> {}

  /** Demo: nunca hay checkout real (no hay backend que arme la preferencia). El llamador cae
   *  siempre al link manual del plan. */
  async startCheckout(_items: CheckoutItem[]): Promise<{ initPoint: string; amount: number } | null> {
    return null
  }

  /** En demo no hay server: se devuelve la lista vacía en vez de inventar inscriptos. */
  async fetchInscriptos(_eventId: string): Promise<InscriptoAdmin[]> {
    return []
  }
}
