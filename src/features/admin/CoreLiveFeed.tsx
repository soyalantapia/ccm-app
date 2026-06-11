import { useEffect, useState } from 'react'
import type { AnalyticsEvent } from '../../data/types'
import { store } from '../../data/store'
import { describeAnalyticsEvent } from './coreAnalytics'
import { formatRelative } from './coreFormat'

/**
 * Actividad en vivo del dashboard (se renderiza dentro de un bloque night).
 * Los eventos de esta demo (no-seed) entran resaltados con animate-rise.
 */
export function CoreLiveFeed({ events }: { events: AnalyticsEvent[] }) {
  // Refresca los tiempos relativos aunque no haya escrituras nuevas.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-night-ink/60">
        Todavía no hay actividad. Abrí la app en otra pestaña: cada acción aparece acá al instante.
      </p>
    )
  }

  return (
    <ol>
      {events.map((e, i) => {
        const { icon: Icon, label } = describeAnalyticsEvent(e, store)
        return (
          <li
            key={e.id}
            className={`flex items-start gap-3 py-3 ${i > 0 ? 'border-t border-night-soft' : ''} ${
              e.seed ? '' : 'animate-rise'
            }`}
          >
            <span className={`mt-0.5 shrink-0 ${e.seed ? 'text-night-ink/40' : 'text-accent'}`}>
              <Icon size={14} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] leading-snug text-night-ink">{label}</p>
              <p className="mt-0.5 text-[11px] text-night-ink/45">
                {formatRelative(e.ts)}
                {e.seed ? ' · histórico' : ' · esta demo'}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
