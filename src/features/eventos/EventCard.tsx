import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Lock, MapPin } from 'lucide-react'
import { Badge, Img } from '../../components/ui'
import type { EventItem } from '../../data/types'
import { EVENT_TYPE_LABELS } from './eventMeta'
import { formatMoney } from '../tickets/format'

interface EventCardProps {
  event: EventItem
  /** Inscripto al evento o a alguno de sus bloques. */
  registered: boolean
  /** Capacitación solo-Socios y el usuario aún no es Socio. */
  locked?: boolean
}

/**
 * Card autocontenida del listado /eventos: una unidad cerrada con borde completo.
 * Meta arriba (tipo + fecha), foto, y bloque de info dentro de la misma card.
 */
export function EventCard({ event, registered, locked = false }: EventCardProps) {
  return (
    <Link
      to={`/eventos/${event.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-md border border-line bg-surface transition-all duration-200 hover:border-ink/40 hover:shadow-[0_18px_50px_-22px_rgba(24,20,16,0.28)] active:scale-[0.99]"
    >
      {/* Fila de meta: chip de tipo + fecha bien visible → "esto es un evento distinto" */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="accent">{EVENT_TYPE_LABELS[event.type]}</Badge>
          {locked && (
            <Badge tone="night">
              <Lock size={10} /> Solo Socios
            </Badge>
          )}
        </div>
        <span className="eyebrow flex items-center gap-1.5 text-ink-soft">
          <CalendarDays size={12} className="text-accent" />
          {event.dateLabel}
        </span>
      </div>

      <Img
        src={event.cover}
        alt={event.title}
        ratio="3/2"
        imgClassName="transition duration-700 group-hover:scale-[1.04]"
      />

      <div className="flex flex-1 flex-col p-4 md:p-5">
        {event.timeLabel && (
          <p className="eyebrow text-ink-soft">{event.timeLabel}</p>
        )}
        <h3 className="type-serif mt-2 text-balance text-2xl text-ink">{event.title}</h3>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
          <MapPin size={14} className="shrink-0 text-accent" />
          {event.venue}
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {registered ? (
            <Badge tone="success">Ya estás inscripto</Badge>
          ) : locked ? (
            <span className="eyebrow flex items-center gap-1.5 text-accent-strong">
              <Lock size={11} /> Hacete Socio
            </span>
          ) : event.price != null ? (
            // Con precio cargado, el precio ES la señal: reemplaza al "cupo limitado" genérico.
            // Que el número se vea desde la grilla es lo que filtra antes de entrar a la ficha.
            <span className="text-[15px] font-medium text-ink">{formatMoney(event.price)}</span>
          ) : (
            <span className="eyebrow text-ink-soft">Cupo limitado</span>
          )}
          <span className="eyebrow flex items-center gap-1 text-ink transition-transform duration-200 group-hover:translate-x-0.5">
            Ver evento <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  )
}
