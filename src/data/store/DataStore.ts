import type {
  AdCampaign,
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
  Membership,
  OrderStatus,
  PlanId,
  ProfileFieldKey,
  Registration,
  Sponsor,
  AdSlot,
  SponsorCreative,
  TicketOrder,
  TicketPlan,
  Benefit,
  NewBenefit,
  Banner,
  NewBanner,
  Nota,
  NewNota,
} from '../types'

export interface BlockAvailability {
  capacity: number
  taken: number
  left: number
  full: boolean
}

export interface PhotoDownload {
  photoId: string
  galleryId: string
  sponsorId: string
  ts: string
}

/** Alta de evento desde el admin (el store genera id + slug). */
export type NewEvent = Omit<EventItem, 'id' | 'slug'> & { slug?: string }
/** Alta de bloque desde el admin (el store genera id). */
export type NewBlock = Omit<EventBlock, 'id'>
/** Alta de galería desde el admin (el store genera id + slug). */
export type NewGallery = Omit<Gallery, 'id' | 'slug'> & { slug?: string }
/** Alta de sponsor desde el admin (el store genera id). */
export type NewSponsor = Omit<Sponsor, 'id'>
/** Alta de expositor (catálogo) desde el admin (el store genera id + slug). */
export type NewCatalogProfile = Omit<CatalogProfile, 'id' | 'slug'> & { slug?: string }
/** Alta de contenido (video) desde el admin (el store genera id). */
export type NewContent = Omit<ContentItem, 'id'>
/** Compra de espacio publicitario autogestionado (el store genera id + ts). */
export type NewCampaign = Omit<AdCampaign, 'id' | 'ts'>

/**
 * DataStore — única puerta de acceso a datos de TODA la UI (patrón repositorio).
 * Fase 0: seed estático + localStorage. Fase 1: se enchufa un backend real
 * implementando esta misma interfaz, sin tocar pantallas.
 */
export interface DataStore {
  /* Perfil / identidad */
  getProfile(): DeviceProfile
  saveProfileFields(values: Partial<Record<ProfileFieldKey, string>>, source: string): void
  saveConsents(consents: { terms?: boolean; news?: boolean; sponsors?: boolean }): void

  /* Membresía (niveles de suscripción) */
  getMembership(): Membership
  isSocio(): boolean
  becomeSocio(paid: number): Membership

  /* Eventos e inscripciones */
  getEvents(): EventItem[]
  getEvent(slug: string): EventItem | undefined
  getEventById(id: string): EventItem | undefined
  createEvent(input: NewEvent): EventItem
  updateEvent(id: string, patch: Partial<EventItem>): void
  deleteEvent(id: string): void
  getBlocks(eventId: string): EventBlock[]
  getBlock(blockId: string): EventBlock | undefined
  createBlock(input: NewBlock): EventBlock
  updateBlock(id: string, patch: Partial<EventBlock>): void
  deleteBlock(id: string): void
  blockAvailability(blockId: string): BlockAvailability
  getRegistrations(): Registration[]
  isRegistered(eventId: string, blockId?: string): boolean
  register(eventId: string, blockId?: string): Registration | null
  cancelRegistration(registrationId: string): void

  /* Planes y órdenes */
  getPlans(): TicketPlan[]
  getPlan(id: PlanId): TicketPlan | undefined
  updatePlan(id: PlanId, patch: { price?: number | null; mpLink?: string }): void
  createOrder(planId: PlanId, qty?: number): TicketOrder
  markOrderRedirected(orderId: string): void
  setOrderStatus(orderId: string, status: OrderStatus): void
  getOrders(): TicketOrder[]

  /* Catálogo */
  getCatalog(): CatalogProfile[]
  getCatalogProfile(slug: string): CatalogProfile | undefined
  createCatalogProfile(input: NewCatalogProfile): CatalogProfile
  updateCatalogProfile(id: string, patch: Partial<CatalogProfile>): void
  deleteCatalogProfile(id: string): void

  /* Fotos */
  getGalleries(): Gallery[]
  getGallery(slug: string): Gallery | undefined
  createGallery(input: NewGallery): Gallery
  updateGallery(id: string, patch: Partial<Gallery>): void
  deleteGallery(id: string): void
  getFavorites(): string[]
  toggleFavorite(photoId: string): void
  recordDownload(photoId: string, galleryId: string): void
  getDownloads(): PhotoDownload[]

  /* Contenido */
  getContents(): ContentItem[]
  createContent(input: NewContent): ContentItem
  updateContent(id: string, patch: Partial<ContentItem>): void
  deleteContent(id: string): void

  /* Sponsors y publicidad */
  getSponsors(): Sponsor[]
  getSponsor(id: string): Sponsor | undefined
  createSponsor(input: NewSponsor): Sponsor
  updateSponsor(id: string, patch: Partial<Sponsor>): void
  deleteSponsor(id: string): void
  getCreative(slot: AdSlot, index?: number): { sponsor: Sponsor; creative: SponsorCreative } | undefined

  /* Publicidad autogestionada (self-serve) */
  createCampaign(input: NewCampaign): AdCampaign
  getCampaigns(): AdCampaign[]
  getActiveCampaign(slot: AdSlot): AdCampaign | undefined

  /* Banners gestionados (publicidad simple) */
  getBanners(): Banner[]
  createBanner(input: NewBanner): Banner
  updateBanner(id: string, patch: Partial<Banner>): void
  deleteBanner(id: string): void

  /* Notas / novedades (CMS editorial) */
  getNotas(): Nota[]
  getNota(slug: string): Nota | undefined
  createNota(input: NewNota): Nota
  updateNota(id: string, patch: Partial<Nota>): void
  deleteNota(id: string): void

  /* Beneficios (descuentos para registrados) */
  getBenefits(): Benefit[]
  createBenefit(input: NewBenefit): Benefit
  updateBenefit(id: string, patch: Partial<Benefit>): void
  deleteBenefit(id: string): void

  /* Convocatorias y postulaciones */
  getConvocatoria(slug: string): Convocatoria | undefined
  submitApplication(convocatoriaId: string, data: Record<string, string>): Application
  getApplications(): Application[]
  decideApplication(applicationId: string, status: Exclude<ApplicationStatus, 'preinscripta'>): void

  /* Analytics */
  track(event: string, payload?: Record<string, unknown>): void
  getAnalytics(): AnalyticsEvent[]
}
