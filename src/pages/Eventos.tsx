import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, MapPin, Sparkles, Ticket } from 'lucide-react'
import { AdBanner, Badge, EmptyState, Eyebrow, Img, Tabs } from '../components/ui'
import { store, useStore } from '../data/store'
import { useEvents, useRegistrations } from '../data/queries'
import { IDS } from '../data/ids'
import { EventCard } from '../features/eventos/EventCard'
import { formatMoney } from '../features/tickets/format'
import { EVENT_TYPE_ORDER, EVENT_TYPE_TABS } from '../features/eventos/eventMeta'
import {
  CorazonesCta,
  LanzamientoCard,
  NoticiaCard,
  PrensaItem,
  SectionLabel,
  SponsorCuadrado,
  VideoThumb,
} from '../features/app/mockup'

/** Listado /eventos: banner del evento principal + Caminos y capacitaciones. */
export default function Eventos() {
  const events = useEvents()
  const registrations = useRegistrations()
  const isSocio = useStore((s) => s.isSocio())
  const vipFrom = useStore(
    (s) => s.getPlans().find((p) => p.kind === 'vip' && p.price !== null)?.price ?? null,
  )
  const [filter, setFilter] = useState('todos')

  const sponsors = useStore((s) => s.getSponsors())
  const contents = useStore((s) => s.getContents())
  const notas = useStore((s) => s.getNotas())

  const principal = events.find((e) => e.type === 'principal')
  // Un evento especial (capacitación destacada) se muestra como lanzamiento-card
  // y se excluye de la lista de Caminos para no duplicarlo.
  const especial = events.find((e) => e.type === 'capacitacion')
  const rest = events.filter((e) => e.type !== 'principal' && e.id !== especial?.id)

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
    <div className="mx-auto max-w-2xl px-5 py-6 lg:max-w-5xl">
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
            <Badge tone="solid">Evento principal · 14ª edición</Badge>
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

      {/* Sponsor-banner tras el hero (cadencia del mockup) */}
      <AdBanner slot="S2" className="mt-8" />

      {/* ─── Camino a CCM ─── */}
      <SectionLabel className="mt-4">Camino a CCM</SectionLabel>

      {tabs.length > 2 && <Tabs tabs={tabs} active={filter} onChange={setFilter} className="mt-2" />}

      {visible.length === 0 ? (
        <EmptyState title="Nada por acá todavía">
          Pronto vas a encontrar nuevos encuentros en esta categoría.
        </EmptyState>
      ) : (
        <div className="mt-4 grid animate-rise grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4">
          {visible.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              registered={registeredEventIds.has(event.id)}
              locked={!!event.socioOnly && !isSocio}
            />
          ))}
        </div>
      )}

      <AdBanner slot="S2" index={1} className="mt-4" />

      {/* Evento especial (lanzamiento-card) */}
      {especial && (
        <>
          <SectionLabel>Evento especial</SectionLabel>
          <LanzamientoCard event={especial} />
        </>
      )}

      {/* Sponsors (sponsors-duo) */}
      {sponsors.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {sponsors.slice(0, 2).map((sp) => (
            <SponsorCuadrado key={sp.id} icon={<Sparkles size={16} />} name={sp.name} label={sp.level} />
          ))}
        </div>
      )}

      {/* Noticias en video */}
      {contents.length > 0 && (
        <>
          <SectionLabel>Noticias en video</SectionLabel>
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
            {contents.slice(0, 6).map((c) => (
              <VideoThumb key={c.id} c={c} />
            ))}
          </div>
        </>
      )}

      {/* Novedades (noticias-duo) */}
      {notas.length > 0 && (
        <>
          <SectionLabel>Novedades</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5">
            {notas.slice(0, 2).map((n) => (
              <NoticiaCard key={n.id} n={n} />
            ))}
          </div>
        </>
      )}

      <AdBanner slot="S2" index={2} className="mt-4" />

      {/* Prensa */}
      {notas.length > 2 && (
        <>
          <SectionLabel>Prensa</SectionLabel>
          <div className="flex flex-col gap-2">
            {notas.slice(2, 5).map((n) => (
              <PrensaItem key={n.id} n={n} />
            ))}
          </div>
        </>
      )}

      {/* Corazones CCM */}
      <SectionLabel>Corazones CCM</SectionLabel>
      <CorazonesCta to={`/c/${IDS.convocatoriaSlugs.camino}`} />

      <div className="mt-8 flex items-center justify-center">
        <Eyebrow>Sin inscripción no se ingresa · cupos limitados</Eyebrow>
      </div>
    </div>
  )
}
