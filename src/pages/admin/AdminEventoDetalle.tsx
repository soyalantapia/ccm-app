import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin } from 'lucide-react'
import { Badge, ButtonLink, EmptyState, Img, Stat } from '../../components/ui'
import { useStore } from '../../data/store'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { CorePanel } from '../../features/admin/CorePanel'
import { CoreOccupancyBar } from '../../features/admin/CoreOccupancyBar'
import { EVENT_TYPE_META, formatDateTime, percent } from '../../features/admin/coreFormat'

export default function AdminEventoDetalle() {
  const { id = '' } = useParams()

  const event = useStore((s) => s.getEventById(id))
  const blocks = useStore((s) =>
    s.getBlocks(id).map((block) => {
      const avail = s.blockAvailability(block.id)
      const localTaken = s
        .getRegistrations()
        .filter((r) => r.blockId === block.id && r.status === 'confirmada').length
      return { block, avail, localTaken }
    }),
  )
  const registrations = useStore((s) =>
    s
      .getRegistrations()
      .filter((r) => r.eventId === id)
      .sort((a, b) => b.ts.localeCompare(a.ts)),
  )
  const profile = useStore((s) => s.getProfile())

  if (!event) {
    return (
      <div className="px-5 py-8 md:px-10">
        <EmptyState
          title="Evento no encontrado"
          action={
            <ButtonLink to="/admin/eventos" variant="outline" size="sm">
              <ArrowLeft size={13} strokeWidth={2} /> Volver a Eventos
            </ButtonLink>
          }
        >
          El ID no corresponde a ningún evento del seed.
        </EmptyState>
      </div>
    )
  }

  const capacity = blocks.reduce((n, b) => n + b.avail.capacity, 0)
  const taken = blocks.reduce((n, b) => n + b.avail.taken, 0)
  const seedTotal = blocks.reduce((n, b) => n + b.block.seedTaken, 0)
  const deviceName =
    [profile.fields.firstName?.value, profile.fields.lastName?.value].filter(Boolean).join(' ') ||
    'Visitante sin datos'

  return (
    <div className="px-5 py-8 md:px-10">
      <Link
        to="/admin/eventos"
        className="eyebrow group inline-flex items-center gap-2 text-[9px] text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft size={12} strokeWidth={2} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
        Eventos
      </Link>

      <div className="mt-5">
        <CorePageHeader
          eyebrow={EVENT_TYPE_META[event.type].label}
          title={event.title}
          live
          lead={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {event.dateLabel}
                {event.timeLabel ? ` · ${event.timeLabel}` : ''}
              </span>
              <span aria-hidden>—</span>
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} strokeWidth={1.75} /> {event.venue}, {event.address}
              </span>
            </span>
          }
        />
      </div>

      <div className="mt-10 grid gap-x-10 gap-y-10 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          {/* Bloques con ocupación en vivo */}
          <CorePanel title="Bloques" note="Cupo seed + inscripciones de esta demo, en vivo">
            {blocks.length === 0 ? (
              <p className="py-4 text-sm text-ink-soft">Este evento no tiene bloques con cupo.</p>
            ) : (
              <div className="space-y-6">
                {blocks.map(({ block, avail, localTaken }) => (
                  <div key={block.id} className="border-b border-line pb-5 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <p className="eyebrow text-[9px] text-accent">
                          {block.kind} · {block.day} · {block.start}–{block.end} hs
                        </p>
                        <p className="type-serif mt-1.5 text-lg leading-snug text-ink">{block.title}</p>
                        <p className="mt-0.5 text-[12px] text-ink-soft">{block.room}</p>
                      </div>
                    </div>
                    <CoreOccupancyBar className="mt-3" taken={avail.taken} capacity={avail.capacity} />
                    <p className="mt-1.5 text-[11px] tabular-nums text-ink-soft/80">
                      {block.seedTaken} previos + {localTaken} de esta demo
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CorePanel>

          {/* Inscriptos locales */}
          <CorePanel title="Inscriptos de esta demo" note="Identidad por dispositivo, sin contraseñas">
            {registrations.length === 0 ? (
              <p className="py-4 text-sm leading-relaxed text-ink-soft">
                Todavía no hay inscripciones desde este dispositivo. Abrí la app en otra pestaña e
                inscribite a un bloque: la fila aparece acá al instante.
              </p>
            ) : (
              <ul>
                {registrations.map((reg) => {
                  const block = reg.blockId ? blocks.find((b) => b.block.id === reg.blockId)?.block : undefined
                  return (
                    <li
                      key={reg.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="type-serif text-[15px] text-ink">{deviceName}</p>
                        <p className="mt-0.5 truncate text-[12px] text-ink-soft">
                          {block ? block.title : 'Inscripción general'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={reg.status === 'confirmada' ? 'success' : 'danger'}>
                          {reg.status === 'confirmada' ? 'Confirmada' : 'Cancelada'}
                        </Badge>
                        <span className="text-[11px] tabular-nums text-ink-soft/70">
                          {formatDateTime(reg.ts)}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-ink-soft/70">
              Los {seedTotal} inscriptos previos del seed se muestran agregados por bloque; en Fase 1
              cada inscripto tiene su ficha individual con acciones masivas (PRD §10.2).
            </p>
          </CorePanel>
        </div>

        {/* Columna lateral: portada + cifras */}
        <aside className="space-y-8">
          <Img src={event.cover} alt={event.title} ratio="16/10" className="rounded-md border border-line" />
          <div className="grid grid-cols-3 gap-4 border-t border-line pt-5 lg:grid-cols-1 lg:gap-8">
            <Stat value={`${percent(taken, capacity)}%`} label="Ocupación" tone="accent" />
            <Stat value={taken} label="Inscriptos totales" />
            <Stat
              value={registrations.filter((r) => r.status === 'confirmada').length}
              label="De esta demo"
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
