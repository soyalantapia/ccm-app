import { LocalDataStore } from './LocalDataStore'
import type { BlockAvailability, PhotoDownload, NewEvent, NewBlock, NewContent } from './DataStore'
import { slugify } from './overlay'
import { newId } from '../../lib/storage'
import { createApi, type ApiClient } from '../../lib/api'
import { bus } from '../../lib/bus'
import { hydrateFromRemote } from '../../lib/identity'
import type {
  DeviceProfile,
  ProfileFieldKey,
  EventItem,
  EventBlock,
  Registration,
  CatalogProfile,
  Gallery,
  ContentItem,
} from '../types'

interface BufferedEvent {
  event: string
  payload?: Record<string, unknown>
  ts: string
}

/**
 * Fase A (incremental seguro) — extiende LocalDataStore y SOLO sobreescribe los
 * métodos de identidad + analytics para sincronizar con el backend real. El resto
 * (eventos, órdenes, catálogo, etc.) se hereda y sigue en LocalDataStore hasta sus
 * fases. La interfaz sigue SÍNCRONA: el caché local da las lecturas al instante y el
 * bus mantiene la reactividad; el backend recibe escrituras en segundo plano. Si no
 * hay VITE_API_URL, ni se instancia esta clase (index.ts cae a LocalDataStore).
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
  private tmpSeq = 0

  // Caché de Fase E (catálogo / galerías / contenido / favoritos / descargas).
  private catalog?: CatalogProfile[]
  private galleries?: Gallery[]
  private contents?: ContentItem[]
  private favorites?: string[]
  private downloads?: PhotoDownload[]

  constructor(apiBase: string) {
    super()
    this.api = createApi(apiBase)
    this.hydrateProfile()
    this.hydrateEvents()
    this.hydrateRegistrations()
    this.hydrateContent()
    if (typeof window !== 'undefined') {
      const flush = () => this.flush()
      window.addEventListener('pagehide', flush)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush()
      })
    }
  }

  /* ─── Fase B: hidratación + lecturas desde caché ─── */

  private hydrateEvents(): void {
    this.api
      .get<EventItem[]>('/events')
      .then(async (events) => {
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
        /* backend caído: seguimos con el seed local */
      })
  }

  private hydrateRegistrations(): void {
    this.api
      .get<Registration[]>('/registrations')
      .then((regs) => {
        this.regs = regs
        bus.emit('registrations')
      })
      .catch(() => {})
  }

  /** Trae el cupo real del server (stale-while-revalidate, dedupe en vuelo). */
  private fetchAvailability(blockId: string): void {
    if (this.availInflight.has(blockId)) return
    this.availInflight.add(blockId)
    this.api
      .get<BlockAvailability>(`/blocks/${blockId}/availability`)
      .then((av) => {
        this.availCache.set(blockId, av)
        this.availInflight.delete(blockId)
        bus.emit('availability')
      })
      .catch(() => this.availInflight.delete(blockId))
  }

  private refreshAvailability(blockId?: string): void {
    if (!blockId) return
    this.availInflight.delete(blockId) // permite re-fetch
    this.fetchAvailability(blockId)
  }

  override getEvents(): EventItem[] {
    return this.events ?? super.getEvents()
  }
  override getEvent(slug: string): EventItem | undefined {
    return this.events ? this.events.find((e) => e.slug === slug) : super.getEvent(slug)
  }
  override getEventById(id: string): EventItem | undefined {
    return this.events ? this.events.find((e) => e.id === id) : super.getEventById(id)
  }
  override getBlocks(eventId: string): EventBlock[] {
    return this.blocksByEvent.get(eventId) ?? super.getBlocks(eventId)
  }
  override getBlock(blockId: string): EventBlock | undefined {
    return this.blocksById.get(blockId) ?? super.getBlock(blockId)
  }
  override blockAvailability(blockId: string): BlockAvailability {
    const cached = this.availCache.get(blockId)
    if (cached) return cached
    this.fetchAvailability(blockId) // dispara fetch; mientras, estimación local
    return super.blockAvailability(blockId)
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
    if (!this.regs) return super.register(eventId, blockId) // pre-hidratación: local
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
        this.regs = (this.regs ?? []).map((r) => (r.id === provisional.id ? server : r))
        this.refreshAvailability(blockId)
        bus.emit('registrations')
      })
      .catch(() => {
        // 409 lleno / ya inscripto → revertir el provisional
        this.regs = (this.regs ?? []).filter((r) => r.id !== provisional.id)
        this.refreshAvailability(blockId)
        bus.emit('registrations')
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
    if (reg && !registrationId.startsWith('tmp_')) {
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
    super.track(event, payload) // local + bus (dashboard en otra pestaña)
    this.buffer.push({ event, ...(payload ? { payload } : {}), ts: new Date().toISOString() })
    this.scheduleFlush()
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

  private hydrateContent(): void {
    this.api.get<CatalogProfile[]>('/catalog').then((c) => { this.catalog = c; bus.emit('catalog') }).catch(() => {})
    this.api.get<Gallery[]>('/galleries').then((g) => { this.galleries = g; bus.emit('galleries') }).catch(() => {})
    this.api.get<ContentItem[]>('/contents').then((c) => { this.contents = c; bus.emit('contents') }).catch(() => {})
    this.api.get<string[]>('/favorites').then((f) => { this.favorites = f; bus.emit('favorites') }).catch(() => {})
    this.api.get<PhotoDownload[]>('/downloads').then((d) => { this.downloads = d; bus.emit('downloads') }).catch(() => {})
  }

  override getCatalog(): CatalogProfile[] {
    return this.catalog ?? super.getCatalog()
  }
  override getCatalogProfile(slug: string): CatalogProfile | undefined {
    return this.catalog ? this.catalog.find((c) => c.slug === slug) : super.getCatalogProfile(slug)
  }
  override getGalleries(): Gallery[] {
    return this.galleries ?? super.getGalleries()
  }
  override getGallery(slug: string): Gallery | undefined {
    return this.galleries ? this.galleries.find((g) => g.slug === slug) : super.getGallery(slug)
  }
  override getContents(): ContentItem[] {
    return this.contents ?? super.getContents()
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
    if (this.favorites.includes(photoId)) {
      this.favorites = this.favorites.filter((p) => p !== photoId)
      this.api.del(`/favorites/${photoId}`).catch(() => {})
    } else {
      this.favorites = [...this.favorites, photoId]
      this.api.put(`/favorites/${photoId}`).catch(() => {})
    }
    bus.emit('favorites')
  }

  override recordDownload(photoId: string, galleryId: string): void {
    if (!this.downloads) {
      super.recordDownload(photoId, galleryId)
      return
    }
    const sponsorId = this.galleries?.find((g) => g.id === galleryId)?.sponsorId ?? ''
    this.downloads = [{ photoId, galleryId, sponsorId, ts: new Date().toISOString() }, ...this.downloads]
    this.track('photo_download', { photoId, galleryId, sponsorId }) // → local + analytics backend
    bus.emit('downloads')
    this.api.post('/downloads', { photoId, galleryId }).catch(() => {})
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

  override createEvent(input: NewEvent): EventItem {
    if (!this.events) return super.createEvent(input)
    const event: EventItem = { ...input, id: newId('ev'), slug: input.slug || this.uniqueSlug(slugify(input.title)) }
    this.events = [...this.events, event]
    this.track('admin_event_created', { eventId: event.id, type: event.type })
    bus.emit('events')
    this.api.post('/admin/events', event).then(() => this.hydrateEvents()).catch(() => this.hydrateEvents())
    return event
  }
  override updateEvent(id: string, patch: Partial<EventItem>): void {
    if (!this.events) return super.updateEvent(id, patch)
    this.events = this.events.map((e) => (e.id === id ? { ...e, ...patch } : e))
    this.track('admin_event_updated', { eventId: id })
    bus.emit('events')
    this.api.patch(`/admin/events/${id}`, patch).then(() => this.hydrateEvents()).catch(() => this.hydrateEvents())
  }
  override deleteEvent(id: string): void {
    if (!this.events) return super.deleteEvent(id)
    const prev = this.events
    this.events = this.events.filter((e) => e.id !== id)
    this.blocksByEvent.delete(id)
    this.track('admin_event_deleted', { eventId: id })
    bus.emit('events')
    this.api.del(`/admin/events/${id}`).catch(() => {
      this.events = prev // revertir si el server rechaza (ej. 409 con inscripciones)
      bus.emit('events')
    })
  }

  override createBlock(input: NewBlock): EventBlock {
    if (!this.events) return super.createBlock(input)
    const block: EventBlock = { ...input, id: newId('blk') }
    this.blocksByEvent.set(block.eventId, [...(this.blocksByEvent.get(block.eventId) ?? []), block])
    this.blocksById.set(block.id, block)
    this.track('admin_block_created', { blockId: block.id, eventId: block.eventId })
    bus.emit('blocks')
    this.api.post('/admin/blocks', block).then(() => this.hydrateEvents()).catch(() => this.hydrateEvents())
    return block
  }
  override updateBlock(id: string, patch: Partial<EventBlock>): void {
    if (!this.events) return super.updateBlock(id, patch)
    const cur = this.blocksById.get(id)
    if (cur) {
      const next = { ...cur, ...patch }
      this.blocksById.set(id, next)
      this.blocksByEvent.set(next.eventId, (this.blocksByEvent.get(next.eventId) ?? []).map((b) => (b.id === id ? next : b)))
    }
    this.track('admin_block_updated', { blockId: id })
    bus.emit('blocks')
    this.api.patch(`/admin/blocks/${id}`, patch).then(() => this.hydrateEvents()).catch(() => this.hydrateEvents())
  }
  override deleteBlock(id: string): void {
    if (!this.events) return super.deleteBlock(id)
    const cur = this.blocksById.get(id)
    this.blocksById.delete(id)
    if (cur) this.blocksByEvent.set(cur.eventId, (this.blocksByEvent.get(cur.eventId) ?? []).filter((b) => b.id !== id))
    this.track('admin_block_deleted', { blockId: id })
    bus.emit('blocks')
    this.api.del(`/admin/blocks/${id}`).catch(() => this.hydrateEvents())
  }

  override createContent(input: NewContent): ContentItem {
    if (!this.contents) return super.createContent(input)
    const content: ContentItem = { ...input, id: newId('vid') }
    this.contents = [content, ...this.contents]
    this.track('admin_content_created', { contentId: content.id })
    bus.emit('contents')
    this.api.post('/admin/contents', content).then(() => this.refetchContents()).catch(() => this.refetchContents())
    return content
  }
  override updateContent(id: string, patch: Partial<ContentItem>): void {
    if (!this.contents) return super.updateContent(id, patch)
    this.contents = this.contents.map((c) => (c.id === id ? { ...c, ...patch } : c))
    this.track('admin_content_updated', { contentId: id })
    bus.emit('contents')
    this.api.patch(`/admin/contents/${id}`, patch).then(() => this.refetchContents()).catch(() => this.refetchContents())
  }
  override deleteContent(id: string): void {
    if (!this.contents) return super.deleteContent(id)
    this.contents = this.contents.filter((c) => c.id !== id)
    this.track('admin_content_deleted', { contentId: id })
    bus.emit('contents')
    this.api.del(`/admin/contents/${id}`).catch(() => this.refetchContents())
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
