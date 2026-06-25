import { useQuery } from '@tanstack/react-query'
import { store } from './store'
import type { BlockAvailability } from './store'
import type { EventItem, EventBlock, Registration, Benefit, Banner } from './types'

/**
 * Hooks de lectura reactiva sobre el DataStore, vía TanStack Query (migración async).
 * `useStoreQuery` envuelve la lectura del store: `initialData` da el valor al instante
 * (store sync hoy) y la `queryFn` lo revalida cuando el bus invalida la key. Reemplaza a
 * `useStore((s) => s.getX())`. Cada bus key ('events', 'blocks', …) = prefijo de su queryKey.
 */
function useStoreQuery<T>(key: unknown[], read: () => T): T {
  return useQuery({
    queryKey: key,
    queryFn: () => Promise.resolve(read()),
    initialData: read,
  }).data
}

/* ─── Eventos / bloques / inscripciones ─── */

export function useEvents(): EventItem[] {
  return useStoreQuery(['events'], () => store.getEvents())
}
export function useEvent(slug: string): EventItem | undefined {
  return useStoreQuery(['events', 'slug', slug], () => store.getEvent(slug))
}
export function useEventById(id: string): EventItem | undefined {
  return useStoreQuery(['events', 'id', id], () => store.getEventById(id))
}
export function useBlocks(eventId: string): EventBlock[] {
  return useStoreQuery(['blocks', eventId], () => store.getBlocks(eventId))
}
export function useBlock(blockId: string): EventBlock | undefined {
  return useStoreQuery(['blocks', 'one', blockId], () => store.getBlock(blockId))
}
export function useAvailability(blockId: string): BlockAvailability {
  return useStoreQuery(['availability', blockId], () => store.blockAvailability(blockId))
}
export function useRegistrations(): Registration[] {
  return useStoreQuery(['registrations'], () => store.getRegistrations())
}
export function useIsRegistered(eventId: string, blockId?: string): boolean {
  return useStoreQuery(['registrations', eventId, blockId ?? null], () => store.isRegistered(eventId, blockId))
}

/* ─── Beneficios ─── */

export function useBenefits(): Benefit[] {
  return useStoreQuery(['benefits'], () => store.getBenefits())
}

/* ─── Banners gestionados ─── */

export function useBanners(): Banner[] {
  return useStoreQuery(['banners'], () => store.getBanners())
}
