import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Img } from '../../../components/ui'
import type { EventItem } from '../../../data/types'

/**
 * Fila compacta horizontal para "Descubrí": thumbnail + texto, formato app.
 * Reemplaza la foto gigante editorial del home anterior por algo escaneable.
 */
export function DiscoverRow({ event }: { event: EventItem }) {
  return (
    <Link
      to={`/eventos/${event.slug}`}
      className="group flex items-center gap-4 border-t border-line py-3 transition-colors active:bg-ink/5"
    >
      <Img
        src={event.cover}
        alt={event.title}
        ratio="1/1"
        className="w-20 shrink-0 rounded-md md:w-24"
        imgClassName="transition duration-700 group-hover:scale-[1.04]"
      />
      <div className="min-w-0 flex-1">
        <div className="eyebrow text-[9px] text-accent">
          {event.dateLabel}
          {event.timeLabel ? ` · ${event.timeLabel}` : ''}
        </div>
        <h3 className="type-serif mt-1 truncate text-lg text-ink">{event.title}</h3>
        <p className="mt-0.5 truncate text-xs text-ink-soft">{event.venue}</p>
      </div>
      <ChevronRight
        size={18}
        className="shrink-0 text-ink-soft transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  )
}
