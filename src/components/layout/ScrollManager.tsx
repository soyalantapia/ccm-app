import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Maneja el scroll en cada navegación (reemplaza a <ScrollRestoration/>, que
 * reseteaba al top y NO honraba el `#hash` hacia rutas lazy).
 *
 * - Sin hash → scroll instantáneo al top.
 * - Con hash → reintenta scrollear al elemento durante ~1s (la ruta destino es
 *   lazy y monta unos cientos de ms después). Cada intento valida contra
 *   `window.location.hash` para no scrollear si el usuario ya navegó a otro lado.
 *
 * Notas de implementación:
 * - Se usa `behavior: 'instant'`: el scroll suave PROGRAMÁTICO se descarta en
 *   Chrome cuando `html` tiene `scroll-behavior: smooth` (queda sin scrollear).
 * - Los reintentos van por `setTimeout` y NO se cancelan en el cleanup: en dev,
 *   StrictMode + Suspense disparan el cleanup del efecto antes de que un rAF
 *   alcance a correr, dejando el ancla sin resolver. El guard por hash hace
 *   inocuo cualquier intento tardío.
 */
export function ScrollManager() {
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
      return
    }

    const id = decodeURIComponent(hash.slice(1))
    const targetHash = hash

    const attempt = () => {
      if (window.location.hash !== targetHash) return true // el usuario ya navegó → cortar
      const el = document.getElementById(id)
      if (!el) return false
      el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' })
      return true
    }

    // Reintentos hasta que la ruta lazy monte el ancla (cap ~1s).
    const delays = [0, 60, 140, 260, 420, 650, 1000]
    delays.forEach((d) => setTimeout(attempt, d))
    // sin cleanup: los intentos son idempotentes y están guardados por hash
  }, [pathname, hash, key])

  return null
}
