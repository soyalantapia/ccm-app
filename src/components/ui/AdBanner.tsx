import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { useStore, store } from '../../data/store'
import type { AdSlot } from '../../data/types'

interface AdBannerProps {
  slot: AdSlot
  index?: number
  className?: string
}

/**
 * Slot publicitario (PRD §11). Trackea ad_impression al entrar en viewport
 * y ad_click al tocar. El clic navega a /sponsors (nunca saca de la app).
 */
export function AdBanner({ slot, index = 0, className }: AdBannerProps) {
  const pair = useStore((s) => s.getCreative(slot, index))
  const ref = useRef<HTMLDivElement>(null)
  const tracked = useRef(false)

  useEffect(() => {
    if (!pair || !ref.current || tracked.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !tracked.current) {
          tracked.current = true
          store.track('ad_impression', { slot, sponsorId: pair.sponsor.id })
          observer.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [pair, slot])

  if (!pair) return null
  const { sponsor, creative } = pair
  const onClick = () => store.track('ad_click', { slot, sponsorId: sponsor.id })

  if (slot === 'S6') {
    return (
      <div ref={ref} className={`text-center ${className ?? ''}`}>
        <Link to="/sponsors" onClick={onClick} className="eyebrow text-[10px] text-ink-soft/70 transition-colors hover:text-ink-soft">
          {creative.headline}
        </Link>
      </div>
    )
  }

  if (slot === 'S3') {
    return (
      <div ref={ref} className={`border-t-2 border-accent bg-night px-5 py-4 ${className ?? ''}`}>
        <Link to="/sponsors" onClick={onClick} className="group flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow text-[9px] text-night-ink/50">Presentado por</div>
            <div className="type-serif mt-0.5 text-lg text-night-ink">{sponsor.name}</div>
            <div className="mt-0.5 text-xs text-night-ink/70">{creative.headline}</div>
          </div>
          {creative.cta && (
            <span className="eyebrow flex shrink-0 items-center gap-1 text-[10px] text-accent transition-transform duration-200 group-hover:translate-x-0.5">
              {creative.cta} <ArrowUpRight size={12} />
            </span>
          )}
        </Link>
      </div>
    )
  }

  // S2 — sponsor-banner de los mockups: card oscura #181410, eyebrow dorado,
  // nombre en Playfair, subtítulo gris y caja-logo dorada 42px a la derecha.
  return (
    <div ref={ref} className={`mx-auto max-w-3xl ${className ?? ''}`}>
      <Link
        to="/sponsors"
        onClick={onClick}
        className="flex items-center justify-between gap-3 rounded-[12px] bg-ink px-4 py-3.5 transition-transform active:scale-[0.99]"
      >
        <div className="min-w-0">
          <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent">Espacio patrocinado</div>
          <div className="type-serif mt-0.5 truncate text-[13px] text-night-ink">{sponsor.name}</div>
          <div className="mt-0.5 truncate text-[9px] text-text-2">{creative.headline}</div>
        </div>
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-ink">
          <Sparkles size={18} />
        </span>
      </Link>
    </div>
  )
}
