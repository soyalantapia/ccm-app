import { prisma } from '../lib/prisma.js'
import { toAnalyticsEvent } from '../lib/serialize.js'
import type { AnalyticsEvent as DomainAnalyticsEvent } from '@domain/types'

export interface IncomingEvent {
  event: string
  payload?: Record<string, unknown>
  ts?: string
}

/**
 * Ingesta batch del event bus first-party (doc 08). Fire-and-forget desde el front:
 * un evento perdido nunca debe romper nada. deviceId = id interno (FK → Device.id).
 */
/** Ventana de confianza para el `ts` que declara el cliente. */
const TS_PASADO_MAX_MS = 24 * 60 * 60 * 1000 // 24 h (buffer que sobrevivió a la app cerrada)
const TS_FUTURO_MAX_MS = 5 * 60 * 1000 // 5 min (tolerancia de reloj desfasado)

/**
 * El `ts` lo declara el CLIENTE y la ingesta es pública, así que fuera de una ventana
 * razonable no se puede confiar en él: sin esta cota, cualquiera podía sembrar eventos con
 * fechas arbitrarias y corromper las series temporales del panel y del reporte al sponsor
 * (que es un entregable comercial). Fuera de ventana → se usa la hora del server.
 * El buffer del front se flushea a los 4 s o en pagehide, así que 24 h es holgado de sobra.
 */
export function tsConfiable(raw: string | undefined, ahora = new Date()): Date {
  if (!raw) return ahora
  const t = new Date(raw)
  if (Number.isNaN(t.getTime())) return ahora
  const delta = t.getTime() - ahora.getTime()
  if (delta > TS_FUTURO_MAX_MS || delta < -TS_PASADO_MAX_MS) return ahora
  return t
}

export async function ingest(deviceId: string | undefined, events: IncomingEvent[]): Promise<number> {
  if (events.length === 0) return 0
  const ahora = new Date()
  const data = events.map((e) => ({
    event: e.event,
    deviceId: deviceId ?? null,
    payload: (e.payload ?? undefined) as object | undefined,
    ts: tsConfiable(e.ts, ahora),
    seed: false,
  }))
  const res = await prisma.analyticsEvent.createMany({ data })
  return res.count
}

/**
 * Lista para el dashboard admin (doc 08). Más recientes primero, acotado por `limit`.
 * 🔶 Fase G: proteger con auth de organizador (hoy abierto).
 */
export async function list(limit = 500): Promise<DomainAnalyticsEvent[]> {
  const rows = await prisma.analyticsEvent.findMany({
    orderBy: { ts: 'desc' },
    take: Math.min(Math.max(limit, 1), 2000),
    include: { device: { select: { publicId: true } } },
  })
  return rows.map(toAnalyticsEvent)
}
