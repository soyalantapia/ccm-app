import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../lib/useFocusTrap'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** 'content' = panel claro con padding · 'media' = lienzo oscuro full-bleed (fotos/video) */
  variant?: 'content' | 'media'
  className?: string
}

export function Modal({ open, onClose, children, variant = 'content', className }: ModalProps) {
  const trapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // El trap envuelve el botón Cerrar + el panel, restituye el foco y unifica Escape.
  useFocusTrap(open, trapRef, onClose)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div
        className={`absolute inset-0 animate-fade ${variant === 'media' ? 'bg-black/85' : 'bg-night/60 backdrop-blur-[2px]'}`}
        onClick={onClose}
      />
      <div ref={trapRef} className="contents">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className={`absolute right-4 top-4 z-10 rounded-sm p-2.5 transition-colors ${
            variant === 'media' ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
          }`}
        >
          <X size={22} strokeWidth={1.5} />
        </button>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Diálogo"
          className={`relative max-h-[92dvh] w-full animate-rise overflow-y-auto ${
            variant === 'media'
              ? 'max-w-4xl'
              : 'max-w-lg rounded-lg border border-line bg-surface p-6 shadow-2xl sm:p-8'
          } ${className ?? ''}`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
