import { useEffect, useMemo } from 'react'
import { store } from '../../data/store'
import { useBanners } from '../../data/queries'
import type { Banner } from '../../data/types'

function BannerCard({ b, slot }: { b: Banner; slot: string }) {
  const onClick = () => store.track('banner_click', { bannerId: b.id, slot, brand: b.brand })
  return (
    <a
      href={b.destinationUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={onClick}
      aria-label={b.alt || `Publicidad de ${b.brand}`}
      className="group relative block overflow-hidden rounded-md border border-line"
    >
      <span className="absolute left-2 top-2 z-10 rounded-sm bg-night/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-night-ink/80">
        Publicidad
      </span>
      <img
        src={b.image}
        alt={b.alt || b.brand}
        loading="lazy"
        className="aspect-[16/5] w-full object-cover transition duration-500 group-hover:scale-[1.02]"
      />
    </a>
  )
}

/**
 * Banner gestionado por slot (lo carga marketing). Muestra los FIJOS + uno ROTATIVO
 * (rota por carga de página). Mide impresiones y clicks vía el bus de analytics, y
 * manda al destino que definió el cliente (wa.me / link / formulario). Render nulo si
 * el slot no tiene banners activos.
 */
export function ManagedBanner({ slot, className = '' }: { slot: string; className?: string }) {
  const all = useBanners()
  const forSlot = all.filter((b) => b.slot === slot)
  const fixed = forSlot.filter((b) => b.fixed)
  const rotating = forSlot.filter((b) => !b.fixed)
  // Una elección estable por montaje (rota entre cargas de página).
  const rotated = useMemo(
    () => (rotating.length ? rotating[Math.floor(Math.random() * rotating.length)] : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slot, rotating.length],
  )
  const shown = useMemo(() => [...fixed, ...(rotated ? [rotated] : [])], [fixed, rotated])

  const shownKey = shown.map((b) => b.id).join(',')
  useEffect(() => {
    shown.forEach((b) => store.track('banner_impression', { bannerId: b.id, slot, brand: b.brand }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey])

  if (shown.length === 0) return null
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {shown.map((b) => (
        <BannerCard key={b.id} b={b} slot={slot} />
      ))}
    </div>
  )
}
