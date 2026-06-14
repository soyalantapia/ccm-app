import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, X } from 'lucide-react'
import { store, useStore } from '../../data/store'
import { bus } from '../../lib/bus'
import { useFocusTrap } from '../../lib/useFocusTrap'
import type { Sponsor, SponsorCreative } from '../../data/types'

const SEEN_KEY = 'ccm:interstitial-seen'
// Señal de "el interstitial ya terminó" (no se mostró o se cerró) para que el
// onboarding pueda aparecer sin quedar debajo de esta pieza full-screen.
const DONE_KEY = 'ccm:interstitial-done'
const SKIP_SECONDS = 3

/** Resuelve el sponsor Principal y su creatividad S1 desde el seed. */
function getPrincipalS1(sponsors: Sponsor[]): { sponsor: Sponsor; creative: SponsorCreative } | undefined {
  const sponsor = sponsors.find((s) => s.level === 'Principal')
  if (!sponsor) return undefined
  const creative = sponsor.creatives.find((c) => c.slot === 'S1')
  if (!creative) return undefined
  return { sponsor, creative }
}

/**
 * SLOT S1 — interstitial de apertura (PRD §11). Pieza full-screen del sponsor
 * Principal que aparece 1×/sesión al abrir la PWA, skippeable a los 3s.
 * Autosuficiente: sin props. Se monta en el provider global.
 */
export function Interstitial() {
  const pair = useStore((s) => getPrincipalS1(s.getSponsors()))
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const isAdmin = pathname.includes('/admin')
  const alreadySeen =
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SEEN_KEY) === '1'

  const [open, setOpen] = useState(() => !isAdmin && !alreadySeen && !!pair)
  const [remaining, setRemaining] = useState(SKIP_SECONDS)
  const tracked = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  // Ref para que `skip` sea estable (no re-corre el focus-trap en cada tick).
  const canSkipRef = useRef(false)
  canSkipRef.current = remaining <= 0

  /** Cierra el interstitial — solo cuando ya se puede saltar (>=3s). */
  const skip = useCallback(() => {
    if (!canSkipRef.current) return
    if (pair) store.track('ad_skip', { slot: 'S1', sponsorId: pair.sponsor.id })
    setOpen(false)
  }, [pair])

  // Foco atrapado dentro del diálogo full-screen + Escape salta (cuando se puede).
  useFocusTrap(open && !!pair, panelRef, skip)

  // Marca como vista al montar (una sola vez por sesión) + impresión.
  useEffect(() => {
    if (!open || !pair || tracked.current) return
    tracked.current = true
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* sessionStorage no disponible: igual mostramos esta vez */
    }
    store.track('ad_impression', { slot: 'S1', sponsorId: pair.sponsor.id })
  }, [open, pair])

  // Cuando el interstitial no se muestra o se cierra, avisamos al onboarding.
  useEffect(() => {
    if (open) return
    try {
      sessionStorage.setItem(DONE_KEY, '1')
    } catch {
      /* sessionStorage no disponible */
    }
    bus.emit('ui:interstitial-done')
  }, [open])

  // Contador de habilitación del skip.
  useEffect(() => {
    if (!open || remaining <= 0) return
    const t = window.setTimeout(() => setRemaining((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [open, remaining])

  // Bloquea el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !pair) return null
  const { sponsor, creative } = pair
  const canSkip = remaining <= 0

  const click = () => {
    store.track('ad_click', { slot: 'S1', sponsorId: sponsor.id })
    setOpen(false)
    navigate('/sponsors')
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Espacio del sponsor principal: ${sponsor.name}`}
      className="fixed inset-0 z-[120] flex flex-col bg-night text-night-ink"
    >
      {/* Botón cerrar — aparece junto con el skip */}
      {canSkip && (
        <button
          onClick={skip}
          aria-label="Cerrar"
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 rounded-full p-2.5 text-night-ink/70 transition-colors hover:bg-night-soft hover:text-night-ink motion-safe:animate-fade"
        >
          <X size={22} strokeWidth={1.5} />
        </button>
      )}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between px-6 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))]">
        {/* Encabezado: eyebrow + sponsor */}
        <div className="pt-6 motion-safe:animate-rise">
          <div className="eyebrow flex items-center gap-2.5 text-[10px] text-night-ink/50">
            <span className="h-px w-6 bg-accent" />
            Espacio del sponsor principal
          </div>
          <div className="type-display mt-5 text-[clamp(2.4rem,11vw,3.6rem)] leading-[0.96] text-night-ink">
            {sponsor.name}
          </div>
          <div className="eyebrow mt-3 text-[11px] text-accent">{sponsor.industry}</div>
        </div>

        {/* Cuerpo editorial: headline + sub */}
        <div className="py-10 motion-safe:animate-rise">
          <p className="type-serif text-2xl leading-snug text-night-ink">{creative.headline}</p>
          {creative.sub && (
            <p className="mt-4 text-[15px] leading-relaxed text-night-ink/70">{creative.sub}</p>
          )}
        </div>

        {/* CTA + branding + skip */}
        <div className="space-y-5">
          <button
            onClick={click}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-sm bg-accent px-7 py-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-accent-ink shadow-[0_1px_0_rgba(0,0,0,0.18)] transition-all duration-200 hover:brightness-105 active:translate-y-px active:scale-[0.98]"
          >
            {creative.cta ?? 'Conocé al sponsor'}
            <ArrowUpRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>

          <div className="flex items-center justify-between gap-4">
            <span className="eyebrow text-[10px] text-night-ink/40">Córdoba Corazón de Moda</span>
            <button
              onClick={skip}
              disabled={!canSkip}
              className="eyebrow inline-flex items-center gap-1.5 text-[11px] text-night-ink/60 transition-colors hover:text-night-ink disabled:cursor-default disabled:text-night-ink/35 disabled:hover:text-night-ink/35"
            >
              {canSkip ? (
                <>Saltar <X size={13} strokeWidth={2} /></>
              ) : (
                <>Saltás en {remaining}…</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
