/**
 * Bloques de carga (skeletons). Reemplazan el flash en blanco mientras una
 * ruta lazy descarga su chunk: la pantalla ya muestra su "esqueleto" y la app
 * se siente instantánea (app-feel). Color por token; el pulso respeta
 * prefers-reduced-motion (motion-safe).
 */

/** Bloque base: un rectángulo con pulso suave. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-sm bg-ink/[0.07] motion-safe:animate-pulse ${className}`}
    />
  )
}

/** Skeleton de página pública / app: encabezado editorial + grilla de tarjetas. */
export function PagePending() {
  return (
    <div className="mx-auto max-w-6xl animate-fade px-5 py-10 md:py-16" aria-busy="true">
      <Skeleton className="h-2.5 w-28" />
      <Skeleton className="mt-5 h-9 w-2/3 max-w-md" />
      <Skeleton className="mt-3 h-9 w-1/2 max-w-xs" />
      <Skeleton className="mt-6 h-4 w-full max-w-xl" />
      <Skeleton className="mt-2.5 h-4 w-5/6 max-w-lg" />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="overflow-hidden rounded-md border border-line">
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="p-4">
              <Skeleton className="h-2 w-16" />
              <Skeleton className="mt-3 h-5 w-3/4" />
              <Skeleton className="mt-2.5 h-3.5 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton del panel admin: título + fila de KPIs + filas de tabla. */
export function AdminPending() {
  return (
    <div className="animate-fade px-5 py-8 md:px-10" aria-busy="true">
      <Skeleton className="h-2.5 w-32" />
      <Skeleton className="mt-4 h-8 w-56" />
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-md border border-line p-5">
            <Skeleton className="h-2 w-20" />
            <Skeleton className="mt-3 h-8 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-10 border-t border-line">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line py-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-2 h-3 w-1/4" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
