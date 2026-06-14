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

    let done = false
    const attempt = () => {
      if (done) return
      if (window.location.hash !== targetHash) {
        done = true // el usuario ya navegó → cortar
        return
      }
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' })
      done = true
    }

    // Poll denso hasta que la ruta lazy monte el ancla, con un techo de ~3s
    // para tolerar el cold-load del chunk en producción (red lenta).
    attempt()
    const iv = setInterval(() => {
      attempt()
      if (done) clearInterval(iv)
    }, 70)
    const stop = setTimeout(() => clearInterval(iv), 3000)
    // sin cleanup que cancele: los intentos son idempotentes y están guardados
    // por hash. Solo limpiamos el timer de corte para no dejarlo colgado.
    void stop
  }, [pathname, hash, key])

  return null
}
