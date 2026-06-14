import { useEffect, useState } from 'react'
import type { AnalyticsEvent } from '../../data/types'
import { store } from '../../data/store'
import { describeAnalyticsEvent } from './coreAnalytics'
import { formatRelative } from './coreFormat'

/**
 * Eventos de "ruido": vistas, impresiones y prompts del sistema. No son señal
 * de negocio, así que se excluyen de la actividad en vivo (sí siguen en el
 * DeviceTimeline y en el CSV, que consumen coreAnalytics sin filtrar).
 */
const NOISE_EVENTS = new Set<string>([
  'page_view',
  'qr_view',
  'block_view',
  'event_view',
  'photo_view',
  'profile_view',
  'content_view',
  'ad_impression',
  'ad_skip',
  'pwa_prompt_shown',
  'pwa_prompt_dismissed',
])

function isSignal(e: AnalyticsEvent): boolean {
  return !NOISE_EVENTS.has(e.event)
}

/**
 * Actividad en vivo del dashboard (se renderiza dentro de un bloque night).
 * Los eventos de esta demo (no-seed) entran resaltados con animate-rise.
 * Mostramos SOLO señal de negocio: el ruido de vistas/impresiones se filtra.
 */
export function CoreLiveFeed({ events }: { events: AnalyticsEvent[] }) {
  // Refresca los tiempos relativos aunque no haya escrituras nuevas.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  // Orden cronológico inverso y límite de filas se preservan: filtramos sobre
  // la lista ya recibida sin reordenar ni recortar de más.
  const signal = events.filter(isSignal)

  if (signal.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-night-ink/60">
        Sin actividad por ahora. Cada inscripción, orden o descarga aparece acá al instante.
      </p>
    )
  }

  return (
    <ol>
      {signal.map((e, i) => {
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
