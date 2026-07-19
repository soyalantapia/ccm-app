import { useEffect, useState } from 'react'
import { CheckCircle2, Info } from 'lucide-react'
import { bus } from '../../lib/bus'

type ToastTone = 'success' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastOptions {
  tone?: ToastTone
  action?: ToastAction
  duration?: number
}

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
  duration: number
}

let push: (t: Omit<ToastItem, 'id'>) => void = () => {}
let counter = 0

/**
 * toast('texto') → success ~2.8s
 * toast('texto', 'info') → tono explícito (compat)
 * toast('texto', { tone, action, duration }) → con acción ("Deshacer"), sube a ~5s
 */
export function toast(message: string, opts: ToastTone | ToastOptions = 'success') {
  const o: ToastOptions = typeof opts === 'string' ? { tone: opts } : opts
  const tone = o.tone ?? 'success'
  const duration = o.duration ?? (o.action ? 5000 : 2800)
  push({ message, tone, action: o.action, duration })
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id))

  useEffect(() => {
    push = ({ message, tone, action, duration }) => {
      const id = ++counter
      setItems((prev) => [...prev, { id, message, tone, action, duration }])
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), duration)
    }
    // El backend rechazó una inscripción optimista (cupo lleno o evento solo-socios):
    // avisamos en vez de dejar el "Inscripción confirmada ✓" como una mentira silenciosa.
    const off = bus.on((key) => {
      if (key === 'registration:rejected') {
        toast('No pudimos confirmar tu lugar — puede que se haya llenado o sea solo para Socios.', 'info')
      } else if (key === 'application:rejected') {
        toast('No pudimos enviar tu postulación — probá de nuevo en un momento.', 'info')
      } else if (key === 'membership:rejected') {
        toast('No pudimos confirmar tu membresía — probá de nuevo en un momento.', 'info')
      }
    })
    return () => {
      push = () => {}
      off()
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-6 md:bottom-8"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-md bg-ink px-4 py-3 text-sm font-medium text-bg shadow-2xl animate-rise"
        >
          {t.tone === 'success' ? (
            <CheckCircle2 size={16} className="shrink-0 text-accent" />
          ) : (
            <Info size={16} className="shrink-0 text-accent" />
          )}
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick()
                dismiss(t.id)
              }}
              className="-my-1 ml-1.5 shrink-0 rounded-sm px-2 py-1 font-semibold text-accent transition hover:bg-accent hover:text-accent-ink"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
