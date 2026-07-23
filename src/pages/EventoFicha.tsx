import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, Check, ChevronLeft, Clock, Lock, MapPin, Ticket } from 'lucide-react'
import { ButtonLink, EmptyState, Eyebrow, Img, PagePending, SectionTitle } from '../components/ui'
import { store, useStore } from '../data/store'
import { useEvents } from '../data/queries'
import type { EventBlock, EventItem } from '../data/types'
import { BlockRow } from '../features/eventos/BlockRow'
import { EventCard } from '../features/eventos/EventCard'
import { EventCta } from '../features/eventos/EventCta'
import { TicketSelector } from '../features/tickets/TicketSelector'
import { ConvocatoriaBanner } from '../features/eventos/ConvocatoriaBanner'
import { PrincipalBody } from '../features/eventos/PrincipalBody'
import { EVENT_TYPE_LABELS, blockSortKey, dayLabel } from '../features/eventos/eventMeta'
import { formatMoney } from '../features/tickets/format'
import { SOCIO_PLAN, SOCIO_PRICE } from '../features/membresia/plans'

/** Candado de capacitación premium: bloquea la inscripción hasta hacerse Socio. */
function SocioGate() {
  return (
    <div className="rounded-lg border-2 border-accent bg-night p-6 text-night-ink md:p-8">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Lock size={16} />
        </span>
        <p className="eyebrow text-[10px] text-accent">Capacitación premium · solo Socios</p>
      </div>
      <h3 className="type-serif mt-4 text-2xl text-night-ink">Esta capacitación es para Socios CCM</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-night-ink/70">
        Con la membresía Socio accedés a todos los talleres premium del año, zona VIP, contenido
        exclusivo y descuentos con los expositores.
      </p>
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {SOCIO_PLAN.benefits.map((b) => (
          <li key={b.title} className="flex items-center gap-2 text-sm text-night-ink/85">
            <Check size={14} strokeWidth={2.5} className="shrink-0 text-accent" />
            {b.title}
          </li>
        ))}
      </ul>
      <ButtonLink to="/membresia" size="lg" className="mt-7">
        Hacerme Socio · {formatMoney(SOCIO_PRICE)}
      </ButtonLink>
    </div>
  )
}

/**
 * Lo que pasa ADENTRO de este evento y se difunde o se cobra aparte: un workshop, una
 * capacitación, una masterclass. Cada una tiene su ficha y su link propios.
 *
 * Está afuera del cuerpo de la ficha porque el evento PRINCIPAL usa otro layout (PrincipalBody) y
 * esta sección vivía adentro del `else`: las iniciativas del principal —el caso más obvio, un
 * taller adentro de CCM 2026— no aparecían en ninguna pantalla pública. Se llegaba sólo con el
 * link directo, y el listado general las esconde a propósito.
 */
function Iniciativas({ items, locked }: { items: EventItem[]; locked: (e: EventItem) => boolean }) {
  if (items.length === 0) return null
  return (
    <section className="mx-auto max-w-6xl px-5 pb-12 md:pb-16">
      <SectionTitle
        eyebrow="Adentro de este evento"
        title={
          <>
            Workshops y <em className="text-accent">capacitaciones</em>
          </>
        }
        lead="Actividades con cupo propio que se reservan aparte."
      />
      <div className="mt-8 grid gap-5 md:mt-10 md:grid-cols-2 lg:grid-cols-3">
        {items.map((ini) => (
          <EventCard key={ini.id} event={ini} registered={false} locked={locked(ini)} />
        ))}
      </div>
    </section>
  )
}

/**
 * Ficha /eventos/:slug. El evento principal usa el layout completo de expo
 * (compra de entradas adentro, info real, agenda, director); caminos y
 * capacitaciones mantienen la grilla con inscripción por bloque.
 */
export default function EventoFicha() {
  const { slug } = useParams<{ slug: string }>()
  const events = useEvents()
  const plans = useStore((s) => s.getPlans())
  const isSocio = useStore((s) => s.isSocio())
  const hydrating = useStore((s) => s.isHydrating('events'))
  const event = events.find((e) => e.slug === slug)

  const eventId = event?.id
  useEffect(() => {
    if (eventId) store.track('event_view', { eventId })
  }, [eventId])

  if (!event) {
    if (hydrating) return <PagePending />
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

  const isPrincipal = event.type === 'principal'
  /* El candado de Socios alcanza a lo que pasa ADENTRO: un taller colgado de una capacitación
     premium es parte de ella, no una puerta de atrás. Una iniciativa nace con socioOnly en false,
     así que sin heredarlo el candado del evento grande se abría solo con cargarle algo adentro.
     El server hereda lo mismo, en registrationService. */
  const padre = event.parentId ? events.find((e) => e.id === event.parentId) : undefined
  const soloSocios = !!event.socioOnly || !!padre?.socioOnly
  const locked = !isPrincipal && soloSocios && !isSocio
  /* El mismo candado, para las tarjetas de las iniciativas de este evento: sin esto la tarjeta
     sale sin la chapa "Solo Socios" y prometiendo una inscripción que el server rechaza. */
  const estaTrabada = (ini: EventItem) => (!!ini.socioOnly || soloSocios) && !isSocio

  /* Bloques ordenados por día + hora, agrupados por día (solo no-principal). */
  const sortedBlocks = isPrincipal
    ? []
    : [...store.getBlocks(event.id)].sort((a, b) => blockSortKey(a).localeCompare(blockSortKey(b)))
  const days = new Map<string, EventBlock[]>()
  for (const block of sortedBlocks) {
    const list = days.get(block.day)
    if (list) list.push(block)
    else days.set(block.day, [block])
  }
  const dayEntries = [...days.entries()]

  /* Iniciativas que cuelgan de este evento. Se listan sólo acá y en el panel: el filtro de la
     grilla general las saca a propósito, para que no aparezcan como encuentros sueltos. */
  const iniciativas = events.filter((e) => e.parentId === event.id)
  /* Los tipos de entrada de ESTE evento. Hasta acá sólo el evento principal podía mostrarlos
     —el selector vivía adentro de PrincipalBody—, así que se podían cargar entradas para
     cualquier evento y ninguna era visible ni comprable fuera del principal. */
  const entradas = plans.filter((p) => p.eventId === event.id)

  return (
    <>
      {/* Hero: cover con overlay night + volver (app-style) */}
      <section className="relative bg-night">
        <Img src={event.cover} alt={event.title} priority className="h-[24rem] w-full md:h-[32rem]" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/25 to-night/20"
        />
        <Link
          to="/eventos"
          aria-label="Volver a eventos"
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-night/60 text-night-ink backdrop-blur-sm transition-all active:scale-90 hover:bg-night/80"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </Link>
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl animate-rise px-5 pb-10 md:pb-14">
            <Eyebrow tone="night">{EVENT_TYPE_LABELS[event.type]}</Eyebrow>
            <h1 className="type-display mt-4 max-w-3xl text-[clamp(2.4rem,8vw,5rem)] text-balance text-night-ink">
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
          {event.price != null && (
            // El precio va en la misma fila que fecha, horario y sede: es un dato del evento,
            // no una promoción. Se muestra aunque todavía no haya checkout — que exista el
            // número ya cumple la regla del cliente de que una capacitación no salga gratis.
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <Ticket size={15} className="shrink-0 text-accent" />
              {formatMoney(event.price)}
            </span>
          )}
          <ButtonLink
            href={event.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
            className="md:ml-auto"
          >
            Mostrar mapa <ArrowUpRight size={13} />
          </ButtonLink>
        </div>
      </section>

      {isPrincipal ? (
        <>
          <PrincipalBody event={event} />
          <Iniciativas items={iniciativas} locked={estaTrabada} />
        </>
      ) : (
        <>
          {/* Descripción editorial + CTA general (arriba de la grilla) */}
          <section className="mx-auto max-w-6xl px-5 py-12 md:py-16">
            <div className="max-w-2xl">
              <p className="text-[15px] leading-relaxed text-ink-soft md:text-base">
                {event.description}
              </p>
              <div className="mt-8">
                {/* Con tipos de entrada cargados el CTA suelto sobra y además se contradice:
                    mostraría "Comprar mi lugar · $25.000" arriba de un selector donde la misma
                    entrada puede costar otra cosa. Manda el selector, que es más específico. */}
                {locked ? (
                  <SocioGate />
                ) : entradas.length > 0 ? null : (
                  <EventCta key={event.id} event={event} />
                )}
              </div>
            </div>
          </section>

          {/* Entradas de este evento. El precio suelto del evento (EventCta) y los tipos de
              entrada son dos formas distintas de vender: si hay tipos cargados, mandan ellos,
              porque son más específicos —cada uno con su precio, su cargo y sus ventajas. */}
          {!locked && entradas.length > 0 && (
            <section className="mx-auto max-w-6xl px-5 pb-12 md:pb-16">
              <SectionTitle
                eyebrow="Entradas"
                title={
                  <>
                    Elegí tu <em className="text-accent">entrada</em>
                  </>
                }
                lead="Cada tipo incluye cosas distintas. El cupo se actualiza en vivo."
              />
              <div className="mt-8 md:mt-10">
                <TicketSelector eventId={event.id} />
              </div>
            </section>
          )}

          {/* Grilla de bloques con cupo en vivo (oculta tras el candado) */}
          {!locked && (
          <section className="mx-auto max-w-6xl px-5 pb-16 md:pb-24">
            <SectionTitle
              eyebrow="Inscripción por bloque"
              title={
                <>
                  El <em className="text-accent">programa</em>
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
                      <BlockRow key={block.id} block={block} dePago={event.price != null} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
          )}

          <Iniciativas items={iniciativas} locked={estaTrabada} />

          {/* Convocatoria asociada (solo Caminos) */}
          {event.type === 'camino' && <ConvocatoriaBanner />}
        </>
      )}
    </>
  )
}
