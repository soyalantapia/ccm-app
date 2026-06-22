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
export async function ingest(deviceId: string | undefined, events: IncomingEvent[]): Promise<number> {
  if (events.length === 0) return 0
  const data = events.map((e) => ({
    event: e.event,
    deviceId: deviceId ?? null,
    payload: (e.payload ?? undefined) as object | undefined,
    ts: e.ts ? new Date(e.ts) : new Date(),
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
