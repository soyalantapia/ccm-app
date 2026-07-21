import type { Application, ApplicationStatus, ConvocatoriaField } from '../../data/types'

/** Tab de la cola de postulaciones. Vive en la URL (`?tab=`) — sin eso, "Volver" desde la
 *  ficha no tiene qué filtro preservar y ↑/↓ no sabe en qué subconjunto moverse. */
export type ApplicationTab = 'todas' | ApplicationStatus
export const APPLICATION_TABS: ApplicationTab[] = ['todas', 'preinscripta', 'aceptada', 'rechazada']

/** Tab válido desde un valor crudo de query string (ej. `searchParams.get('tab')`), con
 *  fallback a 'todas' ante cualquier valor ausente o que no sea un tab real. */
export function parseApplicationTab(raw: string | null): ApplicationTab {
  return (APPLICATION_TABS as string[]).includes(raw ?? '') ? (raw as ApplicationTab) : 'todas'
}

/** Query string para conservar el tab activo entre la lista y la ficha ('todas' no se escribe:
 *  es el default, y así la URL queda limpia cuando no hay filtro). */
export function applicationTabQuery(tab: ApplicationTab): string {
  return tab === 'todas' ? '' : `?tab=${tab}`
}

/** Filtra las postulaciones por tab, con el MISMO criterio en la lista y en la ficha — así el
 *  subconjunto que recorre ↑/↓ es exactamente el que se ve al volver. */
export function filterByApplicationTab(applications: Application[], tab: ApplicationTab): Application[] {
  return tab === 'todas' ? applications : applications.filter((a) => a.status === tab)
}

/** Humaniza una key sin label propio (ej. "acompananteDatos" → "Acompañante datos"). */
export function humanizeFieldKey(key: string): string {
  const s = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface DerivedApplicationFields {
  /** Nombre de quien postula, o "Postulación" si no hay ningún campo reconocible como nombre. */
  title: string
  /** Historia/bio en texto largo, o '' si la convocatoria no tiene ese campo. */
  story: string
  /** Valor del campo de contacto tipo email, si hay uno. */
  email?: string
  /** Valor del campo de contacto tipo teléfono, si hay uno. */
  telefono?: string
  /** El resto de las keys de app.data, sin repetir título, historia, email ni teléfono. */
  rowKeys: string[]
  /** Etiqueta legible de una key: el label real de la convocatoria, o humanizeFieldKey. */
  labelOf: (key: string) => string
}

/**
 * Deriva título, historia, contacto y filas de app.data. Las claves varían según la
 * convocatoria —no hay un shape fijo de postulación—, así que se buscan por heurística de
 * nombre + tipo de campo, con fallback a las keys crudas de app.data cuando la convocatoria no
 * está cargada.
 *
 * Compartido entre OpsApplicationCard (resumen en la lista) y AdminPostulacionDetalle (ficha
 * completa en su propia ruta): antes esta lógica vivía SOLO en la card, y antes de eso estaba
 * clavada al form semilla (cualquier convocatoria nueva del organizador rendía "Sin nombre").
 */
export function deriveApplicationFields(
  app: Application,
  fields: ConvocatoriaField[],
): DerivedApplicationFields {
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? humanizeFieldKey(key)

  const nameKey =
    ['nombre', 'name', 'firstName'].find((k) => app.data[k]) ??
    fields.find((f) => /nombre|name/i.test(f.key))?.key
  const storyKey =
    ['historia', 'bio', 'mensaje', 'story'].find((k) => app.data[k]) ??
    fields.find((f) => f.type === 'textarea')?.key
  // Acá al revés que nombre/historia: el TIPO declarado de la convocatoria ('email'/'tel') es
  // una señal más fuerte que adivinar por el nombre de la key, así que se prueba primero — la
  // heurística por key queda de fallback para cuando la convocatoria todavía no cargó (fields: []).
  const emailKey = fields.find((f) => f.type === 'email')?.key ?? ['email', 'mail'].find((k) => app.data[k])
  const telKey =
    fields.find((f) => f.type === 'tel')?.key ??
    ['telefono', 'phone', 'tel', 'celular'].find((k) => app.data[k])

  const title = (nameKey && app.data[nameKey]) || 'Postulación'
  const story = (storyKey && app.data[storyKey]) || ''
  const email = (emailKey && app.data[emailKey]) || undefined
  const telefono = (telKey && app.data[telKey]) || undefined
  const rowKeys = Object.keys(app.data).filter(
    (k) => k !== nameKey && k !== storyKey && k !== emailKey && k !== telKey,
  )

  return { title, story, email, telefono, rowKeys, labelOf }
}
