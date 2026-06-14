import { useEffect, useRef } from 'react'
import { asset } from '../../lib/assets'

/**
 * Video de portada del hero (reel del evento, auto-hosteado). Autoplay muted +
 * loop + playsInline para que reproduzca inline en iOS/Android sin sacar al
 * usuario de la app. El poster se ve al instante mientras carga el mp4.
 * El `muted` se fuerza por ref (React a veces no emite el atributo y iOS exige
 * muted para el autoplay).
 *
 * Accesibilidad: si el sistema pide menos movimiento (prefers-reduced-motion)
 * no autoreproducimos — queda el poster fijo y no se descarga el mp4.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

  useEffect(() => {
    if (reducedMotion) return
    const v = ref.current
    if (!v) return
    v.muted = true
    v.play().catch(() => {
      /* si el navegador bloquea el autoplay, queda el poster visible */
    })
  }, [reducedMotion])

  return (
    <div className="overflow-hidden rounded-md bg-ink/8" style={{ aspectRatio: '4 / 5' }}>
      <video
        ref={ref}
        className="h-full w-full object-cover"
        poster={asset('video/hero-poster.jpg')}
        autoPlay={!reducedMotion}
        muted
        loop
        playsInline
        preload={reducedMotion ? 'none' : 'metadata'}
        aria-label="Reel de la 14ª edición de Córdoba Corazón de Moda"
      >
        {!reducedMotion && <source src={asset('video/hero.mp4')} type="video/mp4" />}
      </video>
    </div>
  )
}
