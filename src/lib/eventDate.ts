/**
 * La fecha de un evento, en un solo lugar.
 *
 * El modelo guarda DOS cosas: `startDate` (la fecha real, ISO) y `dateLabel` (el texto que ve el
 * público). Nada garantizaba que dijeran lo mismo, y en producción no lo decían: dos capacitaciones
 * anunciaban un día de la semana equivocado. Acá vive la derivación del texto a partir de la fecha,
 * para que el organizador no tenga que escribir dos veces lo mismo y no pueda equivocarse.
 *
 * Y la otra mitad del problema: si el evento ya pasó lo dice la FECHA, no un tilde manual que
 * alguien se puede olvidar de marcar — y se olvidó: dos Caminos de junio seguían anunciados como
 * próximos 32 días después.
 *
 * ⚠️ Todo se compara como fecha sin hora (YYYY-MM-DD). `new Date('2026-06-18')` se parsea como
 * medianoche UTC, que en Argentina (UTC-3) es el día ANTERIOR a las 21:00 — comparar así corría
 * todo un día. Es el mismo error de zona horaria que ya nos mordió con el cierre de convocatorias.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

const soloFecha = (iso: string): string => iso.slice(0, 10)

/** Hoy en formato YYYY-MM-DD, según el reloj de quien mira (no UTC). */
export function hoyISO(ahora: Date = new Date()): string {
  const y = ahora.getFullYear()
  const m = String(ahora.getMonth() + 1).padStart(2, '0')
  const d = String(ahora.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parsea 'YYYY-MM-DD' como fecha LOCAL (no UTC), para que el día de la semana sea el correcto. */
function comoFechaLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * El texto que ve el público, derivado de la fecha: "Jueves 18 de junio".
 *
 * Sin año a propósito: así se lee igual que lo venía escribiendo el equipo, y el año ya está
 * implícito en la agenda de la edición. Devuelve '' si la fecha no se puede parsear, para que
 * quien llame decida (nunca inventa un texto).
 */
export function fechaEnTexto(iso: string): string {
  const d = comoFechaLocal(iso)
  if (!d) return ''
  const dia = DIAS[d.getDay()]
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`
}

/**
 * ¿Este texto es el que se generaría solo para esa fecha?
 *
 * Sirve para saber si el organizador lo personalizó (por ejemplo "19 y 20 de septiembre", que
 * ninguna fecha sola puede producir) o si simplemente quedó el automático.
 */
export function esTextoAutomatico(iso: string, texto: string): boolean {
  return fechaEnTexto(iso).toLowerCase() === texto.trim().toLowerCase()
}

/** ¿El texto contradice a la fecha? Detecta el día de la semana equivocado, que es lo que pasó
 *  en producción. Un texto sin día de la semana ("19 y 20 de septiembre") NO es una contradicción. */
export function textoContradiceLaFecha(iso: string, texto: string): string | null {
  const d = comoFechaLocal(iso)
  if (!d) return null
  const m = /(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)/i.exec(texto)
  if (!m) return null
  const dicho = m[1].toLowerCase().replace('miercoles', 'miércoles').replace('sabado', 'sábado')
  const real = DIAS[d.getDay()]
  return dicho === real ? null : `Esa fecha cae ${real}, no ${dicho}.`
}

/**
 * ¿El evento ya pasó?
 *
 * Lo decide la fecha. `past` se respeta como override manual —sirve para cerrar un evento antes
 * de tiempo, por ejemplo si se suspende— pero no hace falta tildarlo para que un evento viejo
 * deje de anunciarse: eso ahora ocurre solo.
 */
export function yaPaso(e: { startDate: string; past?: boolean }, ahora: Date = new Date()): boolean {
  if (e.past) return true
  if (!e.startDate) return false
  return soloFecha(e.startDate) < hoyISO(ahora)
}

/** El complemento, para leer más natural en los filtros de listados. */
export const estaPorVenir = (e: { startDate: string; past?: boolean }, ahora?: Date): boolean =>
  !yaPaso(e, ahora)
