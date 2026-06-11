import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge, Eyebrow, Img } from '../../components/ui'
import type { EventItem } from '../../data/types'
import { EVENT_TYPE_LABELS } from './eventMeta'

interface EventCardProps {
  event: EventItem
  /** Inscripto al evento o a alguno de sus bloques. */
  registered: boolean
  /** Card destacada (evento principal): ocupa las dos columnas. */
  featured?: boolean
  /** Offset editorial en desktop (grilla asimétrica). */
  offset?: boolean
}

/** Card editorial del listado /eventos: cover 16/10, fecha, título serif, venue. */
export function EventCard({ event, registered, featured, offset }: EventCardProps) {
  return (
    <Link
      to={`/eventos/${event.slug}`}
      className={`group block ${featured ? 'md:col-span-2' : ''} ${offset ? 'md:mt-12' : ''}`}
    >
      <article className={featured ? 'md:grid md:grid-cols-5 md:items-end md:gap-10' : ''}>
        <Img
          src={event.cover}
          alt={event.title}
          ratio="16/10"
          className={`rounded-md ${featured ? 'md:col-span-3' : ''}`}
          imgClassName="transition duration-700 group-hover:scale-[1.04]"
        />
        <div className={`mt-5 ${featured ? 'md:col-span-2 md:mt-0 md:pb-1' : ''}`}>
          <Eyebrow>
            {event.dateLabel}
            {event.timeLabel ? ` · ${event.timeLabel}` : ''}
          </Eyebrow>
          <h3 className={`type-serif mt-3 text-balance text-ink ${featured ? 'text-3xl md:text-4xl' : 'text-2xl'}`}>
            {event.title}
          </h3>
          <p className="mt-2 text-sm text-ink-soft">
            {EVENT_TYPE_LABELS[event.type]} · {event.venue}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {registered && <Badge tone="success">Ya estás inscripto</Badge>}
            <span className="eyebrow flex items-center gap-1 text-[10px] text-ink transition-transform duration-200 group-hover:translate-x-0.5">
              Ver ficha <ArrowRight size={12} />
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}
