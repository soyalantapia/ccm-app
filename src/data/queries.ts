import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
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
  ordenesDetalle: {
    id: string
    planId: string
    planTitle: string
    status: string
    qty: number
    total: number
    ts: string
  }[]
  membresia: { tier: string; since: string | null } | null
  actividad: { type: string; ts: string; meta: unknown }[]
}

interface RespuestaLista { items: PersonaListItem[]; nextCursor: string | null; anonimos: number }

/**
 * Lista de usuarios del CRM. `q` ya viene con debounce desde la página.
 *
 * Paginada de a 50 con cursor. Antes se pedía una sola página y el resto quedaba invisible sin
 * ningún aviso: con 27 personas no se notaba, pero en cuanto la base crece el organizador ve
 * una lista incompleta creyendo que está completa, que es peor que ver un botón de "ver más".
 */
export function usePeople(q: string) {
  return useInfiniteQuery<RespuestaLista>({
    queryKey: ['people', q],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (pageParam) params.set('cursor', pageParam as string)
      const qs = params.toString()
      return api.get<RespuestaLista>(`/admin/people${qs ? `?${qs}` : ''}`)
    },
    getNextPageParam: (ultima) => ultima.nextCursor,
  })
}

export function usePerson(id: string | null) {
  return useQuery<PersonaFicha>({
    queryKey: ['people', 'ficha', id],
    queryFn: () => api.get<PersonaFicha>(`/admin/people/${id}`),
    enabled: id !== null,
  })
}

/* ─── Entradas regaladas (cortesías) — lado del organizador ─── */

export interface GrantFicha {
  id: string
  eventId: string
  eventTitle: string
  qty: number
  status: 'pendiente' | 'reclamado' | 'revocado'
  createdAt: string
  /** null cuando está revocada: el link ya no sirve, no se muestra. */
  link: string | null
}

/** Resultado del envío del mail. `enviado:false` es honesto: el grant SÍ se creó, pero el mail no
 *  salió (la persona no tiene email, o el mailer no confirmó). El link queda igual en la ficha. */
export interface GrantEnvio { enviado: boolean; motivo?: string; detalle?: string }

/** Las cortesías de una persona, para pintarlas en su ficha. */
export function usePersonGrants(personId: string | null) {
  return useQuery<GrantFicha[]>({
    queryKey: ['grants', personId],
    queryFn: () => api.get<GrantFicha[]>(`/admin/people/${personId}/grants`),
    enabled: personId !== null,
  })
}

/** Regala N entradas de un evento a una persona. Devuelve el link y el resultado del envío del mail. */
export function regalarEntradas(input: { personId: string; eventId: string; qty: number; note?: string }) {
  return api.post<GrantFicha & { envio: GrantEnvio }>('/admin/grants', input)
}

/** Reenvía el mail de una cortesía (mismo link). */
export function reenviarRegalo(grantId: string) {
  return api.post<GrantEnvio>(`/admin/grants/${grantId}/resend`, {})
}

/** Revoca una cortesía (si estaba reclamada, cancela también la inscripción que creó). */
export function revocarRegalo(grantId: string) {
  return api.del(`/admin/grants/${grantId}`)
}
