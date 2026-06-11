import { useEffect } from 'react'
import { ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Img, Modal } from '../../components/ui'
import type { PortfolioPiece } from '../../data/types'

interface PortfolioViewerProps {
  pieces: PortfolioPiece[]
  /** Índice de la pieza abierta (null = cerrado). */
  index: number | null
  authorName: string
  onClose: () => void
  onNavigate: (index: number) => void
  /** Cierra el modal y scrollea al bloque autor. */
  onViewAuthor: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Lightbox de piezas del portfolio: pieza en grande + prev/next + "Ver autor". */
export function PortfolioViewer({
  pieces,
  index,
  authorName,
  onClose,
  onNavigate,
  onViewAuthor,
}: PortfolioViewerProps) {
  const total = pieces.length
  const open = index !== null && total > 0
  const piece = open ? pieces[index] : null

  useEffect(() => {
    if (!open || index === null || total < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onNavigate((index + 1) % total)
      if (e.key === 'ArrowLeft') onNavigate((index - 1 + total) % total)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, total, onNavigate])

  return (
    <Modal open={open} onClose={onClose} variant="media">
      {piece && index !== null && (
        <div className="mx-auto w-full max-w-[56dvh]">
          <div className="relative">
            <Img key={piece.id} src={piece.image} alt={piece.title} ratio="4/5" />
            {total > 1 && (
              <>
                <button
                  onClick={() => onNavigate((index - 1 + total) % total)}
                  aria-label="Pieza anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-sm bg-black/45 p-2.5 text-white/90 transition-colors duration-200 hover:bg-black/65 hover:text-white"
                >
                  <ChevronLeft size={20} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => onNavigate((index + 1) % total)}
                  aria-label="Pieza siguiente"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm bg-black/45 p-2.5 text-white/90 transition-colors duration-200 hover:bg-black/65 hover:text-white"
                >
                  <ChevronRight size={20} strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-2">
            <div>
              <span className="eyebrow text-[10px] text-accent">
                {pad(index + 1)} / {pad(total)}
              </span>
              <h3 className="type-serif mt-2 text-2xl text-white">{piece.title}</h3>
              {piece.caption && (
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-white/60">
                  {piece.caption}
                </p>
              )}
            </div>
            <button
              onClick={onViewAuthor}
              className="group eyebrow inline-flex items-center gap-2 text-[10px] text-accent transition-colors duration-200 hover:text-white"
            >
              Ver autor — {authorName}
              <ArrowDown size={14} className="transition-transform duration-200 group-hover:translate-y-0.5" />
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
