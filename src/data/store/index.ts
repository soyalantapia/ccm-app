import { useMemo, useSyncExternalStore } from 'react'
import { bus } from '../../lib/bus'
import { LocalDataStore } from './LocalDataStore'
import { RemoteDataStore } from './RemoteDataStore'
import type { DataStore } from './DataStore'

export type { DataStore, BlockAvailability, PhotoDownload } from './DataStore'

/**
 * Singleton: la UI consume SOLO esto. Con VITE_API_URL seteada usa el backend real
 * (RemoteDataStore, Fase A: perfil + analytics); sin ella cae al LocalDataStore
 * (demo offline / GH Pages) — el fallback nunca se rompe.
 */
const API_BASE = import.meta.env.VITE_API_URL as string | undefined
export const store: DataStore = API_BASE ? new RemoteDataStore(API_BASE) : new LocalDataStore()

/**
 * Única fuente de verdad sobre "¿esto es la demo o el sistema real?".
 * La UI la usa para no mentirle al organizador: había carteles fijos que decían
 * "los datos viven en este dispositivo" cuando en producción ya viven en el backend.
 */
export const IS_REMOTE = Boolean(API_BASE)

/* Reactividad: cualquier escritura (esta pestaña u otra) bumpea la versión. */
let version = 0
const subscribers = new Set<() => void>()

bus.on(() => {
  version++
  subscribers.forEach((notify) => notify())
})

function subscribe(notify: () => void): () => void {
  subscribers.add(notify)
  return () => subscribers.delete(notify)
}

export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}

/**
 * Hook de lectura reactiva:
 *   const events = useStore((s) => s.getEvents())
 * Se recalcula ante cualquier escritura local o de otra pestaña.
 */
export function useStore<T>(selector: (s: DataStore) => T): T {
  const v = useDataVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => selector(store), [v])
}
