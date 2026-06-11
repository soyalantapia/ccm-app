import { readJSON, writeJSON, newId } from './storage'
import { getDeviceId } from './identity'
import type { AnalyticsEvent } from '../data/types'

const KEY = 'analytics'
const MAX_EVENTS = 3000

/**
 * First-party tracking (PRD §13). Persists locally in this phase; the
 * taxonomy and payloads are final — Fase 1 swaps storage for the backend.
 */
export function track(event: string, payload?: Record<string, unknown>): void {
  const events = readJSON<AnalyticsEvent[]>(KEY, [])
  events.push({
    id: newId('evt'),
    event,
    ts: new Date().toISOString(),
    deviceId: getDeviceId(),
    ...(payload ? { payload } : {}),
  })
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
  writeJSON(KEY, events)
}

export function getLocalAnalytics(): AnalyticsEvent[] {
  return readJSON<AnalyticsEvent[]>(KEY, [])
}
