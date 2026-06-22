import { LocalDataStore } from './LocalDataStore'
import { createApi, type ApiClient } from '../../lib/api'
import { bus } from '../../lib/bus'
import { hydrateFromRemote } from '../../lib/identity'
import type { DeviceProfile, ProfileFieldKey } from '../types'

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

  constructor(apiBase: string) {
    super()
    this.api = createApi(apiBase)
    this.hydrateProfile()
    if (typeof window !== 'undefined') {
      const flush = () => this.flush()
      window.addEventListener('pagehide', flush)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush()
      })
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
