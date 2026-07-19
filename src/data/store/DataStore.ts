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
/** Alta de convocatoria desde el admin (el store genera id + slug). */
export type NewConvocatoria = Omit<Convocatoria, 'id' | 'slug'> & { slug?: string }

/** Recursos hidratados en bloque desde el backend (para isHydrating → páginas :slug). */
export type HydratableResource = 'events' | 'catalog' | 'galleries' | 'notas'

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

  /**
   * ¿El recurso todavía se está hidratando del backend? Sirve para distinguir "cargando" de
   * "no existe" en las páginas :slug (evita el flash de "link vencido" cuando el slug existe en
   * prod pero aún no en el caché). Local siempre false (el seed es autoritativo al instante).
   */
  isHydrating(resource: HydratableResource): boolean

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
  /** Inscripciones generales (sin bloque) confirmadas de un evento, server-wide (para el admin).
   *  getRegistrations() es device-scoped; esto agrega todos los devices (como blockAvailability). */
  generalRegistrationCount(eventId: string): number
  getRegistrations(): Registration[]
  isRegistered(eventId: string, blockId?: string): boolean
  register(eventId: string, blockId?: string): Registration | null
  cancelRegistration(registrationId: string): void

  /* Planes y órdenes.
   * ⚠️ Los PLANES tienen backend (RemoteDataStore: GET /plans, PATCH /admin/plans/:id).
   * Las ÓRDENES (createOrder/markOrderRedirected/setOrderStatus/getOrders) NO tienen ruta backend
   * todavía (Fase C, bloqueada por checkout MP): en modo Remote caen a LocalDataStore → viven solo
   * en el localStorage del comprador, NO persisten en prod. No asumir paridad Local/Remote acá. */
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

  /* Publicidad autogestionada (self-serve).
   * ⚠️ Sin ruta backend todavía (no hay /campaigns): en modo Remote cae a LocalDataStore → una
   * campaña "comprada" por QR vive solo en el localStorage del comprador, NO persiste en prod.
   * El modelo Prisma AdCampaign existe (índice one_active_per_slot) pero está dormante. */
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
  getConvocatorias(): Convocatoria[]
  getConvocatoria(slug: string): Convocatoria | undefined
  createConvocatoria(input: NewConvocatoria): Convocatoria
  updateConvocatoria(id: string, patch: Partial<Convocatoria>): void
  deleteConvocatoria(id: string): void
  submitApplication(convocatoriaId: string, data: Record<string, string>): Application
  getApplications(): Application[]
  decideApplication(applicationId: string, status: Exclude<ApplicationStatus, 'preinscripta'>): void

  /* Analytics */
  track(event: string, payload?: Record<string, unknown>): void
  getAnalytics(): AnalyticsEvent[]

  /**
   * Re-hidrata los recursos con vista admin (notas/banners/beneficios) tras loguear el
   * organizador, para que el panel vea borradores/ocultos/códigos sin recargar. No-op local.
   */
  refetchAdminScoped(): void
}
