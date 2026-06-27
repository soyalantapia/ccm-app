import type { EventItem } from '../data/types'

/**
 * Generación de archivos iCalendar (.ics) para "Agregar al calendario".
 *
 * Sin dependencias ni backend: arma un VCALENDAR/VEVENT válido a partir de un
 * EventItem del seed y lo descarga como blob `text/calendar`. El UID es estable
 * por evento (mismo evento → misma entrada de calendario, sin duplicar).
 */

const PRODID = '-//Córdoba Corazón de Moda//CCM App//ES'
/** Argentina (UTC-3) — no observa horario de verano. */
const TZ_OFFSET = '-03:00'
/** Duración por defecto cuando no hay hora de fin parseable (3 hs). */
const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000

/** Plegado/escapado de texto según RFC 5545 (comas, punto y coma, barra, saltos). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Slug ASCII a partir del título (para el filename del .ics). */
function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'evento'
  )
}

/** Timestamp UTC compacto: 20260919T120000Z. */
function toUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Fecha (solo día) compacta: 20260919 — para eventos all-day. */
function toDateStamp(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, '')
}

/**
 * Intenta extraer la primera hora ("17 a 21 hs", "Sáb 9 a 21 hs · …") y
 * devuelve hora/min de inicio y fin si las hay. Si no encuentra hora → null
 * (el evento se trata como all-day).
 */
function parseTime(timeLabel?: string): { startHour: number; startMin: number; endHour?: number } | null {
  if (!timeLabel) return null
  const hours = [...timeLabel.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(?:hs?|h)?/gi)]
    .map((m) => ({ h: Number(m[1]), min: m[2] ? Number(m[2]) : 0 }))
    .filter(({ h }) => h >= 0 && h <= 23)
  if (hours.length === 0) return null
  const start = hours[0]
  // La segunda cifra suele ser el horario de cierre del mismo día.
  const end = hours.length > 1 ? hours[1] : undefined
  return {
    startHour: start.h,
    startMin: start.min,
    endHour: end && end.h > start.h ? end.h : undefined,
  }
}

/** Construye un Date local-AR a partir de fecha ISO + hora/min, como instante UTC. */
function atLocalTime(isoDate: string, hour: number, min: number): Date {
  return new Date(`${isoDate.slice(0, 10)}T${pad(hour)}:${pad(min)}:00${TZ_OFFSET}`)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Arma el contenido VCALENDAR/VEVENT. Líneas separadas por CRLF (\r\n).
 * `url` es opcional (link a la ficha del evento dentro de la app).
 */
export function buildIcs(event: EventItem, url?: string): string {
  const time = parseTime(event.timeLabel)
  const uid = `${event.id}@ccm-cordoba`
  const dtstamp = toUtcStamp(new Date())

  let dtStart: string
  let dtEnd: string
  if (time) {
    const start = atLocalTime(event.startDate, time.startHour, time.startMin)
    const end =
      time.endHour !== undefined
        ? atLocalTime(event.startDate, time.endHour, 0)
        : new Date(start.getTime() + DEFAULT_DURATION_MS)
    dtStart = `DTSTART:${toUtcStamp(start)}`
    dtEnd = `DTEND:${toUtcStamp(end)}`
  } else {
    // All-day: DTEND es exclusivo → día siguiente.
    const startStamp = toDateStamp(event.startDate)
    const next = new Date(`${event.startDate.slice(0, 10)}T00:00:00${TZ_OFFSET}`)
    next.setDate(next.getDate() + 1)
    dtStart = `DTSTART;VALUE=DATE:${startStamp}`
    dtEnd = `DTEND;VALUE=DATE:${toDateStamp(next.toISOString())}`
  }

  const summary = event.subtitle ? `${event.title} — ${event.subtitle}` : event.title
  const location = [event.venue, event.address].filter(Boolean).join(', ')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escapeText(summary)}`,
    `LOCATION:${escapeText(location)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(url ? [`URL:${escapeText(url)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.join('\r\n')
}

/** Link a la ficha del evento dentro de la app (respeta el base: /ccm-app/ o /). */
function eventUrl(event: EventItem): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${import.meta.env.BASE_URL}eventos/${event.slug}`
}

/**
 * Descarga el .ics del evento como blob `text/calendar`. Filename = slug del
 * título. No saca al usuario de la app: dispara la descarga nativa del sistema.
 */
export function downloadIcs(event: EventItem): void {
  const content = buildIcs(event, eventUrl(event))
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = `ccm-${slugify(event.title)}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Liberar la URL del blob en el siguiente tick.
  setTimeout(() => URL.revokeObjectURL(href), 0)
}
