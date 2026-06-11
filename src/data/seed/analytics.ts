import type { AnalyticsEvent } from '../types'

/** Históricos para que el dashboard no nazca vacío (stub — el seed real amplía). */
export const seedAnalytics: AnalyticsEvent[] = [
  {
    id: 'seed-evt-01',
    event: 'user_created',
    ts: '2026-06-05T10:00:00-03:00',
    deviceId: 'dev-seed-0001',
    seed: true,
  },
  {
    id: 'seed-evt-02',
    event: 'registration_created',
    ts: '2026-06-05T10:02:00-03:00',
    deviceId: 'dev-seed-0001',
    payload: { eventId: 'ev-camino-18-06', blockId: 'blk-c18-1' },
    seed: true,
  },
]
