import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Img } from '../../components/ui'
import { store, useStore } from '../../data/store'

/**
 * Carrusel de sponsors: banners horizontales ilustrativos (arte del sponsor)
 * que rotan solos. Reemplaza al advertorial de texto del slot S2. Autoplay 5s,
 * con dots, flechas (desktop) y swipe táctil (mobile). El clic lleva a /sponsors.
 * Los banners son placeholders on-brand — el cliente los cambia por el arte real.
 */
export function SponsorCarousel({ className }: { className?: string }) {
  const sponsors = useStore((s) => s.getSponsors()).filter((s) => s.banner)
  const n = sponsors.length
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchX = useRef<number | null>(null)

  const go = useCallback((idx: number) => setI((idx + n) % n), [n])

  // Autoplay (se pausa al hover / drag). setState va dentro del callback del
  // timer, no en el cuerpo del efecto → sin warning de set-state-in-effect.
  useEffect(() => {
    if (n <= 1 || paused) return
    const t = window.setInterval(() => setI((p) => (p + 1) % n), 5000)
    return () => window.clearInterval(t)
  }, [n, paused])

  // Impresión del sponsor visible (rota con el carrusel).
  useEffect(() => {
    const sp = sponsors[i]
    if (sp) store.track('ad_impression', { slot: 'S2', sponsorId: sp.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, n])

  if (n === 0) return null

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1))
    touchX.current = null
  }

  return (
    <div className={`mx-auto max-w-3xl ${className ?? ''}`}>
      {/* Rótulo del espacio */}
      <div className="mb-2.5 flex items-center justify-center gap-3">
        <span aria-hidden className="h-px w-8 bg-accent/60" />
        <span className="eyebrow text-[9px] text-ink-soft/60">Espacio patrocinado</span>
        <span aria-hidden className="h-px w-8 bg-accent/60" />
      </div>

      {/* Ventana del carrusel */}
      <div
        className="group relative overflow-hidden rounded-[14px] border border-line"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {sponsors.map((sp) => (
            <Link
              key={sp.id}
              to="/sponsors"
              onClick={() => store.track('ad_click', { slot: 'S2', sponsorId: sp.id })}
              className="block w-full shrink-0"
              aria-label={`${sp.name} — sponsor de CCM 2026`}
            >
              {/* priority (eager): el track del carrusel deja slides fuera de
                  viewport y loading=lazy no las cargaba. */}
              <Img src={sp.banner!} alt={`${sp.name} — ${sp.industry}`} ratio="3/1" priority />
            </Link>
          ))}
        </div>

        {/* Flechas — solo desktop, aparecen al hover */}
        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(i - 1)}
              aria-label="Sponsor anterior"
              className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-bg/85 text-ink opacity-0 shadow-md backdrop-blur transition-opacity duration-200 hover:bg-bg group-hover:opacity-100 lg:flex"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => go(i + 1)}
              aria-label="Sponsor siguiente"
              className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-bg/85 text-ink opacity-0 shadow-md backdrop-blur transition-opacity duration-200 hover:bg-bg group-hover:opacity-100 lg:flex"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>

      {/* Dots */}
      {n > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {sponsors.map((sp, idx) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => go(idx)}
              aria-label={`Ver sponsor ${idx + 1} de ${n}`}
              aria-current={idx === i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === i ? 'w-6 bg-accent' : 'w-1.5 bg-ink/20 hover:bg-ink/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
