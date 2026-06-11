import { Link } from 'react-router-dom'
import { QrCode } from 'lucide-react'
import { useStore } from '../../data/store'
import type { Registration } from '../../data/types'

interface RegistrationRowProps {
  registration: Registration
  /** Muestra el acceso rápido al QR de acreditación (feed de Inicio). */
  showQrLink?: boolean
}

/**
 * Fila compacta de una inscripción confirmada: bloque (día · hora, sala) o
 * entrada general al evento. Usada en Inicio ("Tus próximos eventos") y Mi QR.
 */
export function RegistrationRow({ registration, showQrLink }: RegistrationRowProps) {
  const event = useStore((s) => s.getEventById(registration.eventId))
  const block = useStore((s) => (registration.blockId ? s.getBlock(registration.blockId) : undefined))
  if (!event) return null

  const when = block
    ? `${block.day} · ${block.start}–${block.end} hs`
    : `${event.dateLabel}${event.timeLabel ? ` · ${event.timeLabel}` : ''}`
  const detail = block ? `${block.kind} · ${block.room}` : `Entrada general · ${event.venue}`

  return (
    <article className="flex items-center justify-between gap-4 border-t border-line py-4">
      <div className="min-w-0">
        <div className="eyebrow text-[10px] text-accent">{when}</div>
        <h3 className="type-serif mt-1 truncate text-lg text-ink">{block ? block.title : event.title}</h3>
        <p className="mt-0.5 text-xs text-ink-soft">{detail}</p>
      </div>
      {showQrLink && (
        <Link
          to="/mi-qr"
          aria-label="Ver mi QR"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-line text-ink transition-colors duration-200 hover:border-accent hover:text-accent"
        >
          <QrCode size={17} strokeWidth={1.75} />
        </Link>
      )}
    </article>
  )
}
