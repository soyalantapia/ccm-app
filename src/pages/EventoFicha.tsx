import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, Clock, MapPin } from 'lucide-react'
import { ButtonLink, EmptyState, Eyebrow, Img, SectionTitle } from '../components/ui'
import { store, useStore } from '../data/store'
import type { EventBlock } from '../data/types'
import { BlockRow } from '../features/eventos/BlockRow'
import { EventCta } from '../features/eventos/EventCta'
import { ConvocatoriaBanner } from '../features/eventos/ConvocatoriaBanner'
import { EVENT_TYPE_LABELS, blockSortKey, dayLabel } from '../features/eventos/eventMeta'

/** Ficha /eventos/:slug — hero editorial, info, CTA general y grilla de bloques (PRD §6.3, §8.2). */
export default function EventoFicha() {
  const { slug } = useParams<{ slug: string }>()
  const events = useStore((s) => s.getEvents())
  const event = events.find((e) => e.slug === slug)

  const eventId = event?.id
  useEffect(() => {
    if (eventId) store.track('event_view', { eventId })
  }, [eventId])

  if (!event) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <EmptyState
          title="No encontramos ese evento"
          action={
            <ButtonLink to="/eventos" variant="outline">
              Ver todos los eventos
            </ButtonLink>
          }
        >
          Puede que el link esté vencido o mal escrito.
        </EmptyState>
      </div>
    )
  }

  /* Bloques ordenados por día + hora, agrupados por día (headers solo si hay más de uno). */
  const sortedBlocks = [...store.getBlocks(event.id)].sort((a, b) =>
    blockSortKey(a).localeCompare(blockSortKey(b)),
  )
  const days = new Map<string, EventBlock[]>()
  for (const block of sortedBlocks) {
    const list = days.get(block.day)
    if (list) list.push(block)
    else days.set(block.day, [block])
  }
  const dayEntries = [...days.entries()]

  return (
    <>
      {/* Hero editorial: cover con overlay night */}
      <section className="relative bg-night">
        <Img src={event.cover} alt={event.title} priority className="h-[26rem] w-full md:h-[32rem]" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-night/80 via-night/20 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl animate-rise px-5 pb-10 md:pb-14">
            <Eyebrow>{EVENT_TYPE_LABELS[event.type]}</Eyebrow>
            <h1 className="type-display mt-4 max-w-3xl text-[clamp(2.6rem,9vw,5.5rem)] text-balance text-night-ink">
              {event.title}
            </h1>
            {event.subtitle && (
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-night-ink/75">
                {event.subtitle}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Fila de info + Cómo llegar (única salida permitida junto a MP) */}
      <section className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-5">
          <span className="flex items-center gap-2 text-sm text-ink-soft">
            <CalendarDays size={15} className="shrink-0 text-accent" />
            {event.dateLabel}
          </span>
          {event.timeLabel && (
            <span className="flex items-center gap-2 text-sm text-ink-soft">
              <Clock size={15} className="shrink-0 text-accent" />
              {event.timeLabel}
            </span>
          )}
          <span className="flex items-center gap-2 text-sm text-ink-soft">
            <MapPin size={15} className="shrink-0 text-accent" />
            {event.venue} · {event.address}
          </span>
          <ButtonLink
            href={event.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
            className="md:ml-auto"
          >
            Cómo llegar <ArrowUpRight size={13} />
          </ButtonLink>
        </div>
      </section>

      {/* Descripción editorial + CTA general (arriba de la grilla) */}
      <section className="mx-auto max-w-6xl px-5 py-12 md:py-16">
        <div className="max-w-2xl">
          <p className="text-[15px] leading-relaxed text-ink-soft md:text-base">
            {event.description}
          </p>
          <div className="mt-8">
            <EventCta key={event.id} event={event} />
          </div>
        </div>
      </section>

      {/* Grilla de bloques con cupo en vivo */}
      <section className="mx-auto max-w-6xl px-5 pb-16 md:pb-24">
        <SectionTitle
          eyebrow="Inscripción por bloque"
          title={
            <>
              El <em className="italic text-accent">programa</em>
            </>
          }
          lead="Elegí tus bloques y asegurá tu lugar. Los cupos son limitados y la disponibilidad se actualiza en vivo."
        />
        {dayEntries.length === 0 ? (
          <EmptyState title="La grilla se publica pronto" className="mt-10 border-t border-line">
            Las charlas, masterclasses y desfiles de este encuentro se anuncian acá.
          </EmptyState>
        ) : (
          <div className="mt-10 border-b border-line md:mt-14">
            {dayEntries.map(([day, dayBlocks], i) => (
              <div key={day} className={i > 0 ? 'mt-4' : ''}>
                {dayEntries.length > 1 && <Eyebrow className="pb-5 pt-2">{dayLabel(day)}</Eyebrow>}
                {dayBlocks.map((block) => (
                  <BlockRow key={block.id} block={block} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Convocatoria asociada (solo Caminos) */}
      {event.type === 'camino' && <ConvocatoriaBanner />}
    </>
  )
}
