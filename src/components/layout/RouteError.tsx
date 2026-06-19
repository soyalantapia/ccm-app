import { useRouteError } from 'react-router-dom'
import { Heart, RefreshCw } from 'lucide-react'
import { useState } from 'react'

/**
 * Pantalla de error de ruta (errorElement). Atrapa fallos de carga de chunks
 * tras un deploy (ver [[lazyWithReload]]) y cualquier error de render, y le da
 * al usuario una salida de un toque en vez del overlay crudo de Vite —
 * importa el día de la demo frente a un cliente.
 *
 * "Actualizar la app" hace un reset duro: desregistra el service worker, borra
 * las caches y recarga, garantizando que se tome el build nuevo.
 */
export function RouteError() {
  const error = useRouteError() as { message?: string } | undefined
  const message = error?.message ?? ''
  const isChunk =
    /dynamically imported module|module script failed|Failed to fetch|Loading chunk/i.test(
      message,
    )
  const [working, setWorking] = useState(false)

  async function hardRefresh() {
    setWorking(true)
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
      await Promise.all(regs.map((r) => r.unregister()))
      const keys = (await window.caches?.keys?.()) ?? []
      await Promise.all(keys.map((k) => window.caches.delete(k)))
    } catch {
      /* si falla la limpieza igual recargamos */
    }
    window.location.reload()
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <div className="flex items-center gap-2">
        <span className="type-display text-4xl text-ink">CCM</span>
        <Heart aria-hidden size={14} strokeWidth={0} className="fill-accent" />
      </div>

      <div className="max-w-sm space-y-2">
        <h1 className="type-serif text-2xl text-ink">
          {isChunk ? 'Salió una versión nueva' : 'Algo salió mal'}
        </h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          {isChunk
            ? 'Actualizá la app para cargar la última versión. Tus datos no se pierden.'
            : 'Tocá actualizar para volver a cargar la app. Si sigue pasando, avisanos.'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => void hardRefresh()}
        disabled={working}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-accent-ink transition active:scale-95 disabled:opacity-60"
      >
        <RefreshCw size={15} className={working ? 'animate-spin' : ''} aria-hidden />
        {working ? 'Actualizando…' : 'Actualizar la app'}
      </button>

      <a href="/ccm-app/" className="text-xs uppercase tracking-[0.12em] text-ink-soft underline-offset-4 hover:underline">
        Volver al inicio
      </a>
    </main>
  )
}
