import { LocalDataStore, K } from './LocalDataStore'
import type {
  BlockAvailability,
  CheckoutItem,
  PhotoDownload,
  NewEvent,
  NewBlock,
  NewPlan,
  NewContent,
  NewSponsor,
  NewGallery,
  NewCatalogProfile,
  NewConvocatoria,
  NewCampaign,
  HydratableResource,
} from './DataStore'
import { slugify } from './overlay'
import { newId, writeJSON } from '../../lib/storage'
import { createApi, ApiError, type ApiClient } from '../../lib/api'
import { bus } from '../../lib/bus'
import { hydrateFromRemote, getDeviceToken, setDeviceCredentials, displayName } from '../../lib/identity'
import { hasAdminToken } from '../adminSession'
import type {
  DeviceProfile,
  ProfileFieldKey,
  EventItem,
  EventBlock,
  Registration,
  CatalogProfile,
  Gallery,
  ContentItem,
  Sponsor,
  TicketPlan,
  Convocatoria,
  Application,
  Membership,
  Benefit,
  NewBenefit,
  Banner,
  NewBanner,
  Nota,
  NewNota,
  PlanId,
  ApplicationStatus,
  AnalyticsEvent,
  AdminStats,
  MpStatus,
  TicketOrder,
  AdCampaign,
  OrderStatus,
  AdSlot,
  InscriptoAdmin,
} from '../types'

interface BufferedEvent {
  event: string
  payload?: Record<string, unknown>
  ts: string
}

/**
 * Store contra el backend real. Extiende LocalDataStore por historia — arrancó sobreescribiendo
 * sólo identidad y analytics — pero hoy le sobreescribe casi toda la superficie: eventos, bloques,
 * cupo, órdenes, catálogo, contenido, notas, banners, beneficios, convocatorias, postulaciones y
 * campañas. De la base siguen en uso los helpers y las lecturas device-scoped (ver la REGLA de
 * abajo). La interfaz sigue SÍNCRONA: el caché local da las lecturas al instante y el bus mantiene
 * la reactividad; el backend recibe escrituras en segundo plano. Si no hay VITE_API_URL, ni se
 * instancia esta clase (index.ts cae a LocalDataStore).
 *
 * REGLA: acá NINGUNA lectura cae al seed. Que esta clase exista significa que hay backend real
 * (hasBackend() === true), y el seed es el contenido de la DEMO: sponsors ficticios, agenda
 * inventada, 6400 eventos de analítica fabricados. Servirlo mezclado con lo que devuelve la base
 * es indistinguible de lo real — la app mostró cuatro sponsors inventados CON banner mientras se
 * resolvía /sponsors, y para siempre cuando el pedido fallaba. Cuando el caché está vacío se
 * devuelve vacío; el fallo queda registrado (hydrationFailed) para que la UI pueda decirlo.
 * Sí siguen cayendo a `super` las lecturas device-scoped con write-through (inscripciones,
 * favoritos, descargas, membresía): ahí `super` lee el último snapshot REAL del server, no el seed.
 */
export class RemoteDataStore extends LocalDataStore {
  private readonly api: ApiClient
  private buffer: BufferedEvent[] = []
  private flushHandle: ReturnType<typeof setTimeout> | null = null

  // Caché de Fase B (eventos/bloques/inscripciones/cupo) hidratado del backend.
  private events?: EventItem[]
  private blocksByEvent = new Map<string, EventBlock[]>()
  private blocksById = new Map<string, EventBlock>()
  private regs?: Registration[]
  private availCache = new Map<string, BlockAvailability>()
  private availInflight = new Set<string>()
  /** Negative cache: ms timestamp del último fallo por blockId. Re-intenta después de 30s. */
  private availFailed = new Map<string, number>()
  /** Cache de batch availability por eventId (GET /events/:id/blocks-availability). */
  /** Cuándo se trajo cada cupo (ms). Sirve para vencerlo: ver blockAvailability. */
  private availFetchedAt = new Map<string, number>()
  /** El cupo se considera fresco 20s; pasado eso se revalida en segundo plano. */
  private static readonly AVAIL_TTL_MS = 20_000
  private availBatchInflight = new Set<string>()
  private availBatchFailed = new Map<string, number>()
  private tmpSeq = 0
  // Provisionales (tmp_) cancelados mientras su POST seguía en vuelo: cuando el POST resuelve
  // con el id real del server, hay que borrarlo (si no, queda una inscripción fantasma que
  // consume cupo y el usuario no puede cancelar porque ya no está en su lista local).
  private cancelledTmp = new Set<string>()

  // Caché de Fase E (catálogo / galerías / contenido / favoritos / descargas).
  private catalog?: CatalogProfile[]
  private galleries?: Gallery[]
  private contents?: ContentItem[]
  private favorites?: string[]
  private downloads?: PhotoDownload[]
  // Resto de Fase G: sponsors / planes / convocatorias / postulaciones.
  private sponsors?: Sponsor[]
  private plans?: TicketPlan[]
  private applications?: Application[] // device-scoped ("Mis postulaciones")
  private adminApplications?: Application[] // admin-scoped (panel del organizador) — caché SEPARADO
  // true si el último intento de hidratar adminApplications falló. Sin fallback al seed a
  // propósito: mostrar postulaciones de demo como si fueran reales es peor que no mostrar nada.
  private appsError = false
  private membership?: Membership
  private benefits?: Benefit[]
  private banners?: Banner[]
  private notas?: Nota[]
  // Cachés ADMIN separados del público (#19): las vistas públicas NO deben ver borradores/ocultos/
  // códigos del organizador tras loguearse en el mismo tab. this.X = público (siempre /X);
  // this.adminX = admin (/admin/X), lo leen SOLO las páginas admin vía getAdminX().
  private adminBenefits?: Benefit[]
  private adminBanners?: Banner[]
  private adminNotas?: Nota[]
  private adminContents?: ContentItem[] // /admin/contents: sin gate de socio (el panel debe ver el youtubeId)
  private adminEvents?: EventItem[] // /admin/events: incluye BORRADORES, que la ruta pública no devuelve
  private adminPlans?: TicketPlan[] // /admin/plans: incluye RETIRADAS de la venta, que /plans no devuelve
  private draftBlocksInflight = new Set<string>() // evita pedir dos veces la agenda del mismo borrador
  private analytics?: AnalyticsEvent[] // analítica real cross-device (GET /admin/analytics), P1
  // Métricas del Dashboard (GET /admin/stats). Sin fallback al seed a propósito.
  private adminStats?: AdminStats
  private statsInflight = false
  private statsError = false
  private generalCounts = new Map<string, number>() // inscripciones generales server-wide por evento (#13)
  private generalInflight = new Set<string>()
  /** Negative cache: ms timestamp del último fallo de general-count por eventId. */
  private generalFailed = new Map<string, number>()
  private static readonly FETCH_RETRY_MS = 30_000 // backoff 30s para fetches fallidos
  private convocatorias = new Map<string, Convocatoria>()
  private convoInflight = new Set<string>()
  /** Negative cache: ms timestamp del último fallo de /convocatorias/:slug. Espeja availFailed y
   *  generalFailed. Sin esto, emitir al bus tras un fallo re-dispararía el GET en cada render. */
  private convoFailed = new Map<string, number>()
  private convocatoriasList?: Convocatoria[] // lista admin (GET /admin/convocatorias)
  // Estado de la conexión con Mercado Pago (panel del organizador). Sin fallback al seed: no
  // conectado es el default seguro mientras no se sepa qué contesta el backend.
  private mpStatus?: MpStatus
  // Recursos cuya última hidratación FALLÓ. Ahora que las lecturas no caen al seed, un caché vacío
  // ya no distingue "todavía no llegó" de "no se pudo traer": sin este registro, isHydrating se
  // quedaría en true para siempre y la pantalla giraría eternamente en vez de mostrar su estado
  // vacío. Espeja statsError/appsError, que hacen lo mismo para stats y postulaciones.
  // Tipado con HydratableResource y no con la clave del bus: isHydrating es el único lector y sólo
  // sabe contestar por esos cuatro (ver markHydration).
  private hydrationFailed = new Set<HydratableResource>()

  constructor(apiBase: string) {
    super()
    this.api = createApi(apiBase)
    // Hidratación PÚBLICA: arranca ya (no necesita identidad).
    this.hydrateEvents()
    this.hydratePublicContent()
    this.hydrateCampaigns() // públicas: ocupan espacios publicitarios en toda la app
    // Hidratación del DEVICE: primero asegura el token firmado (POST /devices si falta),
    // recién después pide /me, /registrations, /favorites, /downloads (requireDevice).
    void this.ensureDeviceToken().then(() => {
      this.hydrateProfile()
      this.hydrateRegistrations()
      this.hydrateDeviceContent()
      this.hydrateMembership()
      this.hydrateApplications() // device ("Mis postulaciones")
      this.hydrateOrders() // device ("Mis entradas")
      // Si ya hay sesión de organizador (token guardado al recargar), hidratar TODOS los cachés
      // admin. `refetchAdminScoped()` es el mismo método que corre al loguearse, así que recargar
      // la página deja el panel en el mismo estado que recién logueado.
      //
      // Antes acá se hidrataban solo applications y analytics: los otros cuatro cachés
      // (notas, beneficios, banners, convocatorias) quedaban `undefined` tras un F5 y, como
      // create/update/delete hacen `if (!this.adminX) return super.X()`, cada alta caía en
      // localStorage con cartel de éxito. El organizador cargaba una nota, la veía en la lista
      // y no llegaba nunca al backend. Llamar al método agrupado evita que vuelva a pasar
      // cuando se sume un séptimo caché.
      if (hasAdminToken()) {
        this.refetchAdminScoped()
      }
      this.hydrateBenefits()
      // Re-fetch de /contents YA CON el device token: el backend gatea el youtubeId de los videos
      // socioOnly según la membresía. El fetch público inicial pudo ir sin token (device nuevo) →
      // socios verían su contenido enmascarado hasta este re-fetch.
      this.refetchContents()
    })
    if (typeof window !== 'undefined') {
      const flush = () => this.flush()
      window.addEventListener('pagehide', flush)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush()
      })
    }
  }

  /** Asegura la identidad: si no hay token guardado, lo pide al backend (POST /devices). */
  private async ensureDeviceToken(): Promise<void> {
    if (getDeviceToken()) return
    try {
      const res = await this.api.post<{ deviceId: string; token: string }>('/devices', {})
      setDeviceCredentials(res.deviceId, res.token)
    } catch {
      /* sin token (backend caído): las rutas device-scoped quedan en local hasta el próximo arranque */
    }
  }

  /* ─── Fase B: hidratación + lecturas desde caché ─── */

  /** Bootstrap con /events/with-blocks (1 query vs 1+N); fallback a /events + N bloques
   *  si el endpoint no existe aún en prod (deploy incremental seguro). */
  private hydrateEvents(): void {
    this.api
      .get<(EventItem & { blocks: EventBlock[] })[]>('/events/with-blocks')
      .then((eventsWithBlocks) => {
        this.hydrationFailed.delete('events')
        this.events = eventsWithBlocks.map(({ blocks: _b, ...e }) => e as EventItem)
        for (const e of eventsWithBlocks) {
          this.blocksByEvent.set(e.id, e.blocks)
          for (const b of e.blocks) this.blocksById.set(b.id, b)
        }
        bus.emit('events')
        bus.emit('blocks')
      })
      .catch(() => this.hydrateEventsFallback())
  }

  /** Fallback para deploy incremental: /events + N GET /events/:id/blocks. */
  private hydrateEventsFallback(): void {
    this.api
      .get<EventItem[]>('/events')
      .then(async (events) => {
        this.hydrationFailed.delete('events')
        this.events = events
        bus.emit('events')
        await Promise.all(
          events.map(async (e) => {
            try {
              const blocks = await this.api.get<EventBlock[]>(`/events/${e.id}/blocks`)
              this.blocksByEvent.set(e.id, blocks)
              for (const b of blocks) this.blocksById.set(b.id, b)
            } catch {
              /* ignore */
            }
          }),
        )
        bus.emit('blocks')
      })
      .catch(() => {
        // Backend caído: la agenda queda VACÍA, no con la del seed. Se anota para que
        // isHydrating deje de decir "cargando" y la pantalla muestre su estado vacío.
        this.hydrationFailed.add('events')
        bus.emit('events')
      })
  }

  private hydrateRegistrations(): void {
    this.api
      .get<Registration[]>('/registrations')
      .then((regs) => {
        // Preservar los provisionales (tmp_) con POST en vuelo: si el usuario se inscribió durante
        // la ventana de hidratación, no pisarlos con la lista del server (el .then los reconcilia).
        const inflight = (this.regs ?? []).filter((r) => r.id.startsWith('tmp_'))
        this.regs = [...regs, ...inflight]
        // Write-through: el caché de este store es memoria pura y se hidrata una sola vez. Si el
        // próximo arranque no tiene red, la lectura cae al fallback de LocalDataStore, que lee
        // esta misma clave — sin espejarla, devuelve [] y el asistente ve "todavía no tenés tu QR"
        // estando inscripto. Guardamos el último snapshot real del server.
        writeJSON(K.registrations, regs)
        bus.emit('registrations')
      })
      .catch(() => {})
  }

  /** Cupo de TODOS los bloques de un evento en 1 request (vs N).
   *  Llamado desde blockAvailability cuando conocemos el eventId.
   *  Negative cache: si el endpoint 404ea o falla, espera 30s antes de reintentar. */
  /** Trae el cupo de todos los bloques del evento. Deduplica sola (availBatchInflight) y respeta
   *  el backoff de errores, así que es segura de llamar tanto en el primer render como al revalidar. */
  private fetchEventAvailability(eventId: string): void {
    if (this.availBatchInflight.has(eventId)) return
    const failed = this.availBatchFailed.get(eventId)
    if (failed && Date.now() - failed < RemoteDataStore.FETCH_RETRY_MS) return
    this.availBatchInflight.add(eventId)
    this.api
      .get<{ blocks: (BlockAvailability & { id: string })[]; generals: number }>(`/events/${eventId}/blocks-availability`)
      .then((r) => {
        const ahora = Date.now()
        for (const b of r.blocks) { this.availCache.set(b.id, b); this.availFetchedAt.set(b.id, ahora) }
        this.generalCounts.set(eventId, r.generals)
        this.availBatchInflight.delete(eventId)
        this.availBatchFailed.delete(eventId)
        bus.emit('availability')
      })
      .catch(() => {
        this.availBatchInflight.delete(eventId)
        this.availBatchFailed.set(eventId, Date.now())
        // Fallback: fetch individuales (p.ej. si endpoint no deployado aún)
        const blocks = this.blocksByEvent.get(eventId) ?? []
        for (const b of blocks) this.fetchAvailability(b.id)
      })
  }

  /** Fetch individual de cupo (fallback / rutas fuera de admin). */
  private fetchAvailability(blockId: string): void {
    if (this.availInflight.has(blockId)) return
    // Negative cache: no re-disparar si el endpoint falló hace menos de 30s.
    const failed = this.availFailed.get(blockId)
    if (failed && Date.now() - failed < RemoteDataStore.FETCH_RETRY_MS) return
    this.availInflight.add(blockId)
    this.api
      .get<BlockAvailability>(`/blocks/${blockId}/availability`)
      .then((av) => {
        this.availCache.set(blockId, av)
        this.availFetchedAt.set(blockId, Date.now())
        this.availInflight.delete(blockId)
        this.availFailed.delete(blockId)
        bus.emit('availability')
      })
      .catch(() => {
        this.availInflight.delete(blockId)
        this.availFailed.set(blockId, Date.now())
      })
  }

  private refreshAvailability(blockId?: string): void {
    if (!blockId) return
    this.availInflight.delete(blockId) // permite re-fetch
    this.fetchAvailability(blockId)
  }


  /* ─────────────────────────────────────────────────────────────────────────────────────────
   *  CONTENIDO PÚBLICO: nunca cae al seed
   *
   *  RemoteDataStore extiende LocalDataStore, así que `super.getX()` devuelve los datos de
   *  DEMOSTRACIÓN — que van compilados adentro del bundle que descarga cada visitante. Mientras
   *  el fallback existió, cualquier fallo de hidratación (wifi saturada, un 500, el server
   *  arrancando) hacía que la app renderizara disertantes inventados, marcas que no existen y
   *  cupos falsos. Y como el service worker precachea el armazón, cargaba impecable: sin error,
   *  sin spinner, sin ninguna señal. Se veía llena y mentía. Limpiar la base no lo arreglaba,
   *  porque el dato falso nunca venía de la base.
   *
   *  Ahora estas lecturas devuelven VACÍO hasta que el server conteste. Mostrar nada es peor
   *  para la foto y mucho mejor para la verdad; las páginas que lo necesitan ya distinguen
   *  "cargando" de "no hay" con isHydrating().
   *
   *  Las lecturas de abajo que SÍ conservan `super` son las del propio dispositivo (inscripciones,
   *  favoritos, descargas, membresía, órdenes): ahí `super` no es el seed, es el localStorage de
   *  esta persona, que es un dato legítimo suyo.
   * ───────────────────────────────────────────────────────────────────────────────────────── */
  override getEvents(): EventItem[] {
    return this.events ?? []
  }
  override getEvent(slug: string): EventItem | undefined {
    return this.events?.find((e) => e.slug === slug)
  }
  override getEventById(id: string): EventItem | undefined {
    return this.events?.find((e) => e.id === id)
  }
  override getBlocks(eventId: string): EventBlock[] {
    return this.blocksByEvent.get(eventId) ?? []
  }
  override getBlock(blockId: string): EventBlock | undefined {
    return this.blocksById.get(blockId)
  }
  override blockAvailability(blockId: string): BlockAvailability {
    const cached = this.availCache.get(blockId)
    // Batch preferido: si conocemos el eventId usamos /events/:id/blocks-availability (1 req/evento).
    // Fallback: fetch individual (deploy incremental / bloque desconocido aún).
    const block = this.blocksById.get(blockId)

    if (cached) {
      // El cupo lo mueven OTRAS personas, así que un caché sin vencimiento congelaba el número:
      // la pantalla decía "quedan 3 lugares" indefinidamente aunque el bloque ya estuviera lleno,
      // y solo se actualizaba si ESTE usuario se inscribía o cancelaba. Servimos lo que tenemos
      // (respuesta instantánea) y disparamos la actualización en segundo plano si está vencido.
      const edad = Date.now() - (this.availFetchedAt.get(blockId) ?? 0)
      if (edad > RemoteDataStore.AVAIL_TTL_MS) {
        if (block) this.fetchEventAvailability(block.eventId)
        else this.refreshAvailability(blockId)
      }
      return cached
    }

    if (block) {
      this.fetchEventAvailability(block.eventId)
    } else {
      this.fetchAvailability(blockId)
    }
    return super.blockAvailability(blockId)
  }
  /** true mientras el fetch del recurso siga en vuelo → las páginas :slug distinguen "cargando"
   *  de "no existe" y no flashean el EmptyState de "link vencido" (#20). */
  override isHydrating(resource: HydratableResource): boolean {
    // Si el pedido falló ya no está "cargando": el caché va a seguir vacío para siempre y, sin
    // esto, la pantalla giraría eternamente en vez de mostrar que no hay nada para mostrar.
    if (this.hydrationFailed.has(resource)) return false
    switch (resource) {
      case 'events': return this.events === undefined
      case 'catalog': return this.catalog === undefined
      case 'galleries': return this.galleries === undefined
      case 'notas': return this.notas === undefined
      // Las convocatorias se piden de a una por slug (no en bloque), así que "hidratando" es
      // "hay algún GET en vuelo": sin esto /c/:slug pintaba "No encontramos esta convocatoria"
      // en TODAS las cargas, también las que después resolvían bien.
      case 'convocatoria': return this.convoInflight.size > 0
    }
  }
  /** Inscripciones generales (sin bloque) server-wide de un evento (#13). getRegistrations es
   *  device-scoped; esto agrega todos los devices (stale-while-revalidate, espeja blockAvailability).
   *  Si hay bloques cargados para el evento, usa fetchEventAvailability (batch) para obtener
   *  generals + avail de todos los bloques en 1 request. */
  override generalRegistrationCount(eventId: string): number | null {
    const cached = this.generalCounts.get(eventId)
    if (cached !== undefined) return cached
    // Preferir batch si ya tenemos bloques del evento; si no, fallback individual.
    if (this.blocksByEvent.has(eventId)) {
      this.fetchEventAvailability(eventId)
    } else {
      this.fetchGeneralCount(eventId)
    }
    // NO caer a super: ahí se cuentan las inscripciones de ESTE dispositivo, que para el panel
    // no son el total de nadie — típicamente 0, y un 0 se lee como "no se anotó nadie" en vez de
    // "todavía no sé". Un evento en borrador nunca sale de este camino: la ruta pública lo 404ea.
    return null
  }
  private fetchGeneralCount(eventId: string): void {
    if (this.generalInflight.has(eventId)) return
    // Negative cache: si 404ea (endpoint no deployado), esperar 30s antes de reintentar.
    const failed = this.generalFailed.get(eventId)
    if (failed && Date.now() - failed < RemoteDataStore.FETCH_RETRY_MS) return
    this.generalInflight.add(eventId)
    this.api
      .get<{ general: number }>(`/events/${eventId}/general-count`)
      .then((r) => {
        this.generalCounts.set(eventId, r.general)
        this.generalInflight.delete(eventId)
        this.generalFailed.delete(eventId)
        bus.emit('registrations')
      })
      .catch(() => {
        this.generalInflight.delete(eventId)
        this.generalFailed.set(eventId, Date.now())
      })
  }
  override getRegistrations(): Registration[] {
    return this.regs ?? super.getRegistrations()
  }
  override isRegistered(eventId: string, blockId?: string): boolean {
    if (!this.regs) return super.isRegistered(eventId, blockId)
    return this.regs.some(
      (r) =>
        r.status === 'confirmada' &&
        r.eventId === eventId &&
        (blockId === undefined ? !r.blockId : r.blockId === blockId),
    )
  }

  /**
   * Inscripción optimista (doc 10 §3): el cupo real lo decide el SERVER. Pre-chequeo
   * con la disponibilidad cacheada; si hay lugar, agrega la inscripción provisional y
   * dispara el POST. Si el server responde 409 (lleno / ya inscripto), se REVIERTE.
   */
  override register(eventId: string, blockId?: string): Registration | null {
    // Antes: si aún no hidrató, caía a super (localStorage, SIN POST) → falso éxito + inscripción
    // perdida en la ventana de arranque. Ahora seguimos el path optimista con lista vacía y SÍ
    // pegamos el POST — el server es la fuente de verdad; si está caído, el catch revierte+avisa.
    this.regs = this.regs ?? []
    const existing = this.regs.find(
      (r) =>
        r.status === 'confirmada' &&
        r.eventId === eventId &&
        (blockId === undefined ? !r.blockId : r.blockId === blockId),
    )
    if (existing) return existing
    if (blockId && this.availCache.get(blockId)?.full) return null

    const provisional: Registration = {
      id: `tmp_${++this.tmpSeq}`,
      eventId,
      ...(blockId ? { blockId } : {}),
      ts: new Date().toISOString(),
      status: 'confirmada',
    }
    this.regs = [...this.regs, provisional]
    bus.emit('registrations')

    this.api
      .post<Registration>('/registrations', { eventId, ...(blockId ? { blockId } : {}) })
      .then((server) => {
        // Si el usuario canceló el provisional mientras el POST volaba, la fila ya se sacó de
        // this.regs pero la inscripción quedó creada en el server → borrarla ahora (anti-fantasma).
        if (this.cancelledTmp.delete(provisional.id)) {
          this.api.del(`/registrations/${server.id}`).catch(() => {})
          this.refreshAvailability(blockId)
          return
        }
        this.regs = (this.regs ?? []).map((r) => (r.id === provisional.id ? server : r))
        this.refreshAvailability(blockId)
        bus.emit('registrations')
        // Al pasar a "inscripto", el backend recién ahora sirve los CÓDIGOS de beneficio
        // (benefitService los gatea por inscripción confirmada). Sin esta re-hidratación el
        // caché queda stale toda la sesión y el código nunca aparece hasta recargar la PWA.
        this.hydrateBenefits()
      })
      .catch(() => {
        // 409 lleno / ya inscripto / 403 socio → revertir el provisional y AVISAR (antes el
        // rechazo era silencioso: el usuario veía "confirmada ✓" pero quedaba afuera).
        this.regs = (this.regs ?? []).filter((r) => r.id !== provisional.id)
        this.refreshAvailability(blockId)
        bus.emit('registrations')
        bus.emit('registration:rejected', { eventId, ...(blockId ? { blockId } : {}) })
      })

    return provisional
  }

  override cancelRegistration(registrationId: string): void {
    if (!this.regs) {
      super.cancelRegistration(registrationId)
      return
    }
    const reg = this.regs.find((r) => r.id === registrationId)
    this.regs = this.regs.filter((r) => r.id !== registrationId)
    bus.emit('registrations')
    if (reg && registrationId.startsWith('tmp_')) {
      // Provisional con POST todavía en vuelo: no hay id real para borrar aún. Lo marcamos y el
      // .then del register lo borra en cuanto llega el server (evita la inscripción fantasma).
      this.cancelledTmp.add(registrationId)
    } else if (reg) {
      this.api.del(`/registrations/${registrationId}`).catch(() => {})
      this.refreshAvailability(reg.blockId ?? undefined)
    }
  }

  /** Trae el perfil persistido del backend al caché local (perfil cross-device). */
  private hydrateProfile(): void {
    this.api
      .get<DeviceProfile>('/me')
      .then((remote) => {
        hydrateFromRemote(remote)
        bus.emit('profile')
      })
      .catch(() => {
        /* device nuevo o backend caído: seguimos con el perfil local */
      })
  }

  override track(event: string, payload?: Record<string, unknown>): void {
    // En RemoteDataStore NO llamamos super.track() (que hace read-parse-push-write O(N) sobre
    // el historial de analytics local en cada evento). En prod el backend es la fuente de
    // verdad; getAnalytics() ya apunta al caché del backend, no al localStorage.
    // El bus.emit('analytics') mantiene la reactividad del Dashboard en la misma sesión.
    this.buffer.push({ event, ...(payload ? { payload } : {}), ts: new Date().toISOString() })
    this.scheduleFlush()
    bus.emit('analytics')
  }

  override saveProfileFields(values: Partial<Record<ProfileFieldKey, string>>, source: string): void {
    super.saveProfileFields(values, source) // local + track profile_field_captured (→ buffer)
    this.api.patch('/me/fields', { values, source }).catch(() => {})
  }

  override saveConsents(consents: { terms?: boolean; news?: boolean; sponsors?: boolean }): void {
    super.saveConsents(consents)
    this.api.patch('/me/consents', consents).catch(() => {})
  }

  /* ─── Fase E: catálogo / galerías / contenido / favoritos / descargas ─── */

  /** Contenido PÚBLICO (no requiere identidad): catálogo, galerías, contenidos, sponsors, planes. */
  private hydratePublicContent(): void {
    this.refetch<CatalogProfile[]>('/catalog', (c) => (this.catalog = c), 'catalog')
    this.refetch<Gallery[]>('/galleries', (g) => (this.galleries = g), 'galleries')
    this.refetch<ContentItem[]>('/contents', (c) => (this.contents = c), 'contents')
    this.refetch<Sponsor[]>('/sponsors', (s) => (this.sponsors = s), 'sponsors')
    this.refetch<TicketPlan[]>('/plans', (p) => (this.plans = p), 'plans')
    this.hydrateBanners()
    this.hydrateNotas()
  }

  /** Tras loguear el organizador, re-trae notas/banners/beneficios con vista admin
   *  (borradores/ocultos/códigos) — antes el panel mostraba el subset público hasta recargar. */
  override refetchAdminScoped(): void {
    // Cachés ADMIN aparte (los públicos this.benefits/banners/notas siguen públicos → no se
    // contaminan las vistas públicas en el mismo tab, #19).
    this.hydrateAdminBenefits()
    this.hydrateAdminBanners()
    this.hydrateAdminNotas()
    this.hydrateAdminApplications() // lista COMPLETA en un caché aparte (no pisa las del device)
    this.hydrateConvocatorias() // lista completa para gestionarlas (antes solo venían del seed)
    this.hydrateAdminContents() // youtubeId sin enmascarar para el panel
    this.hydrateAdminEvents() // el panel ve también lo que todavía no se publicó
    this.hydrateAdminPlans() // el panel ve también las entradas retiradas de la venta
    this.hydrateAdminOrders() // todas las órdenes, no solo las del navegador del organizador
    this.hydrateAnalytics() // analítica REAL — antes Dashboard/SponsorReport leían el seed fabricado (P1)
    this.hydrateMpStatus() // conexión con Mercado Pago (Tarea 6)
  }

  /** Analítica real cross-device (admin-scoped). getAnalytics nunca sirve el seed (~6400 eventos
   *  fabricados): el reporte que se le muestra a un sponsor son números reales o ninguno. */
  private hydrateAnalytics(): void {
    this.refetch<AnalyticsEvent[]>('/admin/analytics', (a) => (this.analytics = a), 'analytics')
  }
  override getAnalytics(): AnalyticsEvent[] {
    return this.analytics ?? []
  }

  /**
   * Métricas del Dashboard (GET /admin/stats), calculadas por el backend sobre las tablas.
   *
   * Ninguna lectura de esta clase cae al seed, pero acá no alcanza con devolver el vacío: un
   * tablero de ceros se lee como un dato ("no hubo inscripciones") y no como una ausencia.
   * Devolver null, más statsFailed(), deja que el Dashboard distinga "cargando" de "falló" de
   * "no hay nada".
   */
  override getAdminStats(): AdminStats | null {
    return this.adminStats ?? null
  }

  /** Re-pide las métricas. La llama el Dashboard al montar, así cada entrada trae datos
   *  frescos sin necesidad de polling ni de recargar la página entera. */
  override refetchAdminStats(): void {
    if (this.statsInflight) return
    this.statsInflight = true
    this.api
      .get<AdminStats>('/admin/stats')
      .then((s) => {
        this.adminStats = s
        this.statsError = false
      })
      .catch(() => {
        // El error se EXPONE (no se traga en un catch vacío como hacía hydrateAnalytics):
        // si el backend no responde, el Dashboard tiene que decirlo, no mostrar ceros.
        this.statsError = true
      })
      .finally(() => {
        this.statsInflight = false
        bus.emit('adminStats')
      })
  }

  /** true si el último intento falló → el Dashboard muestra el error en vez de un cero. */
  override statsFailed(): boolean {
    return this.statsError
  }

  /** Esta clase solo se instancia si hay VITE_API_URL, así que si existe, hay backend. */
  override hasBackend(): boolean {
    return true
  }

  private hydrateConvocatorias(): void {
    this.refetch<Convocatoria[]>('/admin/convocatorias', (v) => (this.convocatoriasList = v), 'convocatorias')
  }

  /* ─── Notas. Público (this.notas ← /notas) separado de admin (this.adminNotas ← /admin/notas):
   *  las vistas públicas nunca ven borradores del organizador (#19). ─── */
  private hydrateNotas(): void {
    this.refetch<Nota[]>('/notas', (n) => (this.notas = n), 'notas')
  }
  private hydrateAdminNotas(): void {
    this.api.get<Nota[]>('/admin/notas').then((n) => { this.adminNotas = n; bus.emit('notas') }).catch(() => {})
  }
  private refetchNotas(): void { this.hydrateNotas(); this.hydrateAdminNotas() }
  override getNotas(): Nota[] {
    return this.notas ?? []
  }
  override getNota(slug: string): Nota | undefined {
    return this.notas?.find((n) => n.slug === slug)
  }
  override getAdminNotas(): Nota[] {
    return this.adminNotas ?? []
  }
  override createNota(input: NewNota): Nota {
    const prevCache = this.adminNotas // para deshacer si el backend rechaza
    const taken = new Set((this.adminNotas ?? []).map((n) => n.slug))
    const base = input.slug || slugify(input.title)
    let slug = base
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
    const nota: Nota = { ...input, id: newId('nota'), slug }
    if (this.adminNotas) this.adminNotas = [nota, ...this.adminNotas]
    this.track('admin_nota_created', { notaId: nota.id })
    bus.emit('notas')
    this.adminWrite(this.api.post('/admin/notas', nota), () => this.refetchNotas(),
      () => { this.adminNotas = prevCache; bus.emit('notas') },
    )
    return nota
  }
  override updateNota(id: string, patch: Partial<Nota>): void {
    const prevCache = this.adminNotas // para deshacer si el backend rechaza
    if (this.adminNotas) this.adminNotas = this.adminNotas.map((n) => (n.id === id ? { ...n, ...patch } : n))
    this.track('admin_nota_updated', { notaId: id })
    bus.emit('notas')
    this.adminWrite(this.api.patch(`/admin/notas/${id}`, patch), () => this.refetchNotas(),
      () => { this.adminNotas = prevCache; bus.emit('notas') },
    )
  }
  override deleteNota(id: string): void {
    const prev = this.adminNotas
    if (this.adminNotas) this.adminNotas = this.adminNotas.filter((n) => n.id !== id)
    this.track('admin_nota_deleted', { notaId: id })
    bus.emit('notas')
    this.adminWrite(
      this.api.del(`/admin/notas/${id}`),
      () => this.refetchNotas(),
      () => { if (prev) this.adminNotas = prev; bus.emit('notas') },
    )
  }

  /* ─── Banners gestionados. Público (this.banners ← /banners) vs admin (this.adminBanners ←
   *  /admin/banners): las vistas públicas no ven banners inactivos del organizador (#19). ─── */
  private hydrateBanners(): void {
    this.refetch<Banner[]>('/banners', (b) => (this.banners = b), 'banners')
  }
  private hydrateAdminBanners(): void {
    this.api.get<Banner[]>('/admin/banners').then((b) => { this.adminBanners = b; bus.emit('banners') }).catch(() => {})
  }
  private refetchBanners(): void { this.hydrateBanners(); this.hydrateAdminBanners() }
  override getBanners(): Banner[] {
    return this.banners ?? []
  }
  override getAdminBanners(): Banner[] {
    return this.adminBanners ?? []
  }
  override createBanner(input: NewBanner): Banner {
    const prevCache = this.adminBanners // para deshacer si el backend rechaza
    const banner: Banner = { ...input, id: newId('bnr') }
    if (this.adminBanners) this.adminBanners = [...this.adminBanners, banner].sort((a, b) => a.order - b.order)
    this.track('admin_banner_created', { bannerId: banner.id, slot: banner.slot })
    bus.emit('banners')
    this.adminWrite(this.api.post('/admin/banners', banner), () => this.refetchBanners(),
      () => { this.adminBanners = prevCache; bus.emit('banners') },
    )
    return banner
  }
  override updateBanner(id: string, patch: Partial<Banner>): void {
    const prevCache = this.adminBanners // para deshacer si el backend rechaza
    if (this.adminBanners) this.adminBanners = this.adminBanners.map((b) => (b.id === id ? { ...b, ...patch } : b)).sort((a, b) => a.order - b.order)
    this.track('admin_banner_updated', { bannerId: id })
    bus.emit('banners')
    this.adminWrite(this.api.patch(`/admin/banners/${id}`, patch), () => this.refetchBanners(),
      () => { this.adminBanners = prevCache; bus.emit('banners') },
    )
  }
  override deleteBanner(id: string): void {
    const prev = this.adminBanners
    if (this.adminBanners) this.adminBanners = this.adminBanners.filter((b) => b.id !== id)
    this.track('admin_banner_deleted', { bannerId: id })
    bus.emit('banners')
    this.adminWrite(
      this.api.del(`/admin/banners/${id}`),
      () => this.refetchBanners(),
      () => { if (prev) this.adminBanners = prev; bus.emit('banners') },
    )
  }

  /** Contenido del DEVICE (requireDevice): favoritos y descargas. Corre tras tener el token. */
  private hydrateDeviceContent(): void {
    // writeJSON: mismo write-through que hydrateRegistrations — sin espejar, un arranque sin red
    // muestra los favoritos y las descargas vacíos (ver el comentario allá).
    this.api.get<string[]>('/favorites').then((f) => { this.favorites = f; writeJSON(K.favorites, f); bus.emit('favorites') }).catch(() => {})
    this.api.get<PhotoDownload[]>('/downloads').then((d) => { this.downloads = d; writeJSON(K.downloads, d); bus.emit('downloads') }).catch(() => {})
  }

  /* ─── Resto Fase G: sponsors / planes / convocatorias / postulaciones ─── */

  /** Trae un recurso al caché. El catch ANOTA el fallo en vez de tragárselo y emite igual: la
   *  lectura va a devolver vacío, así que la UI necesita poder distinguir "todavía no llegó"
   *  de "no se pudo traer" (ver isHydrating). */
  private refetch<T>(path: string, set: (v: T) => void, key: string): void {
    this.api.get<T>(path)
      .then((v) => { set(v); this.markHydration(key, false); bus.emit(key) })
      .catch(() => { this.markHydration(key, true); bus.emit(key) })
  }

  /** `refetch` recibe la clave del BUS, que tiene más valores que HydratableResource (sponsors,
   *  plans, benefits, banners, contents, convocatorias, analytics…). El resultado de esos otros
   *  no lo puede leer nadie: isHydrating es el único lector y su firma acepta cuatro. Cuando se
   *  sume un quinto recurso hidratable hay que tocar los dos lados: el switch de isHydrating y
   *  este guard. */
  private markHydration(key: string, failed: boolean): void {
    if (key !== 'events' && key !== 'catalog' && key !== 'galleries' && key !== 'notas') return
    if (failed) this.hydrationFailed.add(key)
    else this.hydrationFailed.delete(key)
  }

  /**
   * Cierra una escritura del organizador (alta/edición/baja contra /admin/*).
   *
   * Antes cada escritura hacía `.then(refetch).catch(refetch)`: si el backend rechazaba, el
   * ítem optimista desaparecía de la lista SIN decir nada, o —peor— el organizador se quedaba
   * con la sensación de haber guardado. Acá el error se avisa siempre (`admin:write-failed`,
   * lo levanta ToastHost) además de deshacer el optimismo.
   *
   * El aviso viaja CON el motivo que dio el backend. Los mensajes del server están escritos para
   * que los lea una persona —"No se puede borrar: tiene 12 inscripciones confirmadas", "Ya existe
   * un recurso con esa clave"— y son justo lo que permite corregir el problema. Sin pasarlos, el
   * organizador leía siempre "revisá la conexión", que además es falso cuando el server contestó
   * perfecto con un 409.
   *
   * @param onOk   qué re-hidratar cuando el backend confirma
   * @param onFail cómo deshacer lo optimista; si se omite, se re-hidrata (el server manda)
   */
  private adminWrite(p: Promise<unknown>, onOk: () => void, onFail?: () => void): void {
    p.then(() => onOk()).catch((err: unknown) => {
      ;(onFail ?? onOk)()
      // Sólo el mensaje que REALMENTE escribió el backend (serverMessage, no userMessage —que ya
      // trae su propio texto de reserva). Si el server no explicó nada, no mandamos ninguno y el
      // aviso usa el suyo, que está redactado para el panel; si mandáramos el de reserva del
      // cliente HTTP, ese genérico nunca se usaría.
      const message = err instanceof ApiError ? err.serverMessage : undefined
      bus.emit('admin:write-failed', message ? { message } : undefined)
    })
  }

  override getSponsors(): Sponsor[] {
    return this.sponsors ?? []
  }
  // getSponsor NO se sobreescribe: el de LocalDataStore ya busca sobre this.getSponsors() (o sea,
  // el de acá arriba, sin seed) y, si no está, resuelve el sponsor sintético de una campaña
  // autogestionada — que no es demo, la compró alguien. Sobreescribirlo perdía ese segundo camino.
  override getPlans(eventId?: string): TicketPlan[] {
    // El filtro es en memoria a propósito: los planes ya vienen hidratados en bloque y son
    // pocos. Pedir /plans?eventId= por cada pantalla sería un request por evento para filtrar
    // una lista que ya está en el cliente.
    //
    // El `!archived` es defensa en profundidad: la ruta pública /plans ya las excluye, pero
    // durante la ventana optimista de un "retirar de la venta" el plan sigue en este caché con
    // archived=true hasta que llega el refetch. Sin este filtro, seguiría a la venta ese instante.
    const todos = (this.plans ?? []).filter((p) => !p.archived)
    return eventId ? todos.filter((p) => p.eventId === eventId) : todos
  }
  /** El panel: incluye las retiradas. Cae al caché público mientras /admin/plans no llegó —ese
   *  subconjunto es real (lo trajo /plans), sólo que sin las retiradas—, nunca al seed. */
  override getAdminPlans(eventId?: string): TicketPlan[] {
    const todos = this.adminPlans ?? this.plans ?? []
    return eventId ? todos.filter((p) => p.eventId === eventId) : todos
  }
  override getPlan(id: PlanId): TicketPlan | undefined {
    return this.plans?.find((p) => p.id === id)
  }
  override getConvocatorias(): Convocatoria[] {
    return this.convocatoriasList ?? []
  }
  /**
   * Una convocatoria por slug. La lista (convocatoriasList) sólo existe con sesión de organizador,
   * así que en la página pública /c/:slug el dato llega por este GET.
   *
   * Devuelve undefined mientras el GET está en vuelo, y ese undefined es indistinguible de "no
   * existe": Convocatoria.tsx:54 lo lee como convocatoria inexistente y pinta "No encontramos esta
   * convocatoria" en TODA carga, incluidas las que después resuelven bien. Es el link con el que
   * se recluta, así que el flash es caro.
   *
   * Acá queda el estado que hace falta para arreglarlo, con el mismo patrón que el resto del
   * archivo (convoInflight = en vuelo, convoFailed = falló, como availFailed/generalFailed y como
   * hydrationFailed para los recursos de isHydrating). Falta el lector, que está fuera de este
   * archivo: `isHydrating` sólo acepta HydratableResource (DataStore.ts:71) y esa unión no incluye
   * 'convocatoria', así que la página todavía no puede preguntar. Con la unión ampliada, el
   * `switch` de isHydrating pasa a exigir el caso y Convocatoria.tsx puede hacer lo mismo que
   * EventoFicha.tsx:55 — mostrar <PagePending /> en vez del EmptyState mientras hidrata.
   */
  override getConvocatoria(slug: string): Convocatoria | undefined {
    const inList = this.convocatoriasList?.find((c) => c.slug === slug)
    if (inList) return inList
    const cached = this.convocatorias.get(slug)
    if (cached) return cached
    const failedAt = this.convoFailed.get(slug)
    const enBackoff = failedAt !== undefined && Date.now() - failedAt < RemoteDataStore.FETCH_RETRY_MS
    if (!this.convoInflight.has(slug) && !enBackoff) {
      this.convoInflight.add(slug)
      this.api.get<Convocatoria>(`/convocatorias/${slug}`)
        .then((cv) => {
          this.convocatorias.set(slug, cv)
          this.convoInflight.delete(slug)
          this.convoFailed.delete(slug)
          bus.emit('convocatoria')
        })
        .catch(() => {
          // Antes el fallo no emitía nada: la página se quedaba con el primer render para
          // siempre. Se emite para que vuelva a renderizar y se anota para que ese render no
          // dispare el GET de nuevo (loop de requests).
          this.convoInflight.delete(slug)
          this.convoFailed.set(slug, Date.now())
          bus.emit('convocatoria')
        })
    }
    // Sin respuesta del server todavía: undefined, no la convocatoria de demostración.
    return undefined
  }
  override createConvocatoria(input: NewConvocatoria): Convocatoria {
    const prevCache = this.convocatoriasList // para deshacer si el backend rechaza
    const taken = new Set((this.convocatoriasList ?? []).map((c) => c.slug))
    const base = input.slug || slugify(input.title)
    let slug = base
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
    const cv: Convocatoria = { ...input, id: newId('conv'), slug }
    if (this.convocatoriasList) this.convocatoriasList = [cv, ...this.convocatoriasList]
    this.track('admin_convocatoria_created', { convocatoriaId: cv.id })
    bus.emit('convocatorias')
    this.adminWrite(this.api.post('/admin/convocatorias', cv), () => this.hydrateConvocatorias(),
      () => { this.convocatoriasList = prevCache; bus.emit('convocatorias') },
    )
    return cv
  }
  override updateConvocatoria(id: string, patch: Partial<Convocatoria>): void {
    const prevCache = this.convocatoriasList // para deshacer si el backend rechaza
    if (this.convocatoriasList) this.convocatoriasList = this.convocatoriasList.map((c) => (c.id === id ? { ...c, ...patch } : c))
    this.track('admin_convocatoria_updated', { convocatoriaId: id })
    bus.emit('convocatorias')
    // Se limpia también el caché por slug: si no, la vista pública /c/:slug seguía sirviendo
    // la versión vieja hasta recargar. Con el negativo va lo mismo: si el slug cambió, el 404 del
    // anterior no tiene que frenar el fetch del nuevo durante los 30s de backoff.
    this.convocatorias.clear()
    this.convoFailed.clear()
    this.adminWrite(this.api.patch(`/admin/convocatorias/${id}`, patch), () => this.hydrateConvocatorias(),
      () => { this.convocatoriasList = prevCache; bus.emit('convocatorias') },
    )
  }
  override deleteConvocatoria(id: string): void {
    const prev = this.convocatoriasList
    if (this.convocatoriasList) this.convocatoriasList = this.convocatoriasList.filter((c) => c.id !== id)
    this.track('admin_convocatoria_deleted', { convocatoriaId: id })
    bus.emit('convocatorias')
    this.convocatorias.clear()
    this.adminWrite(
      this.api.del(`/admin/convocatorias/${id}`),
      () => this.hydrateConvocatorias(),
      () => { if (prev) this.convocatoriasList = prev; bus.emit('convocatorias') },
    )
  }
  /** Con token de admin en sesión trae TODAS (GET /admin/applications) para revisar/decidir;
   *  device (this.applications, GET /applications) para "Mis postulaciones" del usuario, y una
   *  admin SEPARADA (this.adminApplications, GET /admin/applications) para el panel del organizador.
   *  Cachés distintos: loguearse como admin en la misma pestaña NO debe contaminar las postulaciones
   *  del usuario (antes applicationsPath() reenrutaba el ÚNICO caché a /admin y filtraba las de todos). */
  private hydrateApplications(): void {
    this.api.get<Application[]>('/applications').then((a) => { this.applications = a; bus.emit('applications') }).catch(() => {})
  }
  /**
   * El endpoint pagina por cursor y devuelve `{ items, nextCursor }` (antes un array plano con
   * `take: 500`). Acá se pide TODA la cola siguiendo el cursor hasta que se agota — no solo la
   * primera página — para que `this.adminApplications` vuelva a ser la lista COMPLETA, como antes
   * del cambio a paginación server-side.
   *
   * Tiene que ser la lista COMPLETA porque sobre este mismo caché se calculan los contadores de
   * los tabs de AdminPostulaciones y, sobre todo, el guard de borrado en cascada de
   * AdminConvocatorias (`Application.convocatoriaId` es `onDelete: Cascade`). Hidratar solo la
   * primera página (50 de N) dejaba a una convocatoria con postulaciones fuera del corte mostrando
   * "0 postulaciones" y habilitando un borrado que se las llevaba puestas — BLOQUEANTE del review.
   *
   * `limit=100` (el máximo que acepta el server) para minimizar la cantidad de requests; si el
   * paginado falla a mitad de camino, se descarta todo (no se deja el caché en un estado
   * "parcial pero sin avisar" — la garantía de esta función es "completo o error", nunca "a medias").
   *
   * El loop en sí no confía ciegamente en que el server avanza: si `nextCursor` viniera repetido
   * (mismo valor que el cursor recién usado) o si se pasara de un tope de páginas razonable, corta
   * y lo trata IGUAL que el fallo de una página — error, nunca una lista parcial disfrazada de
   * completa. Hoy el backend avanza bien (verificado incluso con `ts` duplicados); esto es defensa
   * ante un cambio futuro del server que se quede pisando el mismo cursor.
   */
  private hydrateAdminApplications(): void {
    this.fetchAllAdminApplications()
      .then((items) => {
        this.adminApplications = items
        this.appsError = false
      })
      .catch(() => {
        // El error se EXPONE (antes se tragaba en un catch vacío y la pantalla caía en cascada
        // al seed): si el backend no responde, el panel tiene que decirlo, no mostrar demo.
        this.appsError = true
      })
      .finally(() => bus.emit('applications'))
  }

  private async fetchAllAdminApplications(): Promise<Application[]> {
    const items: Application[] = []
    let cursor: string | undefined
    // Tope de páginas: con limit=100 esto cubre 20.000 postulaciones. Si se llega acá es que el
    // server no está agotando el cursor — cortar es mejor que colgar la pestaña en un loop infinito.
    const MAX_PAGES = 200
    for (let pagina = 0; pagina < MAX_PAGES; pagina++) {
      const qs = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100'
      const page = await this.api.get<{ items: Application[]; nextCursor: string | null }>(
        `/admin/applications${qs}`,
      )
      items.push(...page.items)
      if (!page.nextCursor) return items
      if (page.nextCursor === cursor) {
        // El cursor no avanzó: pedir la "próxima" página otra vez traería lo mismo para siempre.
        throw new Error('fetchAllAdminApplications: el cursor no avanzó entre páginas')
      }
      cursor = page.nextCursor
    }
    throw new Error('fetchAllAdminApplications: se superó el tope de páginas sin agotar el cursor')
  }

  /** TODAS (vista del organizador): la lista admin si está cargada, si no la del device. */
  override getApplications(): Application[] {
    return this.adminApplications ?? this.applications ?? []
  }
  /**
   * Postulaciones para el PANEL. Es la única de las tres que devuelve null.
   *
   * getApplications() cae en cascada a las del device y termina en `[]`; esa lista vacía se lee
   * como "no hay postulaciones". AdminPostulaciones consume ESTA, que es null hasta que
   * /admin/applications resuelva y sigue null si falló, así puede decir "no se pudo traer" en vez
   * de dar por vacía una cola que quizás está llena.
   */
  override getAdminApplications(): Application[] | null {
    return this.adminApplications ?? null
  }
  /** true si el último intento falló → el panel muestra el error en vez de una cola vacía. */
  override applicationsFailed(): boolean {
    return this.appsError
  }
  /** Solo las del PROPIO device (vistas de usuario): NUNCA la lista admin. */
  override getMyApplications(): Application[] {
    // super.getMyApplications() cae en getApplications() de LocalDataStore, que MEZCLA las 24
    // postulaciones del seed con las locales: sin hidratar, el visitante veía dos docenas de
    // postulaciones inventadas como si fueran suyas.
    return this.applications ?? []
  }

  /* ─── Membresía (Fase D parcial): persiste server-side, antes solo en localStorage ─── */

  private hydrateMembership(): void {
    // writeJSON: sin el espejo, un socio que arranca sin red vuelve a ser 'free' y pierde el
    // acceso al contenido que pagó hasta que la hidratación funcione.
    this.api.get<Membership>('/memberships/me').then((m) => { this.membership = m; writeJSON(K.membership, m); bus.emit('membership') }).catch(() => {})
  }

  override getMembership(): Membership {
    return this.membership ?? super.getMembership()
  }
  override isSocio(): boolean {
    return this.membership ? this.membership.tier === 'socio' : super.isSocio()
  }
  override becomeSocio(paid: number): Membership {
    const prev = this.membership
    const optimistic: Membership = { tier: 'socio', since: new Date().toISOString(), paid }
    this.membership = optimistic
    this.track('membership_purchased', { tier: 'socio', total: paid })
    bus.emit('membership')
    this.api
      .post<Membership>('/memberships', { paid })
      .then((server) => {
        this.membership = server
        writeJSON(K.membership, server) // write-through: la membresía recién pagada sobrevive a un arranque sin red
        bus.emit('membership')
        this.refetchContents() // ahora socio → re-fetch para desenmascarar el youtubeId de contenido socioOnly
      })
      .catch(() => {
        // Si el server no registró la membresía, revertir el estado optimista y AVISAR — si no,
        // isSocio() queda true y desbloquea contenido socioOnly cross-app hasta el próximo reload.
        this.membership = prev
        // El espejo también se revierte: si no, el snapshot local queda diciendo 'socio' y el
        // próximo arranque sin red desbloquea contenido que el server nunca confirmó.
        writeJSON(K.membership, prev ?? { tier: 'free', since: '', paid: 0 })
        bus.emit('membership')
        bus.emit('membership:rejected')
      })
    return optimistic
  }

  /* ─── Beneficios (descuentos para registrados) ─── */

  /* ─── Beneficios. Público (this.benefits ← /benefits: solo activos; código solo si el device
   *  está registrado) vs admin (this.adminBenefits ← /admin/benefits: todos + códigos), para que el
   *  organizador no vea todos los códigos en su vista pública del mismo tab (#19). ─── */
  private hydrateBenefits(): void {
    this.refetch<Benefit[]>('/benefits', (b) => (this.benefits = b), 'benefits')
  }
  private hydrateAdminBenefits(): void {
    this.api.get<Benefit[]>('/admin/benefits').then((b) => { this.adminBenefits = b; bus.emit('benefits') }).catch(() => {})
  }
  private refetchBenefits(): void { this.hydrateBenefits(); this.hydrateAdminBenefits() }
  override getBenefits(): Benefit[] {
    return this.benefits ?? []
  }
  override getAdminBenefits(): Benefit[] {
    return this.adminBenefits ?? []
  }
  override createBenefit(input: NewBenefit): Benefit {
    const prevCache = this.adminBenefits // para deshacer si el backend rechaza
    const benefit: Benefit = { ...input, id: newId('ben') }
    if (this.adminBenefits) this.adminBenefits = [...this.adminBenefits, benefit].sort((a, b) => a.order - b.order)
    this.track('admin_benefit_created', { benefitId: benefit.id, category: benefit.category })
    bus.emit('benefits')
    this.adminWrite(this.api.post('/admin/benefits', benefit), () => this.refetchBenefits(),
      () => { this.adminBenefits = prevCache; bus.emit('benefits') },
    )
    return benefit
  }
  override updateBenefit(id: string, patch: Partial<Benefit>): void {
    const prevCache = this.adminBenefits // para deshacer si el backend rechaza
    if (this.adminBenefits) this.adminBenefits = this.adminBenefits.map((b) => (b.id === id ? { ...b, ...patch } : b)).sort((a, b) => a.order - b.order)
    this.track('admin_benefit_updated', { benefitId: id })
    bus.emit('benefits')
    this.adminWrite(this.api.patch(`/admin/benefits/${id}`, patch), () => this.refetchBenefits(),
      () => { this.adminBenefits = prevCache; bus.emit('benefits') },
    )
  }
  override deleteBenefit(id: string): void {
    const prev = this.adminBenefits
    if (this.adminBenefits) this.adminBenefits = this.adminBenefits.filter((b) => b.id !== id)
    this.track('admin_benefit_deleted', { benefitId: id })
    bus.emit('benefits')
    this.adminWrite(
      this.api.del(`/admin/benefits/${id}`),
      () => this.refetchBenefits(),
      () => { if (prev) this.adminBenefits = prev; bus.emit('benefits') },
    )
  }

  override submitApplication(convocatoriaId: string, data: Record<string, string>): Application {
    const app: Application = { id: newId('app'), convocatoriaId, ts: new Date().toISOString(), status: 'preinscripta', data }
    // Cachea SIEMPRE (antes, si applications no estaba hidratado, la postulación se perdía de
    // la vista del usuario). Reconcilia el id local con el del server (espeja register()).
    this.applications = [app, ...(this.applications ?? [])]
    this.track('application_submitted', { convocatoriaId, applicationId: app.id })
    bus.emit('applications')
    this.api
      .post<Application>('/applications', { convocatoriaId, data })
      .then((server) => {
        this.applications = (this.applications ?? []).map((a) => (a.id === app.id ? server : a))
        bus.emit('applications')
      })
      .catch(() => {
        // El POST falló: sacar la postulación optimista y AVISAR. Antes el catch vacío la dejaba
        // como "preinscripta" → el usuario creía haberse postulado pero el organizador nunca la
        // veía (lead perdido en silencio). Espeja el revert+aviso de register().
        this.applications = (this.applications ?? []).filter((a) => a.id !== app.id)
        bus.emit('applications')
        bus.emit('application:rejected', { convocatoriaId })
      })
    return app
  }
  override decideApplication(
    applicationId: string,
    status: ApplicationStatus,
    opts?: { note?: string; skipEmail?: boolean },
  ): void {
    if (!this.adminApplications) {
      // hidratar bajo demanda (el admin abrió postulaciones)
      this.hydrateAdminApplications()
    }
    const prev = this.adminApplications
    if (this.adminApplications) this.adminApplications = this.adminApplications.map((a) => (a.id === applicationId ? { ...a, status, decidedAt: new Date().toISOString() } : a))
    bus.emit('applications')
    // Antes el error se tragaba con `.catch(() => {})`: la postulación quedaba marcada como
    // aceptada en pantalla sin que el backend lo supiera, y al recargar volvía a "preinscripta".
    this.adminWrite(
      this.api.patch(`/admin/applications/${applicationId}`, {
        status,
        ...(opts?.note ? { note: opts.note } : {}),
        ...(opts?.skipEmail ? { skipEmail: true } : {}),
      }),
      () => this.hydrateAdminApplications(),
      // `prev` puede ser undefined: arriba se dispara una hidratación bajo demanda, y si ESA
      // llega mientras el PATCH está en vuelo, restaurar el snapshot vacío borraría la lista
      // real recién traída y devolvería el panel a "todavía no cargó" (getAdminApplications → null).
      () => {
        if (prev) this.adminApplications = prev
        else this.hydrateAdminApplications()
        bus.emit('applications')
      },
    )
  }

  /* Re-hidratadores de las listas que sirven a la vez al público y al panel. */
  private refetchSponsors(): void { this.refetch('/sponsors', (v: Sponsor[]) => (this.sponsors = v), 'sponsors') }
  private refetchGalleries(): void { this.refetch('/galleries', (v: Gallery[]) => (this.galleries = v), 'galleries') }
  private refetchCatalog(): void { this.refetch('/catalog', (v: CatalogProfile[]) => (this.catalog = v), 'catalog') }
  private refetchPlans(): void { this.refetch('/plans', (v: TicketPlan[]) => (this.plans = v), 'plans') }
  private hydrateAdminPlans(): void {
    this.api.get<TicketPlan[]>('/admin/plans').then((p) => { this.adminPlans = p; bus.emit('plans') }).catch(() => {})
  }
  /** Tras escribir un plan hay que refrescar las DOS listas: la pública (/plans, sin retiradas) y
   *  la del panel (/admin/plans, con retiradas). Si sólo se refrescara la pública, una entrada
   *  recién retirada seguiría apareciendo en el panel —y una reactivada no volvería a la app. */
  private refetchAllPlans(): void { this.refetchPlans(); this.hydrateAdminPlans() }

  override createSponsor(input: NewSponsor): Sponsor {
    const prevCache = this.sponsors // para deshacer si el backend rechaza
    const sponsor: Sponsor = { ...input, id: newId('sp') }
    if (this.sponsors) this.sponsors = [...this.sponsors, sponsor]
    this.track('admin_sponsor_created', { sponsorId: sponsor.id, level: sponsor.level })
    bus.emit('sponsors')
    this.adminWrite(this.api.post('/admin/sponsors', sponsor), () => this.refetchSponsors(),
      () => { this.sponsors = prevCache; bus.emit('sponsors') },
    )
    return sponsor
  }
  override updateSponsor(id: string, patch: Partial<Sponsor>): void {
    const prevCache = this.sponsors // para deshacer si el backend rechaza
    if (this.sponsors) this.sponsors = this.sponsors.map((s) => (s.id === id ? { ...s, ...patch } : s))
    this.track('admin_sponsor_updated', { sponsorId: id })
    bus.emit('sponsors')
    this.adminWrite(this.api.patch(`/admin/sponsors/${id}`, patch), () => this.refetchSponsors(),
      () => { this.sponsors = prevCache; bus.emit('sponsors') },
    )
  }
  override deleteSponsor(id: string): void {
    const prev = this.sponsors
    if (this.sponsors) this.sponsors = this.sponsors.filter((s) => s.id !== id)
    this.track('admin_sponsor_deleted', { sponsorId: id })
    bus.emit('sponsors')
    this.adminWrite(
      this.api.del(`/admin/sponsors/${id}`),
      () => this.refetchSponsors(),
      () => { if (prev) this.sponsors = prev; bus.emit('sponsors') },
    )
  }

  override createGallery(input: NewGallery): Gallery {
    const prevCache = this.galleries // para deshacer si el backend rechaza
    // Dedup de slug (como notas/convocatorias): sin esto, dos galerías con el mismo título
    // chocan con el @unique del server → 409 → el ítem optimista desaparece en silencio.
    const gtaken = new Set((this.galleries ?? []).map((g) => g.slug))
    let gslug = input.slug || slugify(input.title)
    for (let i = 2, base = gslug; gtaken.has(gslug); i++) gslug = `${base}-${i}`
    const gallery: Gallery = { ...input, id: newId('gal'), slug: gslug }
    if (this.galleries) this.galleries = [...this.galleries, gallery]
    this.track('admin_gallery_created', { galleryId: gallery.id })
    bus.emit('galleries')
    this.adminWrite(this.api.post('/admin/galleries', gallery), () => this.refetchGalleries(),
      () => { this.galleries = prevCache; bus.emit('galleries') },
    )
    return gallery
  }
  override updateGallery(id: string, patch: Partial<Gallery>): void {
    const prevCache = this.galleries // para deshacer si el backend rechaza
    if (this.galleries) this.galleries = this.galleries.map((g) => (g.id === id ? { ...g, ...patch } : g))
    this.track('admin_gallery_updated', { galleryId: id })
    bus.emit('galleries')
    this.adminWrite(this.api.patch(`/admin/galleries/${id}`, patch), () => this.refetchGalleries(),
      () => { this.galleries = prevCache; bus.emit('galleries') },
    )
  }
  override deleteGallery(id: string): void {
    const prev = this.galleries
    if (this.galleries) this.galleries = this.galleries.filter((g) => g.id !== id)
    this.track('admin_gallery_deleted', { galleryId: id })
    bus.emit('galleries')
    this.adminWrite(
      this.api.del(`/admin/galleries/${id}`),
      () => this.refetchGalleries(),
      () => { if (prev) this.galleries = prev; bus.emit('galleries') },
    )
  }

  override createCatalogProfile(input: NewCatalogProfile): CatalogProfile {
    const prevCache = this.catalog // para deshacer si el backend rechaza
    // Dedup de slug: dos expositores con el mismo nombre chocan con el @unique → 409 → el ítem
    // desaparece del panel sin aviso. Espeja el dedup de notas/convocatorias.
    const ctaken = new Set((this.catalog ?? []).map((c) => c.slug))
    let cslug = input.slug || slugify(input.name)
    for (let i = 2, base = cslug; ctaken.has(cslug); i++) cslug = `${base}-${i}`
    const profile: CatalogProfile = { ...input, id: newId('cat'), slug: cslug }
    if (this.catalog) this.catalog = [...this.catalog, profile]
    this.track('admin_catalog_created', { profileId: profile.id })
    bus.emit('catalog')
    this.adminWrite(this.api.post('/admin/catalog', profile), () => this.refetchCatalog(),
      () => { this.catalog = prevCache; bus.emit('catalog') },
    )
    return profile
  }
  override updateCatalogProfile(id: string, patch: Partial<CatalogProfile>): void {
    const prevCache = this.catalog // para deshacer si el backend rechaza
    if (this.catalog) this.catalog = this.catalog.map((c) => (c.id === id ? { ...c, ...patch } : c))
    this.track('admin_catalog_updated', { profileId: id })
    bus.emit('catalog')
    this.adminWrite(this.api.patch(`/admin/catalog/${id}`, patch), () => this.refetchCatalog(),
      () => { this.catalog = prevCache; bus.emit('catalog') },
    )
  }
  override deleteCatalogProfile(id: string): void {
    const prev = this.catalog
    if (this.catalog) this.catalog = this.catalog.filter((c) => c.id !== id)
    this.track('admin_catalog_deleted', { profileId: id })
    bus.emit('catalog')
    this.adminWrite(
      this.api.del(`/admin/catalog/${id}`),
      () => this.refetchCatalog(),
      () => { if (prev) this.catalog = prev; bus.emit('catalog') },
    )
  }

  override createPlan(eventId: string, input: NewPlan): void {
    // Sin optimista: el id lo genera el SERVER a partir del nombre, así que no se puede pintar
    // una fila creíble antes de la respuesta —tendría un id inventado que después no coincide—.
    // Se refetchea y listo: es un alta puntual del panel, no un gesto de alta frecuencia.
    this.adminWrite(
      this.api.post(`/admin/events/${eventId}/plans`, input),
      () => this.refetchAllPlans(),
      () => this.refetchAllPlans(),
    )
  }

  override deletePlan(id: PlanId): void {
    const prev = this.plans
    const prevAdmin = this.adminPlans
    // Se saca de las DOS listas: la del panel (donde está a la vista) y la pública.
    if (this.plans) this.plans = this.plans.filter((p) => p.id !== id)
    if (this.adminPlans) this.adminPlans = this.adminPlans.filter((p) => p.id !== id)
    bus.emit('plans')
    this.adminWrite(
      this.api.del(`/admin/plans/${id}`),
      () => this.refetchAllPlans(),
      // El server rechaza con 409 si ya tiene compras: se devuelven las filas a las listas.
      () => { this.plans = prev; this.adminPlans = prevAdmin; bus.emit('plans'); this.refetchAllPlans() },
    )
  }

  override updatePlan(id: PlanId, patch: Partial<Omit<TicketPlan, 'id' | 'eventId'>>): void {
    const prev = this.plans
    const prevAdmin = this.adminPlans
    // El caché del panel SIEMPRE tiene el plan (incluye retiradas). El público puede no tenerlo
    // —si está retirado, /plans no lo trae—, así que se mapea sólo donde esté; getPlans filtra
    // las archived de todos modos, cubriendo el instante entre este optimista y el refetch.
    if (this.plans) this.plans = this.plans.map((p) => (p.id === id ? { ...p, ...patch } : p))
    if (this.adminPlans) this.adminPlans = this.adminPlans.map((p) => (p.id === id ? { ...p, ...patch } : p))
    bus.emit('plans')
    this.adminWrite(
      this.api.patch(`/admin/plans/${id}`, patch),
      () => this.refetchAllPlans(),
      () => { this.plans = prev; this.adminPlans = prevAdmin; bus.emit('plans'); this.refetchAllPlans() },
    )
  }

  /* ─── Órdenes de entradas y campañas de publicidad ─────────────────────────────────
   * Las tablas existían desde el diseño pero no tenían rutas: el front las guardaba SOLO en
   * localStorage, así que cada comprador veía sus propias órdenes y el panel mostraba las del
   * navegador donde estuviera abierto. Ahora van a la base como el resto.
   *
   * El TOTAL no viaja en el POST: lo calcula el server con el precio vigente del plan (si no,
   * bastaba editar el request para comprar una VIP a cualquier precio). Por eso la orden que
   * devuelve el backend reemplaza a la optimista. */
  private orders?: TicketOrder[] // del device (Mis entradas)
  private adminOrders?: TicketOrder[] // todas (panel)
  private campaigns?: AdCampaign[]

  private hydrateOrders(): void {
    this.api.get<TicketOrder[]>('/orders').then((o) => { this.orders = o; bus.emit('orders') }).catch(() => {})
  }
  private hydrateAdminOrders(): void {
    this.api.get<TicketOrder[]>('/admin/orders').then((o) => { this.adminOrders = o; bus.emit('orders') }).catch(() => {})
  }
  private hydrateCampaigns(): void {
    this.api.get<AdCampaign[]>('/campaigns').then((c) => { this.campaigns = c; bus.emit('campaigns') }).catch(() => {})
  }
  /** Tras una escritura: la orden afecta la vista del comprador Y la del organizador. */
  private refetchOrders(): void {
    this.hydrateOrders()
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ccm:admin-token')) this.hydrateAdminOrders()
  }

  override getOrders(): TicketOrder[] {
    return this.orders ?? super.getOrders()
  }
  override getAdminOrders(): TicketOrder[] {
    return this.adminOrders ?? this.orders ?? super.getAdminOrders()
  }

  /** La orden optimista: el precio local es solo para no dejar la UI en blanco; el server manda
   *  y la re-hidratación lo corrige si el precio cambió mientras tanto. */
  private construirOrden(planId: PlanId, qty: number): TicketOrder {
    const plan = this.getPlan(planId)
    const unit = (plan?.price ?? 0) + (plan?.serviceCharge ?? 0)
    const profile = this.getProfile()
    // Mismo armado que la demo, a propósito: si acá falta un campo que allá sí se guarda, el
    // dato se pierde sólo en producción y no falla nada a la vista. `buyerName` ya vivió ese
    // bug — toda compra real quedaba con la columna en NULL y el organizador veía el email
    // crudo en el panel, sin forma de recuperar el nombre después.
    const nombre = displayName()
    return {
      id: newId('ord'),
      planId,
      ts: new Date().toISOString(),
      status: 'iniciada',
      qty,
      total: unit * qty,
      ...(nombre ? { buyerName: nombre } : {}),
      ...(profile.fields.email?.value ? { buyerEmail: profile.fields.email.value } : {}),
    }
  }

  /**
   * Pinta la orden optimista y manda el POST. Devuelve la promesa del POST: quien llama decide
   * si la espera (`createOrders`, porque después va a pedir un cobro por esa orden) o no
   * (`createOrder`, donde lo que importa es que la UI responda ya).
   */
  private enviarOrden(order: TicketOrder): Promise<void> {
    if (this.orders) this.orders = [order, ...this.orders]
    this.track('ticket_order_created', { planId: order.planId, orderId: order.id, qty: order.qty, total: order.total })
    bus.emit('orders')
    return this.api
      .post('/orders', {
        id: order.id,
        planId: order.planId,
        qty: order.qty,
        ...(order.buyerName ? { buyerName: order.buyerName } : {}),
        ...(order.buyerEmail ? { buyerEmail: order.buyerEmail } : {}),
      })
      .then(() => undefined)
      .catch((err) => {
        // La compra no llegó al backend: sacamos la orden fantasma y avisamos, en vez de
        // dejar al comprador creyendo que tiene una entrada reservada.
        if (this.orders) this.orders = this.orders.filter((o) => o.id !== order.id)
        bus.emit('orders')
        bus.emit('order:rejected')
        throw err
      })
  }

  override createOrder(planId: PlanId, qty = 1): TicketOrder {
    const order = this.construirOrden(planId, qty)
    this.enviarOrden(order)
      .then(() => this.refetchOrders())
      .catch(() => {
        /* el rollback y el aviso ya los hizo enviarOrden */
      })
    return order
  }

  /**
   * Crea N órdenes y ESPERA a que existan en el backend.
   *
   * `createOrder` es fire-and-forget: el POST sale en paralelo y la orden optimista vuelve al
   * instante. Encadenar el checkout ahí es una carrera perdida — el cobro puede llegar al server
   * ANTES que la orden y responder RESOURCE_NOT_FOUND, con lo que el front cae al link manual y
   * cobra de menos. Con N órdenes basta que UNA llegue tarde para que pase.
   */
  override async createOrders(sel: { planId: PlanId; qty: number }[]): Promise<TicketOrder[]> {
    const ordenes = sel.map((s) => this.construirOrden(s.planId, s.qty))
    await Promise.all(ordenes.map((o) => this.enviarOrden(o)))
    this.refetchOrders()
    return ordenes
  }

  override markOrderRedirected(orderId: string): void {
    if (this.orders) this.orders = this.orders.map((o) => (o.id === orderId ? { ...o, status: 'redirigida_mp' } : o))
    this.track('ticket_order_redirected_mp', { orderId })
    bus.emit('orders')
    this.api.patch(`/orders/${orderId}/redirected`, {}).then(() => this.refetchOrders()).catch(() => this.refetchOrders())
  }

  /** Confirmar/cancelar es del ORGANIZADOR (ruta admin). */
  override setOrderStatus(orderId: string, status: OrderStatus): void {
    const prev = this.adminOrders
    if (this.adminOrders) this.adminOrders = this.adminOrders.map((o) => (o.id === orderId ? { ...o, status } : o))
    if (status === 'confirmada') this.track('ticket_order_confirmed', { orderId })
    bus.emit('orders')
    this.adminWrite(
      this.api.patch(`/admin/orders/${orderId}`, { status }),
      () => this.refetchOrders(),
      () => { if (prev) this.adminOrders = prev; bus.emit('orders'); this.hydrateAdminOrders() },
    )
  }

  override getCampaigns(): AdCampaign[] {
    return this.campaigns ?? []
  }
  override getActiveCampaign(slot: AdSlot): AdCampaign | undefined {
    // Sin campañas hidratadas no hay ninguna al aire: mostrar la de demo pondría una marca
    // inventada en el espacio que se le vende a un sponsor real.
    if (!this.campaigns) return undefined
    const forSlot = this.campaigns.filter((c) => c.slot === slot)
    return forSlot.length ? forSlot[forSlot.length - 1] : undefined
  }
  override createCampaign(input: NewCampaign): AdCampaign {
    const campaign: AdCampaign = { ...input, id: newId('camp'), ts: new Date().toISOString() }
    if (this.campaigns) this.campaigns = [...this.campaigns, campaign]
    this.track('ad_campaign_purchased', {
      campaignId: campaign.id,
      slot: campaign.slot,
      hours: campaign.hours,
      total: campaign.total,
    })
    bus.emit('campaigns')
    this.api
      .post('/campaigns', campaign)
      .then(() => this.hydrateCampaigns())
      .catch(() => {
        if (this.campaigns) this.campaigns = this.campaigns.filter((c) => c.id !== campaign.id)
        bus.emit('campaigns')
        bus.emit('order:rejected')
      })
    return campaign
  }

  override getCatalog(): CatalogProfile[] {
    return this.catalog ?? []
  }
  override getCatalogProfile(slug: string): CatalogProfile | undefined {
    return this.catalog?.find((c) => c.slug === slug)
  }
  override getGalleries(): Gallery[] {
    return this.galleries ?? []
  }
  override getGallery(slug: string): Gallery | undefined {
    return this.galleries?.find((g) => g.slug === slug)
  }
  override getContents(): ContentItem[] {
    return this.contents ?? []
  }
  override getFavorites(): string[] {
    return this.favorites ?? super.getFavorites()
  }
  override getDownloads(): PhotoDownload[] {
    return this.downloads ?? super.getDownloads()
  }

  override toggleFavorite(photoId: string): void {
    if (!this.favorites) {
      super.toggleFavorite(photoId)
      return
    }
    // Revertir el optimista si el server rechaza (antes el catch era vacío → corazón "lleno"
    // que el server nunca guardó y desaparece al re-hidratar; espeja el patrón de register()).
    const prev = this.favorites
    const revert = () => { this.favorites = prev; bus.emit('favorites') }
    if (this.favorites.includes(photoId)) {
      this.favorites = this.favorites.filter((p) => p !== photoId)
      this.api.del(`/favorites/${photoId}`).catch(revert)
    } else {
      this.favorites = [...this.favorites, photoId]
      this.api.put(`/favorites/${photoId}`).catch(revert)
    }
    bus.emit('favorites')
  }

  override recordDownload(photoId: string, galleryId: string): void {
    if (!this.downloads) {
      super.recordDownload(photoId, galleryId)
      return
    }
    const prev = this.downloads
    const sponsorId = this.galleries?.find((g) => g.id === galleryId)?.sponsorId ?? ''
    this.downloads = [{ photoId, galleryId, sponsorId, ts: new Date().toISOString() }, ...this.downloads]
    this.track('photo_download', { photoId, galleryId, sponsorId }) // → local + analytics backend
    bus.emit('downloads')
    // Revertir la fila de "Mis descargas" si el POST falla (no persistió); la descarga del
    // archivo ya ocurrió aparte, esto solo corrige el registro visible.
    this.api.post('/downloads', { photoId, galleryId }).catch(() => { this.downloads = prev; bus.emit('downloads') })
  }

  /* ─── Fase G: CRUD del organizador (auth Bearer en /admin/*) ─── */

  private uniqueSlug(base: string): string {
    const existing = new Set((this.events ?? []).map((e) => e.slug))
    let slug = base
    for (let i = 2; existing.has(slug); i++) slug = `${base}-${i}`
    return slug
  }
  private refetchContents(): void {
    this.api.get<ContentItem[]>('/contents').then((c) => { this.contents = c; bus.emit('contents') }).catch(() => {})
  }
  /** Lista del panel: el backend NO enmascara el youtubeId de los videos solo-socios. Sin esto,
   *  el organizador abría su propio video y el campo del link venía vacío (el gate de socio
   *  aplica al device, y el device del organizador no es socio) → no podía guardar la edición. */
  private hydrateAdminContents(): void {
    this.api.get<ContentItem[]>('/admin/contents').then((c) => { this.adminContents = c; bus.emit('contents') }).catch(() => {})
  }
  private refetchAllContents(): void { this.refetchContents(); this.hydrateAdminContents() }
  /** Tras una escritura hay que refrescar las DOS listas: la pública y la del panel (que
   *  incluye borradores). Si sólo se refrescara la pública, un evento recién creado —que nace
   *  borrador— no aparecería en el panel hasta recargar. */
  private refetchAllEvents(): void {
    this.hydrateEvents()
    this.hydrateAdminEvents()
  }
  private hydrateAdminEvents(): void {
    this.api.get<EventItem[]>('/admin/events').then((e) => {
      this.adminEvents = e
      bus.emit('events')
      this.hydrateDraftBlocks(e)
    }).catch(() => {})
  }

  /** La agenda de los BORRADORES. El bootstrap público (/events/with-blocks) sólo trae eventos
   *  publicados, así que los bloques de un borrador nunca entraban al caché y `getBlocks()` caía
   *  al seed: el organizador abría su evento a medio armar y veía la grilla de la demo como si
   *  fuera suya. Se piden por la ruta de admin, que es la única que devuelve borradores. */
  private hydrateDraftBlocks(adminEvents: EventItem[]): void {
    const publicados = new Set((this.events ?? []).map((e) => e.id))
    for (const ev of adminEvents) {
      if (publicados.has(ev.id) || this.draftBlocksInflight.has(ev.id)) continue
      this.draftBlocksInflight.add(ev.id)
      this.api
        .get<EventBlock[]>(`/admin/events/${ev.id}/blocks`)
        .then((blocks) => {
          this.blocksByEvent.set(ev.id, blocks)
          for (const b of blocks) this.blocksById.set(b.id, b)
          bus.emit('events')
        })
        .catch(() => {})
        .finally(() => this.draftBlocksInflight.delete(ev.id))
    }
  }
  /**
   * El panel ve los borradores; las páginas públicas usan getEvents(), que trae sólo lo publicado.
   *
   * Mientras /admin/events no llegó (o falló), cae a lo publicado. Eso no es el seed: es el
   * subconjunto que ya trajo el backend. El fallback que había acá —`super.getAdminEvents()`—
   * hacía exactamente esto, porque `LocalDataStore.getAdminEvents()` es `return this.getEvents()`
   * y por despacho virtual ese `this` es esta clase; se escribe directo para que se lea sin tener
   * que saberlo. Devolver `[]` dejaba a AdminEventos y a OpsConvocatoriaForm sin eventos hasta que
   * resolviera el fetch admin, que recién arranca cuando AdminLayout confirma la sesión
   * (AdminLayout.tsx:116).
   */
  override getAdminEvents(): EventItem[] {
    return this.adminEvents ?? this.getEvents()
  }
  /** Ídem: lo publicado, no el seed. Los videos socioOnly pueden venir con el youtubeId
   *  enmascarado hasta que llegue /admin/contents — incompleto, pero real. */
  override getAdminContents(): ContentItem[] {
    return this.adminContents ?? this.getContents()
  }

  override createEvent(input: NewEvent): EventItem {
    const prevCache = this.events // para deshacer si el backend rechaza
    const event: EventItem = { ...input, id: newId('ev'), slug: input.slug || this.uniqueSlug(slugify(input.title)) }
    if (this.events) this.events = [...this.events, event]
    this.track('admin_event_created', { eventId: event.id, type: event.type })
    bus.emit('events')
    this.adminWrite(this.api.post('/admin/events', event), () => this.refetchAllEvents(),
      () => { this.events = prevCache; bus.emit('events') },
    )
    return event
  }
  override updateEvent(id: string, patch: Partial<EventItem>): void {
    const prevCache = this.events // para deshacer si el backend rechaza
    if (this.events) this.events = this.events.map((e) => (e.id === id ? { ...e, ...patch } : e))
    this.track('admin_event_updated', { eventId: id })
    bus.emit('events')
    this.adminWrite(this.api.patch(`/admin/events/${id}`, patch), () => this.refetchAllEvents(),
      () => { this.events = prevCache; bus.emit('events') },
    )
  }
  override deleteEvent(id: string): void {
    const prev = this.events
    if (this.events) this.events = this.events.filter((e) => e.id !== id)
    this.blocksByEvent.delete(id)
    this.track('admin_event_deleted', { eventId: id })
    bus.emit('events')
    this.adminWrite(
      this.api.del(`/admin/events/${id}`),
      () => this.refetchAllEvents(),
      // El server puede rechazar (ej. 409 si el evento ya tiene inscripciones): devolvemos la
      // lista como estaba y el aviso explica por qué "no se borró".
      () => { if (prev) this.events = prev; this.refetchAllEvents(); bus.emit('events') },
    )
  }

  override createBlock(input: NewBlock): EventBlock {
    const prevCache = this.events // para deshacer si el backend rechaza
    const block: EventBlock = { ...input, id: newId('blk') }
    // Solo se toca el caché si YA estaba hidratado para ese evento (mismo criterio que el resto
    // de las entidades). Sembrar la clave con un único bloque la deja indistinguible de una
    // hidratada, así que getBlocks() devolvía ese solo bloque y el evento aparecía sin los demás
    // hasta recargar.
    const cached = this.blocksByEvent.get(block.eventId)
    if (cached) {
      this.blocksByEvent.set(block.eventId, [...cached, block])
      this.blocksById.set(block.id, block)
    }
    this.track('admin_block_created', { blockId: block.id, eventId: block.eventId })
    bus.emit('blocks')
    this.adminWrite(this.api.post('/admin/blocks', block), () => this.refetchAllEvents(),
      () => { this.events = prevCache; bus.emit('events') },
    )
    return block
  }
  override updateBlock(id: string, patch: Partial<EventBlock>): void {
    const prevCache = this.events // para deshacer si el backend rechaza
    const cur = this.blocksById.get(id)
    if (cur) {
      const next = { ...cur, ...patch }
      this.blocksById.set(id, next)
      this.blocksByEvent.set(next.eventId, (this.blocksByEvent.get(next.eventId) ?? []).map((b) => (b.id === id ? next : b)))
    }
    this.track('admin_block_updated', { blockId: id })
    bus.emit('blocks')
    this.adminWrite(this.api.patch(`/admin/blocks/${id}`, patch), () => this.refetchAllEvents(),
      () => { this.events = prevCache; bus.emit('events') },
    )
  }
  override deleteBlock(id: string): void {
    const prevCache = this.events // para deshacer si el backend rechaza
    // Si el mapa no está hidratado, `cur` viene undefined y no hay nada local que sacar: cuando
    // los bloques lleguen, el recién borrado vendría con ellos. No pasa nada grave (el onOk
    // re-hidrata y lo corrige), pero pedimos la re-hidratación explícitamente para que la lista
    // no quede mintiendo en el ínterin.
    const cur = this.blocksById.get(id)
    if (!cur) this.hydrateEvents()
    this.blocksById.delete(id)
    if (cur) this.blocksByEvent.set(cur.eventId, (this.blocksByEvent.get(cur.eventId) ?? []).filter((b) => b.id !== id))
    this.track('admin_block_deleted', { blockId: id })
    bus.emit('blocks')
    this.adminWrite(this.api.del(`/admin/blocks/${id}`), () => this.refetchAllEvents(),
      () => { this.events = prevCache; bus.emit('events') },
    )
  }

  override createContent(input: NewContent): ContentItem {
    const prevCache = this.adminContents // para deshacer si el backend rechaza
    const content: ContentItem = { ...input, id: newId('vid') }
    if (this.contents) this.contents = [content, ...this.contents]
    this.track('admin_content_created', { contentId: content.id })
    bus.emit('contents')
    this.adminWrite(this.api.post('/admin/contents', content), () => this.refetchAllContents(),
      () => { this.adminContents = prevCache; bus.emit('contents') },
    )
    return content
  }
  override updateContent(id: string, patch: Partial<ContentItem>): void {
    const prevCache = this.adminContents // para deshacer si el backend rechaza
    if (this.contents) this.contents = this.contents.map((c) => (c.id === id ? { ...c, ...patch } : c))
    this.track('admin_content_updated', { contentId: id })
    bus.emit('contents')
    this.adminWrite(this.api.patch(`/admin/contents/${id}`, patch), () => this.refetchAllContents(),
      () => { this.adminContents = prevCache; bus.emit('contents') },
    )
  }
  override deleteContent(id: string): void {
    const prev = this.contents
    if (this.contents) this.contents = this.contents.filter((c) => c.id !== id)
    this.track('admin_content_deleted', { contentId: id })
    bus.emit('contents')
    this.adminWrite(
      this.api.del(`/admin/contents/${id}`),
      () => this.refetchAllContents(),
      () => { if (prev) this.contents = prev; bus.emit('contents') },
    )
  }

  /* ─── Cobros con Mercado Pago (panel del organizador, Tarea 6) ─── */

  private hydrateMpStatus(): void {
    this.api.get<MpStatus>('/admin/mp/status').then((s) => { this.mpStatus = s; bus.emit('mp') }).catch(() => {})
  }

  override getMpStatus(): MpStatus | undefined {
    return this.mpStatus
  }

  override async connectMp(): Promise<string> {
    const { url } = await this.api.post<{ url: string }>('/admin/mp/connect', {})
    return url
  }

  // El endpoint real es POST (no DELETE): server/src/routes/mp.ts define
  // `mpRouter.post('/admin/mp/disconnect', ...)` y responde 204.
  override async disconnectMp(): Promise<void> {
    await this.api.post('/admin/mp/disconnect', {})
    this.mpStatus = { conectado: false }
    bus.emit('mp')
  }

  /* ─── Checkout real del comprador (Tarea 7) ─── */

  /** Cuántas veces reintentar cuando el server responde 409 CHECKOUT_EN_CURSO — protección
   *  anti doble-cobro de mpCheckoutService.createCheckout: hay un cobro `pending` reciente para
   *  este mismo carrito y todavía no se sabe si tiene preferencia. No es un rechazo real, es una
   *  carrera contra un pedido anterior que está terminando de guardar su preferencia y se
   *  resuelve sola en el orden de un segundo — por eso se reintenta en vez de caer directo al
   *  link manual. */
  private static readonly CHECKOUT_REINTENTOS = 3
  private static readonly CHECKOUT_ESPERA_MS = 600

  /** Inscriptos reales del evento, de todos los dispositivos. Va contra el server porque el
   *  caché local sólo conoce las inscripciones de ESTE device. Sin caché: el panel lo pide al
   *  abrir la ficha y quiere el número de ahora, no uno de hace diez minutos. */
  override async fetchInscriptos(eventId: string): Promise<InscriptoAdmin[]> {
    return this.api.get<InscriptoAdmin[]>(`/admin/events/${eventId}/inscriptos`)
  }

  override async startCheckout(items: CheckoutItem[]): Promise<{ initPoint: string; amount: number } | null> {
    let intento = 0
    while (true) {
      intento++
      try {
        const r = await this.api.post<{ initPoint: string; amount: number }>('/payments/preference', { items })
        return { initPoint: r.initPoint, amount: r.amount }
      } catch (err) {
        // ⚠️ Solo se reintenta CHECKOUT_EN_CURSO, no "cualquier 409" como antes. Los dos 409 del
        // endpoint significan cosas opuestas: CHECKOUT_EN_CURSO se resuelve solo en un segundo;
        // COBRO_SOLAPADO (alguna de estas órdenes ya está adentro de OTRO pago en curso) no se
        // resuelve nunca solo — reintentarlo y después devolver null mandaba al comprador al link
        // manual, que cobra un monto fijo distinto del carrito. Ese es justo el bug que estamos
        // cerrando, así que este error se PROPAGA para que la UI ofrezca retomar el pago vivo.
        if (err instanceof ApiError && err.code === 'COBRO_SOLAPADO') throw err
        const reintentable =
          err instanceof ApiError && err.code === 'CHECKOUT_EN_CURSO' && intento < RemoteDataStore.CHECKOUT_REINTENTOS
        if (reintentable) {
          await new Promise((resolve) => setTimeout(resolve, RemoteDataStore.CHECKOUT_ESPERA_MS))
          continue
        }
        // Sin conexión con MP (503), un CHECKOUT_EN_CURSO que no se resolvió tras reintentar, o
        // error de red: devolvemos null y el llamador decide. No se avisa acá.
        return null
      }
    }
  }

  private scheduleFlush(): void {
    if (this.flushHandle) return
    this.flushHandle = setTimeout(() => this.flush(), 4000)
  }

  /** Manda el buffer de analytics al backend (batch, fire-and-forget). */
  private flush(): void {
    if (this.flushHandle) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    if (this.buffer.length === 0) return
    const batch = this.buffer.splice(0, this.buffer.length)
    this.api.postBatch('/analytics', batch).catch(() => {
      /* fire-and-forget: un track perdido no rompe nada */
    })
  }
}
