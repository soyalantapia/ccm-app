import { useMemo, useSyncExternalStore } from 'react'
import { bus } from '../../lib/bus'
import { LocalDataStore } from './LocalDataStore'
import type { DataStore } from './DataStore'

export type { DataStore, BlockAvailability, PhotoDownload } from './DataStore'

/** Singleton: la UI consume SOLO esto (Fase 1 cambia la implementación acá). */
export const store: DataStore = new LocalDataStore()

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
