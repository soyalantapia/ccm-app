import { useMemo, useState } from 'react'
import { EmptyState, SectionTitle, Tabs } from '../components/ui'
import { useStore } from '../data/store'
import { EventCard } from '../features/eventos/EventCard'
import { EVENT_TYPE_ORDER, EVENT_TYPE_TABS } from '../features/eventos/eventMeta'

/** Listado /eventos: principal + Caminos a CCM + capacitaciones (PRD §6.3). */
export default function Eventos() {
  const events = useStore((s) => s.getEvents())
  const registrations = useStore((s) => s.getRegistrations())
  const [filter, setFilter] = useState('todos')

  /** Inscripto al evento o a alguno de sus bloques (toda registration lleva eventId). */
  const registeredEventIds = useMemo(
    () => new Set(registrations.filter((r) => r.status === 'confirmada').map((r) => r.eventId)),
    [registrations],
  )

  const tabs = useMemo(() => {
    const typed = EVENT_TYPE_ORDER.filter((type) => events.some((e) => e.type === type)).map(
      (type) => ({
        id: type as string,
        label: EVENT_TYPE_TABS[type],
        count: events.filter((e) => e.type === type).length,
      }),
    )
    return [{ id: 'todos', label: 'Todos', count: events.length }, ...typed]
  }, [events])

  const visible = filter === 'todos' ? events : events.filter((e) => e.type === filter)

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <SectionTitle
        eyebrow="Agenda CCM"
        title={
          <>
            Eventos y <em className="italic text-accent">encuentros</em>
          </>
        }
        lead="El evento principal, los Caminos a CCM y las capacitaciones del ecosistema. Inscribite: los cupos son limitados."
      />

      <Tabs tabs={tabs} active={filter} onChange={setFilter} className="mt-10 md:mt-14" />

      {visible.length === 0 ? (
        <EmptyState title="Nada por acá todavía">
          Pronto vas a encontrar nuevos encuentros en esta categoría.
        </EmptyState>
      ) : (
        <div className="mt-10 grid animate-rise gap-x-8 gap-y-14 md:mt-14 md:grid-cols-2">
          {visible.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              registered={registeredEventIds.has(event.id)}
              featured={event.type === 'principal'}
              offset={event.type !== 'principal' && i % 2 === 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
