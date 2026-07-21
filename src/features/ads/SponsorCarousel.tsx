import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Img } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { Sponsor } from '../../data/types'

/**
 * Lockup de marca on-brand cuando el sponsor todavía no tiene arte (`banner`).
 * Mantiene el slot vivo en prod —donde el backend aún no persiste banners— en vez
 * de renderizar un hueco; el cliente lo reemplaza cargando el arte real. Mismo 3:1
 * que la imagen para que el carrusel no salte.
 */
function SponsorLockup({ sponsor }: { sponsor: Sponsor }) {
  return (
    <div className="flex aspect-[3/1] w-full flex-col items-center justify-center gap-1 bg-night px-6 text-center">
      <span className="eyebrow text-[9px] text-accent">
        {sponsor.level === 'Principal' ? 'Sponsor principal' : `Sponsor · ${sponsor.industry}`}
      </span>
      <span className="type-display text-2xl leading-none text-night-ink sm:text-3xl">
        {sponsor.name}
      </span>
      <span className="line-clamp-2 max-w-md text-[11px] leading-snug text-night-ink/60">
        {sponsor.tagline}
      </span>
    </div>
  )
}

/**
 * Carrusel de sponsors: banners horizontales ilustrativos (arte del sponsor)
 * que rotan solos. Reemplaza al advertorial de texto del slot S2. Autoplay 5s,
 * con dots, flechas (desktop) y swipe táctil (mobile). El clic lleva a /sponsors.
 * Los banners son placeholders on-brand — el cliente los cambia por el arte real.
 */
export function SponsorCarousel({ className }: { className?: string }) {
  // Todos los sponsors: con banner → imagen; sin banner → lockup de marca (fallback).
  // Antes se filtraba por `s.banner`, y como el backend no serializa banner, en prod
  // quedaba vacío (n===0 → null) y el slot desaparecía. Ver P1 del análisis.
  const sponsors = useStore((s) => s.getSponsors())
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

  // La pausa del autoplay colgaba SOLO de onMouseEnter/onMouseLeave, y en un celular no hay
  // hover: el carrusel nunca se pausaba, así que el sponsor que estabas leyendo cambiaba solo
  // a los 5 s. Al tocarlo se pausa, y se reanuda unos segundos después de soltar.
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX
    setPaused(true)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current !== null) {
      const dx = e.changedTouches[0].clientX - touchX.current
      if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1))
      touchX.current = null
    }
    // Margen para leer el sponsor antes de que vuelva a rotar solo.
    window.setTimeout(() => setPaused(false), 8000)
  }

  return (
    <div className={`mx-auto max-w-3xl ${className ?? ''}`}>
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
              {sp.banner ? (
                // priority (eager): el track del carrusel deja slides fuera de
                // viewport y loading=lazy no las cargaba.
                <Img src={sp.banner} alt={`${sp.name} — ${sp.industry}`} ratio="3/1" priority />
              ) : (
                <SponsorLockup sponsor={sp} />
              )}
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
          {/* El área táctil (24px, mínimo de WCAG 2.5.8) está separada del pixel pintado: la
              barrita de 6px se ve igual, pero antes ERA el hit target y en un celular fallar
              el toque significaba abrir el sponsor equivocado. */}
          {sponsors.map((sp, idx) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => go(idx)}
              aria-label={`Ver sponsor ${idx + 1} de ${n}`}
              aria-current={idx === i}
              className="flex h-6 min-w-6 items-center justify-center"
            >
              <span
                aria-hidden
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === i ? 'w-6 bg-accent' : 'w-1.5 bg-ink/20 hover:bg-ink/40'
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
