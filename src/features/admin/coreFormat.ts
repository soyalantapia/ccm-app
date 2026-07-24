import type {
  ApplicationStatus,
  EventType,
  OrderStatus,
  ProfileFieldKey,
} from '../../data/types'

/** Tonos válidos del <Badge> del UI kit (misma unión que BadgeTone). */
export type CoreBadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'night' | 'outline'

/* ─── Metadatos de estados ─────────────────────────────────────────── */

export const ORDER_STATUSES: OrderStatus[] = ['iniciada', 'redirigida_mp', 'confirmada', 'cancelada']

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: CoreBadgeTone }> = {
  iniciada: { label: 'Iniciada', tone: 'neutral' },
  redirigida_mp: { label: 'Redirigida a MP', tone: 'accent' },
  confirmada: { label: 'Confirmada', tone: 'success' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
}

export const APPLICATION_STATUS_META: Record<ApplicationStatus, { label: string; tone: CoreBadgeTone }> = {
  preinscripta: { label: 'Preinscripta', tone: 'accent' },
  aceptada: { label: 'Aceptada', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
}

export const EVENT_TYPE_META: Record<EventType, { label: string; tone: CoreBadgeTone }> = {
  principal: { label: 'Principal', tone: 'night' },
  camino: { label: 'Camino', tone: 'accent' },
  capacitacion: { label: 'Capacitación', tone: 'neutral' },
}

/* ─── Campos de perfil (CRM) ───────────────────────────────────────── */

export const PROFILE_FIELD_ORDER: ProfileFieldKey[] = [
  'firstName',
  'lastName',
  'email',
  'profession',
  'phone',
  'dni',
  'city',
  'instagram',
]

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  firstName: 'Nombre',
  lastName: 'Apellido',
  email: 'Email',
  profession: 'Profesión',
  phone: 'Teléfono',
  dni: 'DNI',
  city: 'Ciudad',
  instagram: 'Instagram',
}

/** Claves que la ficha del CRM puede mostrar y que NO son ProfileFieldKey: salen del JSON de una
 *  postulación, no del perfil del sitio. `nombre` es el nombre COMPLETO tal como lo escribió la
 *  persona al postularse, así que no es intercambiable con `firstName` ("Nombre") — de ahí que
 *  lleve etiqueta propia, y no que se lo mapee a firstName, que sería decir algo falso del dato. */
const CAMPO_POSTULACION_LABELS: Record<string, string> = {
  nombre: 'Nombre completo',
}

/** Etiqueta legible de un campo de la ficha, buscando por string y no por ProfileFieldKey: la
 *  ficha mezcla campos del perfil con campos de postulaciones, y castear la clave a
 *  ProfileFieldKey escondía los segundos —el tipo decía que no existían—, que terminaban
 *  cayendo al fallback y mostrándose crudos ("nombre" en minúscula). */
export function campoLabel(key: string): string {
  return PROFILE_FIELD_LABELS[key as ProfileFieldKey] ?? CAMPO_POSTULACION_LABELS[key] ?? key
}

const SOURCE_LABELS: Record<string, string> = {
  registro_general: 'Registro gratis',
  inscripcion_evento: 'Inscripción a evento',
  inscripcion_bloque: 'Inscripción a bloque',
  compra_vip: 'Compra de entrada VIP',
  descarga_foto: 'Descarga de foto',
  postulacion: 'Postulación',
  postulacion_camino: 'Postulación Camino a CCM',
  cuenta: 'Datos de la cuenta',
}

/** Humaniza la acción que originó la captura de un dato (PRD §7). */
export function sourceLabel(source: string): string {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source]
  const pretty = source.replace(/_/g, ' ')
  return pretty.charAt(0).toUpperCase() + pretty.slice(1)
}

/* ─── Fechas ───────────────────────────────────────────────────────── */

/** "hace 2 min" / "hace 3 h" / "hace 2 días" / "04/06". */
export function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 8) return days === 1 ? 'hace 1 día' : `hace ${days} días`
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

/** "04/06/2026 · 10:12 hs". */
export function formatDateTime(ts: string): string {
  const d = new Date(ts)
  const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time} hs`
}

export function percent(taken: number, capacity: number): number {
  if (capacity <= 0) return 0
  return Math.min(100, Math.round((taken / capacity) * 100))
}

/** "$ 891.000" — moneda AR sin decimales. */
export function formatMoney(value: number): string {
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}
