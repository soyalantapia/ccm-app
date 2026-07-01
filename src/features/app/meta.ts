import { store } from '../../data/store'
import type { ApplicationStatus, OrderStatus, Registration } from '../../data/types'
import type { BadgeTone } from '../../components/ui/Badge'

/** Estados de orden VIP → copy + tono de Badge (PRD §8.3). */
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  iniciada: { label: 'Iniciada', tone: 'neutral' },
  redirigida_mp: { label: 'Confirmando pago', tone: 'accent' },
  confirmada: { label: 'Confirmada', tone: 'success' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
}

/** Estados de postulación → copy + tono de Badge (PRD §8.5). */
export const APPLICATION_STATUS_META: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  preinscripta: { label: 'En revisión', tone: 'accent' },
  aceptada: { label: 'Aceptada', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
}

/** Acción que originó la captura de un campo → frase legible ("capturado al …"). */
const SOURCE_LABELS: Record<string, string> = {
  registro_general: 'registrarte gratis',
  inscripcion_evento: 'inscribirte a un evento',
  inscripcion_bloque: 'inscribirte a un bloque',
  compra_vip: 'comprar tu entrada VIP',
  descarga_foto: 'descargar una foto',
  postulacion: 'postularte',
  postulacion_camino: 'postularte al Camino a CCM',
  edicion_perfil: 'editar tu perfil',
}

export function sourceLabel(source: string | undefined): string {
  if (!source) return 'registro'
  return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ')
}

/** Fecha corta editorial: '11 jun'. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/** Clave cronológica de una inscripción (evento o bloque) para ordenar agendas. */
export function registrationSortKey(r: Registration): string {
  const event = store.getEventById(r.eventId)
  const block = r.blockId ? store.getBlock(r.blockId) : undefined
  if (block) {
    const [d = '', m = ''] = block.day.split('/')
    const year = event?.startDate.slice(0, 4) ?? '2026'
    return `${year}-${m}-${d} ${block.start}`
  }
  return `${event?.startDate ?? '9999'} 00:00`
}
