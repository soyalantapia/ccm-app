import { useEffect, useState } from 'react'
import type { AnalyticsEvent } from '../../data/types'
import { store } from '../../data/store'
import { describeAnalyticsEvent } from './coreAnalytics'
import { formatDateTime, formatRelative } from './coreFormat'

/**
 * Timeline del dato propio de ESTE dispositivo (PRD §10.5).
 *
 * Los analytics_events del deviceId actual, en orden cronológico inverso,
 * humanizados con su acción de origen y su hora. El remate del pitch:
 * "esta acción de hace 30 segundos = este registro, con su origen y hora".
 */
export function DeviceTimeline({ events }: { events: AnalyticsEvent[] }) {
  // Refresca los tiempos relativos aunque no haya escrituras nuevas.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  const timeline = [...events].reverse()

  if (timeline.length === 0) {
    return (
      <p className="border-t border-line py-5 text-sm leading-relaxed text-ink-soft">
        Este dispositivo todavía no generó eventos. Usá la app desde acá —
        inscribite a un bloque o mirá una foto— y cada acción aparece en este
        timeline con su origen y su hora exacta.
      </p>
    )
  }

  return (
    <ol className="border-t border-line">
      {timeline.map((e) => {
        const { icon: Icon, label } = describeAnalyticsEvent(e, store)
        return (
          <li
            key={e.id}
            className={`flex items-start gap-3 border-b border-line py-3.5 ${
              e.seed ? '' : 'animate-rise'
            }`}
          >
            <span className={`mt-0.5 shrink-0 ${e.seed ? 'text-ink-soft/40' : 'text-accent'}`}>
              <Icon size={14} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-ink">{label}</p>
              <p className="mt-0.5 text-[11px] text-ink-soft/70">
                <span className="tabular-nums">{formatRelative(e.ts)}</span>
                {' · '}
                {formatDateTime(e.ts)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
