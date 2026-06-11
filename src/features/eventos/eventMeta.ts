import type { EventType } from '../../data/types'

/** Etiqueta singular del tipo (eyebrow de ficha, meta de card). */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  principal: 'Evento principal',
  camino: 'Camino a CCM',
  capacitacion: 'Capacitación',
}

/** Etiquetas para las tabs del listado /eventos. */
export const EVENT_TYPE_TABS: Record<EventType, string> = {
  principal: 'Evento principal',
  camino: 'Caminos a CCM',
  capacitacion: 'Capacitaciones',
}

/** Orden canónico de las tabs (después de "Todos"). */
export const EVENT_TYPE_ORDER: EventType[] = ['principal', 'camino', 'capacitacion']

const DAY_LABELS: Record<string, string> = {
  '18/06': 'Jueves 18 de junio',
  '30/06': 'Martes 30 de junio',
  '19/09': 'Sábado 19 de septiembre',
  '20/09': 'Domingo 20 de septiembre',
}

/** Header editorial de día para la grilla de bloques. */
export function dayLabel(day: string): string {
  return DAY_LABELS[day] ?? `Día ${day}`
}

/** Clave cronológica día+hora ('18/06' + '17:00' → '0618 17:00') para ordenar bloques. */
export function blockSortKey(block: { day: string; start: string }): string {
  const [d = '', m = ''] = block.day.split('/')
  return `${m}${d} ${block.start}`
}
