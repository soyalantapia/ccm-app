import { useEffect, useRef, useState } from 'react'
import { Radio } from 'lucide-react'
import { store } from '../../data/store'
import { IDS } from '../../data/ids'

/**
 * Simulador de actividad en vivo para la demo (PRD §10.1).
 *
 * Al activarse inyecta eventos sintéticos creíbles vía store.track(...) cada
 * pocos segundos — IDs reales del seed — para que el feed "actividad en vivo"
 * y los KPIs SE MUEVAN SOLOS mientras el presentador habla. Convive con el
 * tracking real y con el cross-tab (usa la misma puerta store.track).
 */

/** Cada paso es un evento sintético con payload de IDs reales del seed. */
const SCRIPT: { event: string; payload?: Record<string, unknown> }[] = [
  { event: 'event_view', payload: { eventId: IDS.events.camino18 } },
  { event: 'block_view', payload: { blockId: 'blk-c18-1' } },
  { event: 'registration_created', payload: { eventId: IDS.events.camino18, blockId: 'blk-c18-1' } },
  { event: 'ad_impression', payload: { sponsorId: IDS.sponsors.banco, slot: 'S1' } },
  { event: 'photo_view', payload: { photoId: 'ph-07', galleryId: IDS.gallery.camino } },
  { event: 'photo_download', payload: { photoId: 'ph-07', galleryId: IDS.gallery.camino, sponsorId: IDS.sponsors.beauty } },
  { event: 'ad_impression', payload: { sponsorId: IDS.sponsors.beauty, slot: 'S3' } },
  { event: 'ticket_order_created', payload: { planId: 'sab-night-vip', qty: 1 } },
  { event: 'block_view', payload: { blockId: 'blk-c18-4' } },
  { event: 'registration_created', payload: { eventId: IDS.events.camino18, blockId: 'blk-c18-4' } },
  { event: 'ad_click', payload: { sponsorId: IDS.sponsors.banco, slot: 'S1' } },
  { event: 'application_submitted', payload: { convocatoriaId: IDS.convocatoria.camino } },
  { event: 'photo_view', payload: { photoId: 'ph-21', galleryId: IDS.gallery.camino } },
  { event: 'ad_impression', payload: { sponsorId: IDS.sponsors.wines, slot: 'S2' } },
  { event: 'photo_download', payload: { photoId: 'ph-12', galleryId: IDS.gallery.camino, sponsorId: IDS.sponsors.beauty } },
  { event: 'registration_created', payload: { eventId: IDS.events.camino18, blockId: 'blk-c18-3' } },
  { event: 'event_view', payload: { eventId: IDS.events.principal } },
  { event: 'ad_impression', payload: { sponsorId: IDS.sponsors.beauty, slot: 'S2' } },
  { event: 'ticket_order_created', payload: { planId: 'combo-vip', qty: 2 } },
  { event: 'photo_view', payload: { photoId: 'ph-18', galleryId: IDS.gallery.camino } },
]

/** Ritmo de demo: un evento cada ~3,5 s (no spamear). */
const TICK_MS = 3500

export function LiveSimulator() {
  const [on, setOn] = useState(false)
  const [emitted, setEmitted] = useState(0)
  // Índice persistente entre ticks para recorrer el guion sin re-render.
  const cursor = useRef(0)

  useEffect(() => {
    if (!on) return
    const id = setInterval(() => {
      const step = SCRIPT[cursor.current % SCRIPT.length]
      cursor.current += 1
      store.track(step.event, step.payload)
      setEmitted((n) => n + 1)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [on])

  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
      className={`inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-[11px] transition duration-200 ${
        on
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line text-ink-soft hover:border-ink hover:text-ink'
      }`}
    >
      <Radio size={13} strokeWidth={2} className={on ? 'animate-pulse' : ''} />
      {on ? (
        <span className="eyebrow text-[9px]">
          Simulando · {emitted} {emitted === 1 ? 'evento' : 'eventos'}
        </span>
      ) : (
        <span className="eyebrow text-[9px]">Simular actividad en vivo</span>
      )}
    </button>
  )
}
