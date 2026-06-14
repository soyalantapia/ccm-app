import { useEffect, useRef } from 'react'
import { asset } from '../../lib/assets'

/**
 * Video de portada del hero (reel del evento, auto-hosteado). Autoplay muted +
 * loop + playsInline para que reproduzca inline en iOS/Android sin sacar al
 * usuario de la app. El poster se ve al instante mientras carga el mp4.
 * El `muted` se fuerza por ref (React a veces no emite el atributo y iOS exige
 * muted para el autoplay).
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.muted = true
    v.play().catch(() => {
      /* si el navegador bloquea el autoplay, queda el poster visible */
    })
  }, [])

  return (
    <div className="overflow-hidden rounded-md bg-ink/8" style={{ aspectRatio: '4 / 5' }}>
      <video
        ref={ref}
        className="h-full w-full object-cover"
        poster={asset('video/hero-poster.jpg')}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Reel de la 14ª edición de Córdoba Corazón de Moda"
      >
        <source src={asset('video/hero.mp4')} type="video/mp4" />
      </video>
    </div>
  )
}
