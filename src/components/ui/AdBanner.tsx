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

  // S2 — sponsor-banner de los mockups. Mobile 1:1; en desktop pasa a card OSCURA
  // PARTIDA premium: panel-emblema dorado (izq) | bloque tipográfico (centro) | CTA pill (der),
  // con gradiente cálido from-ink→brown-warm y hairline dorado superior.
  return (
    <div ref={ref} className={`mx-auto max-w-3xl lg:max-w-4xl ${className ?? ''}`}>
      <Link
        to="/sponsors"
        onClick={onClick}
        className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-[12px] bg-ink px-4 py-3.5 transition-transform active:scale-[0.99] lg:min-h-[116px] lg:gap-0 lg:rounded-[18px] lg:bg-gradient-to-br lg:from-ink lg:to-brown-warm lg:p-0 lg:ring-1 lg:ring-inset lg:ring-accent/20 lg:transition-shadow lg:hover:shadow-[0_12px_40px_rgba(0,0,0,0.28)] lg:active:scale-100"
      >
        {/* hairline dorado superior — solo desktop */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 hidden h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent lg:block" />

        {/* ZONA 1 — panel-emblema. Mobile: caja 42px a la DERECHA (order-2). Desktop: panel ancho a la IZQUIERDA (order-1) */}
        <span className="order-2 flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-ink lg:order-1 lg:h-auto lg:w-[104px] lg:self-stretch lg:rounded-none lg:rounded-l-[18px] lg:border-r lg:border-accent-ink/10 lg:bg-gradient-to-br lg:from-accent lg:to-gold-deep">
          <Sparkles size={18} className="lg:hidden" />
          <Sparkles size={30} className="hidden lg:block" />
        </span>

        {/* ZONA 2 — bloque tipográfico. Mobile order-1; desktop centrado con padding editorial */}
        <div className="order-1 min-w-0 lg:order-2 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-8 lg:py-6">
          <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent lg:text-[11px] lg:tracking-[0.14em]">Espacio patrocinado</div>
          <div className="type-serif mt-0.5 truncate text-[13px] text-night-ink lg:mt-1.5 lg:whitespace-normal lg:text-[26px] lg:leading-tight">{sponsor.name}</div>
          <div className="mt-0.5 truncate text-[9px] text-text-2 lg:mt-1.5 lg:whitespace-normal lg:text-[13px] lg:leading-snug lg:text-night-ink/70">{creative.headline}</div>
        </div>

        {/* ZONA 3 — CTA pill, solo desktop; borde dorado que invierte a fondo dorado en hover */}
        <span className="order-3 mr-8 hidden shrink-0 items-center gap-1.5 self-center rounded-full border border-accent/40 px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.05em] text-accent transition-colors group-hover:bg-accent group-hover:text-accent-ink lg:inline-flex">
          {creative.cta ?? 'Conocé más'}
          <ArrowUpRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </Link>
    </div>
  )
}
