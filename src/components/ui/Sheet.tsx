import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** max-w del panel en desktop */
  size?: 'md' | 'lg'
}

/** Bottom sheet en mobile, diálogo centrado en desktop. */
export function Sheet({ open, onClose, title, children, size = 'md' }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-night/60 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-lg border-t border-line bg-surface shadow-2xl animate-sheet-up sm:rounded-lg sm:border sm:animate-rise ${
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4 px-6 pt-4 sm:pt-6">
          {title ? <div className="type-serif text-xl leading-snug">{title}</div> : <span />}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 rounded-sm p-2 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-3 sm:pb-8">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
