import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

/**
 * Aviso de "nueva versión disponible" (PWA). El service worker se actualiza en
 * segundo plano; sin esto, el usuario sigue viendo el build viejo hasta recargar
 * a mano — riesgo real el día de la demo. Acá registra el SW y, cuando hay una
 * versión nueva esperando, muestra un banner para aplicarla al instante.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 md:bottom-8">
      <div className="flex items-center gap-3 rounded-md bg-night px-4 py-3 text-sm text-night-ink shadow-2xl animate-rise">
        <RefreshCw size={15} className="shrink-0 text-accent" aria-hidden />
        <span>Hay una versión nueva de la app</span>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="ml-1 shrink-0 rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink transition active:scale-95"
        >
          Actualizar
        </button>
      </div>
    </div>
  )
}
