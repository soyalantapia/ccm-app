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

  /* Eventos e inscripciones */
  getEvents(): EventItem[]
  getEvent(slug: string): EventItem | undefined
  getEventById(id: string): EventItem | undefined
  getBlocks(eventId: string): EventBlock[]
  getBlock(blockId: string): EventBlock | undefined
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

  /* Fotos */
  getGalleries(): Gallery[]
  getGallery(slug: string): Gallery | undefined
  getFavorites(): string[]
  toggleFavorite(photoId: string): void
  recordDownload(photoId: string, galleryId: string): void
  getDownloads(): PhotoDownload[]

  /* Contenido */
  getContents(): ContentItem[]

  /* Sponsors y publicidad */
  getSponsors(): Sponsor[]
  getSponsor(id: string): Sponsor | undefined
  getCreative(slot: AdSlot, index?: number): { sponsor: Sponsor; creative: SponsorCreative } | undefined

  /* Convocatorias y postulaciones */
  getConvocatoria(slug: string): Convocatoria | undefined
  submitApplication(convocatoriaId: string, data: Record<string, string>): Application
  getApplications(): Application[]
  decideApplication(applicationId: string, status: Exclude<ApplicationStatus, 'preinscripta'>): void

  /* Analytics */
  track(event: string, payload?: Record<string, unknown>): void
  getAnalytics(): AnalyticsEvent[]
}
