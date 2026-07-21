import { useQuery } from '@tanstack/react-query'
import { store, apiBase } from './store'
import type { BlockAvailability } from './store'
import type { EventItem, EventBlock, Registration, Benefit, Banner, Nota } from './types'
import { createApi } from '../lib/api'

/**
 * Hooks de lectura reactiva sobre el DataStore, vía TanStack Query (migración async).
 * `useStoreQuery` envuelve la lectura del store: `initialData` da el valor al instante
 * (store sync hoy) y la `queryFn` lo revalida cuando el bus invalida la key. Reemplaza a
 * `useStore((s) => s.getX())`. Cada bus key ('events', 'blocks', …) = prefijo de su queryKey.
 */
function useStoreQuery<T>(key: unknown[], read: () => T): T {
  // initialData (función) garantiza data definida en el primer render; el cast cierra el
  // tipo (useQuery lo ensancha a T | undefined por la inferencia del genérico).
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => Promise.resolve(read()),
    initialData: read,
  })
  return data as T
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

/* ─── Notas / novedades ─── */

export function useNotas(): Nota[] {
  return useStoreQuery(['notas'], () => store.getNotas())
}
export function useNota(slug: string): Nota | undefined {
  return useStoreQuery(['notas', slug], () => store.getNota(slug))
}

/* ─── CRM de usuarios (Personas) ─── */

const api = createApi(apiBase)

export interface PersonaListItem {
  id: string
  nombre: string | null
  email: string | null
  telefono: string | null
  dni: string | null
  esSocio: boolean
  inscripciones: number
  postulaciones: number
  creadaEl: string
  ultimaActividad: string | null
}

export interface PersonaCampo { key: string; value: string; source: string; capturedAt: string }

export interface PersonaFicha extends PersonaListItem {
  campos: PersonaCampo[]
  consentimientos: { terms: string | null; news: string | null; sponsors: string | null }
  inscripcionesDetalle: { id: string; eventId: string; blockId: string | null; status: string; ts: string }[]
  postulacionesDetalle: { id: string; convocatoriaId: string; status: string; ts: string; data: unknown }[]
  membresia: { tier: string; since: string | null } | null
  actividad: { type: string; ts: string; meta: unknown }[]
}

interface RespuestaLista { items: PersonaListItem[]; nextCursor: string | null; anonimos: number }

/** Lista de usuarios del CRM. `q` ya viene con debounce desde la página. */
export function usePeople(q: string) {
  return useQuery<RespuestaLista>({
    queryKey: ['people', q],
    queryFn: () => api.get<RespuestaLista>(`/admin/people${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  })
}

export function usePerson(id: string | null) {
  return useQuery<PersonaFicha>({
    queryKey: ['people', 'ficha', id],
    queryFn: () => api.get<PersonaFicha>(`/admin/people/${id}`),
    enabled: id !== null,
  })
}
