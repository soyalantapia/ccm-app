import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, MapPin, Ticket } from 'lucide-react'
import { Badge, EmptyState, Eyebrow, Img, SectionTitle, Tabs } from '../components/ui'
import { store, useStore } from '../data/store'
import { EventCard } from '../features/eventos/EventCard'
import { formatMoney } from '../features/tickets/format'
import { EVENT_TYPE_ORDER, EVENT_TYPE_TABS } from '../features/eventos/eventMeta'

/** Listado /eventos: banner del evento principal + Caminos y capacitaciones. */
export default function Eventos() {
  const events = useStore((s) => s.getEvents())
  const registrations = useStore((s) => s.getRegistrations())
  const vipFrom = useStore(
    (s) => s.getPlans().find((p) => p.kind === 'vip' && p.price !== null)?.price ?? null,
  )
  const [filter, setFilter] = useState('todos')

  const principal = events.find((e) => e.type === 'principal')
  const rest = events.filter((e) => e.type !== 'principal')

  /** Inscripto al evento o a alguno de sus bloques (toda registration lleva eventId). */
  const registeredEventIds = useMemo(
    () => new Set(registrations.filter((r) => r.status === 'confirmada').map((r) => r.eventId)),
    [registrations],
  )

  const tabs = useMemo(() => {
    const typed = EVENT_TYPE_ORDER.filter(
      (type) => type !== 'principal' && rest.some((e) => e.type === type),
    ).map((type) => ({
      id: type as string,
      label: EVENT_TYPE_TABS[type],
      count: rest.filter((e) => e.type === type).length,
    }))
    return [{ id: 'todos', label: 'Todos', count: rest.length }, ...typed]
  }, [rest])

  const visible = filter === 'todos' ? rest : rest.filter((e) => e.type === filter)

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:py-16">
      {/* ─── Banner del evento principal → la compra vive adentro ─── */}
      {principal && (
        <Link
          to={`/eventos/${principal.slug}`}
          onClick={() => store.track('event_view', { eventId: principal.id, from: 'banner' })}
          className="group relative block overflow-hidden rounded-md bg-night"
        >
          <Img
            src={principal.cover}
            alt={principal.title}
            priority
            ratio="4/5"
            className="md:hidden"
            imgClassName="transition duration-700 group-hover:scale-[1.03] opacity-90"
          />
          <Img
            src={principal.cover}
            alt=""
            priority
            ratio="21/9"
            className="hidden md:block"
            imgClassName="transition duration-700 group-hover:scale-[1.03] opacity-90"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-night via-night/35 to-night/10"
          />
          <div className="absolute inset-x-0 bottom-0 p-5 md:p-10">
            <Badge tone="accent">Evento principal · 14ª edición</Badge>
            <h1 className="type-display mt-3 max-w-2xl text-[clamp(2rem,7vw,4rem)] text-balance text-night-ink">
              {principal.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-night-ink/75">
              <span className="flex items-center gap-1.5">
                <CalendarDays size={13} className="text-accent" /> {principal.dateLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-accent" /> {principal.venue}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink shadow-lg transition-transform group-hover:translate-x-0.5 group-active:scale-[0.98]">
                <Ticket size={14} /> Entradas y programa <ArrowRight size={14} />
              </span>
              <span className="text-[12px] text-night-ink/70">
                Gratis con inscripción{vipFrom !== null && <> · VIP desde {formatMoney(vipFrom)}</>}
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* ─── Caminos y capacitaciones ─── */}
      <div className="mt-14 md:mt-20">
        <SectionTitle
          eyebrow="Antes de septiembre"
          title={
            <>
              Caminos y <em className="text-accent">encuentros</em>
            </>
          }
          lead="Los eventos previos del ecosistema: charlas, networking y desfiles cápsula con cupo limitado."
        />
      </div>

      {tabs.length > 2 && <Tabs tabs={tabs} active={filter} onChange={setFilter} className="mt-8" />}

      {visible.length === 0 ? (
        <EmptyState title="Nada por acá todavía">
          Pronto vas a encontrar nuevos encuentros en esta categoría.
        </EmptyState>
      ) : (
        <div className="mt-10 grid animate-rise gap-x-6 gap-y-6 sm:gap-y-8 md:grid-cols-2 md:items-stretch">
          {visible.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              registered={registeredEventIds.has(event.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-16 flex items-center justify-center">
        <Eyebrow>Sin inscripción no se ingresa · cupos limitados</Eyebrow>
      </div>
    </div>
  )
}
