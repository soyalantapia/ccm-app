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
  InscriptoAdmin,
  Membership,
  OrderStatus,
  PlanId,
  ProfileFieldKey,
  Registration,
  Sponsor,
  AdSlot,
  SpeakerAppearanceInput,
  SpeakersByEvent,
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
/** Apariciones de speaker a adjuntar al crear/editar un perfil — no es parte del tipo de
 *  dominio `CatalogProfile` (esas filas viven en `EventSpeaker`, no en la tabla del perfil). */
export type CatalogSpeakerAppearances = { speakerAppearances?: SpeakerAppearanceInput[] }
/** Alta de contenido (video) desde el admin (el store genera id). */
export type NewContent = Omit<ContentItem, 'id'>
/** Compra de espacio publicitario autogestionado (el store genera id + ts). */
export type NewCampaign = Omit<AdCampaign, 'id' | 'ts'>
/** Alta de un tipo de entrada (el server genera el id a partir del nombre). */
export type NewPlan = Omit<TicketPlan, 'id' | 'eventId'>

/** Alta de convocatoria desde el admin (el store genera id + slug). */
export type NewConvocatoria = Omit<Convocatoria, 'id' | 'slug'> & { slug?: string }

/** Una línea del carrito de pago. El monto NO viaja: lo calcula el server. */
export interface CheckoutItem {
  /** `event` = un evento con precio (capacitación, workshop). Se cobra solo, sin TicketPlan. */
  kind: 'ticket_order' | 'membership' | 'ad_campaign' | 'event'
  resourceId: string
}

/** Recursos hidratados en bloque desde el backend (para isHydrating → páginas :slug). */
export type HydratableResource = 'events' | 'catalog' | 'galleries' | 'notas' | 'convocatoria'

/**
 * Entrada regalada, vista desde el lado del INVITADO (la pantalla /i/:token del mail).
 *
 * `previewGrant` es de solo lectura: dice qué es el regalo sin activarlo, para poder mostrarle
 * al invitado "te regalaron N entradas para X" antes de que toque nada. `claimGrant` lo activa:
 * enlaza su dispositivo y materializa la inscripción. Los `motivo` vienen tal cual del backend
 * (grantService), así la UI decide el copy sin re-interpretar códigos.
 */
export type GrantPreview =
  | { ok: true; estado: 'pendiente' | 'reclamado'; eventTitle: string; eventWhen: string; qty: number }
  | { ok: false; motivo: 'no_existe' | 'link_invalido' | 'revocado' }

export type GrantClaim =
  | { ok: true; eventTitle: string; eventWhen: string; nuevo: boolean }
  | { ok: false; motivo: 'no_existe' | 'link_invalido' | 'revocado' | 'de_otra_persona' }

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
   *  getRegistrations() es device-scoped; esto agrega todos los devices (como blockAvailability).
   *  `null` = el total no se conoce (todavía no llegó, o el evento está en borrador y la ruta
   *  pública no lo entrega). Devolver 0 en ese caso pinta una ausencia con cara de dato exacto. */
  generalRegistrationCount(eventId: string): number | null
  getRegistrations(): Registration[]
  isRegistered(eventId: string, blockId?: string): boolean
  register(eventId: string, blockId?: string): Registration | null
  cancelRegistration(registrationId: string): void

  /* Planes y órdenes. Ambos con backend real:
   *  - planes: GET /plans, PATCH /admin/plans/:id
   *  - órdenes: GET/POST /orders (device), PATCH /orders/:id/redirected, y para el panel
   *    GET /admin/orders + PATCH /admin/orders/:id.
   * El TOTAL lo calcula el server con el precio vigente (no se confía en el cliente). La
   * confirmación del pago es MANUAL desde el panel; la conciliación automática por webhook de
   * Mercado Pago es una fase aparte y no cambia este modelo. */
  /**
   * Tipos de entrada. Con `eventId` devuelve sólo los de ESE evento.
   *
   * El parámetro no es un lujo: desde que cada evento arma sus propios tiers, una pantalla que
   * lea todos los planes mezcla las entradas de una capacitación con las del evento principal —
   * y como el "VIP desde $X" saca el MÍNIMO, un tier barato de otro evento le baja el precio
   * anunciado al principal. La única que sigue leyendo todos a propósito es "Tus órdenes", que
   * resuelve el nombre de cualquier plan que la persona haya comprado, sea de donde sea.
   */
  getPlans(eventId?: string): TicketPlan[]
  /**
   * Como getPlans pero incluye las entradas RETIRADAS de la venta. Sólo para el panel: la ficha
   * del evento las muestra en gris para reactivarlas, y "Tus órdenes"/AdminOrdenes resuelve el
   * nombre de una entrada que se vendió y después se retiró. La app pública nunca las ve.
   */
  getAdminPlans(eventId?: string): TicketPlan[]
  getPlan(id: PlanId): TicketPlan | undefined
  /** Alta de un tipo de entrada DENTRO de un evento. El server genera el id a partir del nombre. */
  createPlan(eventId: string, input: NewPlan): void
  /** Edición completa: antes sólo dejaba tocar precio y link, ni siquiera renombrar. */
  updatePlan(id: PlanId, patch: Partial<Omit<TicketPlan, 'id' | 'eventId'>>): void
  /** Baja. El server responde 409 si ya tiene compras: una entrada vendida no se borra. */
  deletePlan(id: PlanId): void
  createOrder(planId: PlanId, qty?: number): TicketOrder
  /**
   * Igual que `createOrder` para N planes, pero ESPERA a que el backend las haya creado de verdad.
   *
   * `createOrder` es fire-and-forget (manda el POST y devuelve la orden optimista al instante):
   * eso está bien para pintar la UI, pero no para encadenar un checkout. Si el cobro sale antes
   * de que las órdenes existan en el server, éste responde RESOURCE_NOT_FOUND y el comprador cae
   * al link manual — cobrando de menos. Con N órdenes basta que UNA llegue tarde.
   */
  createOrders(sel: { planId: PlanId; qty: number }[]): Promise<TicketOrder[]>
  markOrderRedirected(orderId: string): void
  setOrderStatus(orderId: string, status: OrderStatus): void
  getOrders(): TicketOrder[]
  /** TODAS las órdenes (panel del organizador). En demo = las mismas que getOrders(). */
  getAdminOrders(): TicketOrder[]

  /* Catálogo */
  getCatalog(): CatalogProfile[]
  getCatalogProfile(slug: string): CatalogProfile | undefined
  createCatalogProfile(input: NewCatalogProfile & CatalogSpeakerAppearances): CatalogProfile
  updateCatalogProfile(id: string, patch: Partial<CatalogProfile> & CatalogSpeakerAppearances): void
  deleteCatalogProfile(id: string): void

  /** Perfiles del catálogo agrupados por evento en el que hablan (kind: 'speaker'), tal como
   *  los ve la página pública /speakers. Hidratado del backend (GET /api/v1/speakers); en la
   *  demo (LocalDataStore) no hay tabla EventSpeaker, así que devuelve []. */
  getSpeakersByEvent(): SpeakersByEvent[]

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
  /** Vista ADMIN (todos, incl. ocultos/borradores). Las páginas públicas usan getBanners/getNotas/
   *  getBenefits (subset público); el panel usa estos para no contaminar el público en el mismo tab. */
  getAdminBanners(): Banner[]
  getAdminNotas(): Nota[]
  getAdminBenefits(): Benefit[]
  /** Contenido para el panel: sin el gate de socio (el organizador debe ver el youtubeId real). */
  getAdminContents(): ContentItem[]
  /** Eventos para el panel: incluye los BORRADORES, que la ruta pública ni siquiera devuelve. */
  getAdminEvents(): EventItem[]
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
  /** TODAS las postulaciones (vista del organizador). */
  getApplications(): Application[]
  /** Postulaciones para el PANEL. null = no hidratado o falló; nunca cae al seed, porque
   *  mostrar postulaciones de demo como si fueran reales es peor que no mostrar nada. */
  getAdminApplications(): Application[] | null
  applicationsFailed(): boolean
  /** Solo las del PROPIO device ("Mis postulaciones" / guard "ya te postulaste"). NUNCA la
   *  lista admin, aunque haya sesión de organizador en la misma pestaña. */
  getMyApplications(): Application[]
  /** Decide una postulación. `preinscripta` como destino es "volver a revisión" (deshacer). */
  decideApplication(
    applicationId: string,
    status: ApplicationStatus,
    opts?: { note?: string; skipEmail?: boolean },
  ): void

  /* Analytics */
  track(event: string, payload?: Record<string, unknown>): void
  getAnalytics(): AnalyticsEvent[]

  /**
   * Métricas del Dashboard, calculadas por el BACKEND sobre las tablas de negocio.
   *
   * Devuelve null cuando no hay backend (modo demo) o cuando el fetch todavía no
   * resolvió. Deliberadamente NO cae al seed: un número fabricado presentado como
   * real es peor que un estado vacío — el Dashboard anterior mostraba ~1200
   * registrados inventados cuando el fetch fallaba, y nadie podía notarlo.
   */
  getAdminStats(): AdminStats | null
  /** Pide las métricas de nuevo. El Dashboard la llama al montar: cada entrada trae datos frescos. */
  refetchAdminStats(): void
  /** true si el último intento falló. Distingue "el backend no respondió" de "no hay datos":
   *  se ven igual (ambos sin números) y significan lo contrario. */
  statsFailed(): boolean
  /**
   * ¿Hay un backend detrás de este store? false en la demo (LocalDataStore, sin VITE_API_URL).
   *
   * Sin esto, getAdminStats() === null es ambiguo: puede ser "todavía estoy trayendo" o
   * "no hay a quién preguntarle". El Dashboard los pintaba igual, así que en la demo —el
   * artefacto que se muestra en las reuniones— el panel quedaba en "Calculando métricas…"
   * para siempre, simulando una carga que nunca iba a resolver.
   */
  hasBackend(): boolean

  /**
   * Re-hidrata los recursos con vista admin (notas/banners/beneficios) tras loguear el
   * organizador, para que el panel vea borradores/ocultos/códigos sin recargar. No-op local.
   */
  refetchAdminScoped(): void

  /* Cobros con Mercado Pago (panel del organizador). */
  getMpStatus(): MpStatus | undefined
  connectMp(): Promise<string>
  disconnectMp(): Promise<void>

  /**
   * Cobros con Mercado Pago (comprador). Pide el link de pago REAL para un CARRITO de recursos
   * (varias órdenes = UNA sola preferencia de MP, cobrando el total). El monto lo calcula el
   * server con el precio vigente y nunca viaja en el pedido; vuelve en `amount` para que el
   * llamador pueda verificar que coincide con lo que le mostró al comprador ANTES de redirigir.
   *
   * Devuelve null si Mercado Pago no está conectado (503) o si el checkout no se pudo generar.
   *
   * ⚠️ Puede TIRAR un ApiError con code `COBRO_SOLAPADO`: alguna de esas órdenes ya está adentro
   * de otro pago en curso. Eso NO se resuelve solo (a diferencia de `CHECKOUT_EN_CURSO`, que se
   * reintenta acá adentro), así que el llamador tiene que decidir qué hacer — `err.details` trae
   * el `initPoint` de ese pago para ofrecer "retomar el pago en curso".
   */
  startCheckout(items: CheckoutItem[]): Promise<{ initPoint: string; amount: number } | null>

  /**
   * Inscriptos REALES de un evento (todos los dispositivos), para el panel.
   *
   * Es async y va contra el server a propósito: `getRegistrations()` es device-scoped y usarlo
   * en el panel mostraba sólo las inscripciones del teléfono desde el que se miraba — o sea
   * casi siempre una lista vacía que se lee como "no se anotó nadie".
   */
  fetchInscriptos(eventId: string): Promise<InscriptoAdmin[]>

  /**
   * Entrada regalada — lado del invitado (pantalla /i/:token del mail).
   *
   * `previewGrant` NO activa nada: es la lectura que arma la pantalla ("te regalaron…"). Va contra
   * el server pero no exige identidad de device. `claimGrant` SÍ activa: asegura primero el token
   * del dispositivo (lo emite si el invitado nunca abrió la app) y recién ahí materializa la
   * inscripción. Ambos son idempotentes del lado del server; reabrir el link no duplica nada.
   *
   * En la demo sin backend (LocalDataStore) devuelven `{ ok:false, motivo:'no_existe' }`: no hay
   * regalos reales que resolver, y así la pantalla degrada a "link inválido" en vez de romperse.
   */
  previewGrant(grantId: string, token: string): Promise<GrantPreview>
  claimGrant(grantId: string, token: string): Promise<GrantClaim>
}
