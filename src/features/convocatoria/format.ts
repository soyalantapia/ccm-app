import type { Convocatoria, ConvocatoriaField, DeviceProfile, ProfileFieldKey } from '../../data/types'

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** '2026-06-16' → '16 de junio' (sin parsear como UTC para no correr el día). */
export function formatDeadline(iso: string): string {
  const [, month, day] = iso.split('-').map(Number)
  if (!month || !day) return iso
  return `${day} de ${MONTHS[month - 1]}`
}

/** Timestamp ISO → '10 de junio' (para el resumen de la postulación). */
export function formatApplicationDate(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`
}

/** Regla showIf: el campo se muestra solo si el campo controlador tiene el valor exacto. */
export function isFieldVisible(field: ConvocatoriaField, values: Record<string, string>): boolean {
  if (!field.showIf) return true
  return values[field.showIf.key] === field.showIf.equals
}

/**
 * Pre-llenado desde el perfil del dispositivo (D22): mapea las keys del form
 * "Camino a CCM" con los campos progresivos ya capturados.
 */
export function buildPrefill(convocatoria: Convocatoria, profile: DeviceProfile): Record<string, string> {
  const get = (key: ProfileFieldKey) => profile.fields[key]?.value ?? ''
  const fullName = [get('firstName'), get('lastName')].filter(Boolean).join(' ')
  const candidates: Record<string, string> = {
    nombre: fullName,
    email: get('email'),
    telefono: get('phone'),
    dni: get('dni'),
    instagram: get('instagram'),
  }
  const prefill: Record<string, string> = {}
  for (const field of convocatoria.fields) {
    const value = candidates[field.key]
    if (value) prefill[field.key] = value
  }
  return prefill
}
