import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { Badge, Button } from '../../components/ui'
import { useStore } from '../../data/store'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { CoreOccupancyBar } from '../../features/admin/CoreOccupancyBar'
import { OpsEventForm } from '../../features/admin/OpsEventForm'
import { EVENT_TYPE_META, percent } from '../../features/admin/coreFormat'

export default function AdminEventos() {
  const navigate = useNavigate()
  const [formOpen, setFormOpen] = useState(false)

  const rows = useStore((s) =>
    s.getEvents().map((event) => {
      const blocks = s.getBlocks(event.id)
      const avail = blocks.map((b) => s.blockAvailability(b.id))
      const capacity = avail.reduce((n, a) => n + a.capacity, 0)
      const taken = avail.reduce((n, a) => n + a.taken, 0)
      const generals = s.generalRegistrationCount(event.id)
      return { event, blockCount: blocks.length, capacity, taken, registered: taken + generals }
    }),
  )

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Eventos"
        live
        lead="Inscriptos y ocupación se actualizan en vivo con cada acción del público."
        actions={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus size={14} strokeWidth={2} /> Crear evento
          </Button>
        }
      />

      <OpsEventForm open={formOpen} onClose={() => setFormOpen(false)} />

      {/* Tabla editorial (desktop) */}
      <div className="mt-10 hidden md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="eyebrow py-3 pr-4 text-[9px] font-semibold text-ink-soft">Evento</th>
              <th className="eyebrow py-3 pr-4 text-[9px] font-semibold text-ink-soft">Tipo</th>
              <th className="eyebrow py-3 pr-4 text-[9px] font-semibold text-ink-soft">Fecha</th>
              <th className="eyebrow py-3 pr-4 text-right text-[9px] font-semibold text-ink-soft">Bloques</th>
              <th className="eyebrow py-3 pr-4 text-right text-[9px] font-semibold text-ink-soft">
                Inscriptos
              </th>
              <th className="eyebrow w-52 py-3 pr-4 text-[9px] font-semibold text-ink-soft">Ocupación</th>
              <th className="py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ event, blockCount, capacity, taken, registered }) => (
              <tr
                key={event.id}
                onClick={() => navigate(`/admin/eventos/${event.id}`)}
                className="group cursor-pointer border-b border-line transition-colors duration-200 hover:bg-surface"
              >
                <td className="max-w-xs py-4 pr-4">
                  <p className="type-serif truncate text-base text-ink underline-offset-4 decoration-accent group-hover:underline">
                    {event.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-ink-soft">{event.venue}</p>
                </td>
                <td className="py-4 pr-4">
                  <Badge tone={EVENT_TYPE_META[event.type].tone}>{EVENT_TYPE_META[event.type].label}</Badge>
                </td>
                <td className="py-4 pr-4 text-[13px] text-ink-soft">{event.dateLabel}</td>
                <td className="py-4 pr-4 text-right text-[13px] tabular-nums text-ink">{blockCount}</td>
                <td className="type-serif py-4 pr-4 text-right text-lg tabular-nums text-ink">{registered}</td>
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <CoreOccupancyBar className="flex-1" taken={taken} capacity={capacity} compact />
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                      {percent(taken, capacity)}%
                    </span>
                  </div>
                </td>
                <td className="py-4 text-ink-soft">
                  <ArrowRight
                    size={15}
                    strokeWidth={1.75}
                    className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards (mobile) */}
      <div className="mt-8 space-y-4 md:hidden">
        {rows.map(({ event, blockCount, capacity, taken, registered }) => (
          <Link
            key={event.id}
            to={`/admin/eventos/${event.id}`}
            className="group block rounded-md border border-line bg-surface p-5 transition-colors duration-200 active:bg-bg"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="type-serif truncate text-lg text-ink">{event.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-soft">{event.dateLabel}</p>
              </div>
              <Badge tone={EVENT_TYPE_META[event.type].tone}>{EVENT_TYPE_META[event.type].label}</Badge>
            </div>
            <div className="mt-4 flex items-baseline gap-5 border-t border-line pt-3">
              <p className="text-[12px] text-ink-soft">
                <span className="type-serif text-base text-ink">{blockCount}</span> bloques
              </p>
              <p className="text-[12px] text-ink-soft">
                <span className="type-serif text-base text-ink">{registered}</span> inscriptos
              </p>
              <p className="ml-auto text-[12px] tabular-nums text-ink-soft">{percent(taken, capacity)}%</p>
            </div>
            <CoreOccupancyBar className="mt-2" taken={taken} capacity={capacity} compact />
          </Link>
        ))}
      </div>

      <p className="mt-8 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-soft/70">
        Los inscriptos combinan los cupos previos del seed con las inscripciones de esta demo. Podés
        crear, editar y eliminar eventos y sus bloques desde acá — los cambios aparecen al instante en
        la app. En Fase 1 esto vive en el backend con roles y auditoría (PRD §10.2).
      </p>
    </div>
  )
}
