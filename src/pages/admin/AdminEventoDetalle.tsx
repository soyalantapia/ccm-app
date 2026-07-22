import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, ButtonLink, EmptyState, Img, Sheet, Stat } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { EventBlock, InscriptoAdmin } from '../../data/types'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { CorePanel } from '../../features/admin/CorePanel'
import { CoreOccupancyBar } from '../../features/admin/CoreOccupancyBar'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'
import { OpsEventForm } from '../../features/admin/OpsEventForm'
import { OpsBlockForm } from '../../features/admin/OpsBlockForm'
import { formatMoney } from '../../features/tickets/format'
import { EVENT_TYPE_META, formatDateTime, percent } from '../../features/admin/coreFormat'
import { AVISO_BORRADO } from '../../features/admin/copyDestructivo'

export default function AdminEventoDetalle() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [blockForm, setBlockForm] = useState<{ open: boolean; block?: EventBlock }>({ open: false })
  const [iniciativaOpen, setIniciativaOpen] = useState(false)
  const [deleteBlock, setDeleteBlock] = useState<EventBlock | null>(null)

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
  // Las INICIATIVAS que cuelgan de este evento. Se leen de la lista del panel (que incluye
  // borradores): una iniciativa a medio armar tiene que verse acá, que es donde se la termina.
  const iniciativas = useStore((s) => s.getAdminEvents().filter((e) => e.parentId === id))
  // Los inscriptos REALES, de todos los dispositivos. Antes esto salía de getRegistrations(),
  // que es device-scoped (lo dice el docstring de DataStore): la lista mostraba únicamente las
  // inscripciones del teléfono desde el que se estaba mirando, o sea casi siempre ninguna. Para
  // el organizador eso se lee como "no se anotó nadie" y no da ningún síntoma de que esté mal.
  const [inscriptos, setInscriptos] = useState<InscriptoAdmin[] | null>(null)
  const [errorInscriptos, setErrorInscriptos] = useState(false)
  useEffect(() => {
    let vivo = true
    setInscriptos(null)
    setErrorInscriptos(false)
    store
      .fetchInscriptos(id)
      .then((r) => vivo && setInscriptos(r))
      .catch(() => vivo && setErrorInscriptos(true))
    return () => {
      vivo = false
    }
  }, [id])

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
          El ID no corresponde a ningún evento — puede que se haya eliminado.
        </EmptyState>
      </div>
    )
  }

  const capacity = blocks.reduce((n, b) => n + b.avail.capacity, 0)
  const taken = blocks.reduce((n, b) => n + b.avail.taken, 0)
  const seedTotal = blocks.reduce((n, b) => n + b.block.seedTaken, 0)

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
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={13} strokeWidth={2} /> Editar
              </Button>
              <OpsDangerButton size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} strokeWidth={2} /> Eliminar
              </OpsDangerButton>
            </div>
          }
        />
      </div>

      <div className="mt-10 grid gap-x-10 gap-y-10 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          {/* Bloques con ocupación en vivo */}
          {/* Iniciativas: workshops, capacitaciones o lo que sea, adentro de este evento.
              Cada una es un evento con su ficha, su portada, su link propio y su precio — por eso
              se cargan con el MISMO formulario de evento, sólo que ya saben de quién cuelgan. */}
          <CorePanel title="Iniciativas" note="Workshops y capacitaciones adentro de este evento">
            <div className="mb-5">
              <Button variant="outline" size="sm" onClick={() => setIniciativaOpen(true)}>
                <Plus size={13} strokeWidth={2} /> Agregar iniciativa
              </Button>
            </div>
            {iniciativas.length === 0 ? (
              <p className="py-2 text-sm text-ink-soft">
                Todavía no hay iniciativas. Una iniciativa es cualquier cosa que pase adentro de
                este evento y que quieras difundir o cobrar aparte: un workshop, una capacitación,
                una masterclass. Tiene su propia página y su propio link para compartir.
              </p>
            ) : (
              <ul className="space-y-3">
                {iniciativas.map((ini) => (
                  <li
                    key={ini.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 border-b border-line pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/admin/eventos/${ini.id}`}
                        className="type-serif text-[15px] text-ink hover:text-accent-strong"
                      >
                        {ini.title}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-ink-soft">
                        {ini.dateLabel}
                        {ini.price != null && ` · ${formatMoney(ini.price)}`}
                        {ini.capacity != null && ` · ${ini.capacity} lugares`}
                      </p>
                    </div>
                    <Badge tone={ini.published ? 'success' : 'outline'}>
                      {ini.published ? 'Publicada' : 'Borrador'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CorePanel>

          <CorePanel title="Bloques" note="Ocupación en vivo sobre el cupo de cada bloque">
            <div className="mb-5">
              <Button variant="outline" size="sm" onClick={() => setBlockForm({ open: true })}>
                <Plus size={13} strokeWidth={2} /> Agregar bloque
              </Button>
            </div>
            {blocks.length === 0 ? (
              <p className="py-2 text-sm text-ink-soft">
                Este evento todavía no tiene bloques. Agregá charlas, masterclasses o desfiles con
                "Agregar bloque".
              </p>
            ) : (
              <div className="space-y-6">
                {blocks.map(({ block, avail, localTaken }) => (
                  <div key={block.id} className="border-b border-line pb-5 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="eyebrow text-[9px] text-accent">
                          {block.kind} · {block.day} · {block.start}–{block.end} hs
                        </p>
                        <p className="type-serif mt-1.5 text-lg leading-snug text-ink">{block.title}</p>
                        <p className="mt-0.5 text-[12px] text-ink-soft">{block.room}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setBlockForm({ open: true, block })}
                          aria-label="Editar bloque"
                          className="rounded-sm p-2 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                        >
                          <Pencil size={15} strokeWidth={1.75} />
                        </button>
                        <button
                          onClick={() => setDeleteBlock(block)}
                          aria-label="Eliminar bloque"
                          className="rounded-sm p-2 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={15} strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                    <CoreOccupancyBar className="mt-3" taken={avail.taken} capacity={avail.capacity} />
                    {/* Separados con "·" y no con "+": contra el backend el total de la barra lo
                        cuenta el server sobre todos los dispositivos, así que estos dos números no
                        suman ese total y sugerirlo con un "+" sería mentir. */}
                    <p className="mt-1.5 text-[11px] tabular-nums text-ink-soft/80">
                      {block.seedTaken} previos · {localTaken} desde este navegador
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CorePanel>

          {/* Inscriptos reales (todos los dispositivos) */}
          <CorePanel title="Inscriptos" note="Todos los dispositivos, en vivo desde el servidor">
            {errorInscriptos ? (
              <p className="py-4 text-sm leading-relaxed text-danger">
                No pudimos traer la lista de inscriptos. Recargá la página; si sigue, puede que tu
                usuario no tenga permiso para ver datos personales.
              </p>
            ) : inscriptos === null ? (
              <p className="py-4 text-sm text-ink-soft">Cargando inscriptos…</p>
            ) : inscriptos.length === 0 ? (
              <p className="py-4 text-sm leading-relaxed text-ink-soft">
                Todavía no se anotó nadie a este evento.
              </p>
            ) : (
              <ul>
                {inscriptos.map((ins) => (
                  <li
                    key={ins.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="type-serif text-[15px] text-ink">
                        {ins.nombre ?? 'Sin nombre cargado'}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-ink-soft">
                        {ins.blockTitle ?? 'Inscripción general'}
                        {ins.email && ` · ${ins.email}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-[11px] tabular-nums text-ink-soft/70">
                        {formatDateTime(ins.ts)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {/* La ocupación de arriba sólo agrega inscripciones CON bloque: blockAvailability
                filtra por blockId. Las generales de otros dispositivos no entran en ninguna cifra
                de esta pantalla, así que decir que "se cuentan por bloque, arriba" era falso. */}
            <p className="mt-4 text-[11px] leading-relaxed text-ink-soft/70">
              Además hay {seedTotal} inscriptos previos cargados como baseline de cupo: ocupan
              lugar pero no tienen ficha individual. Y la ocupación de arriba suma sólo lo que
              tomó cada bloque — las inscripciones generales, las que no eligen bloque, sí están
              en esta lista pero no en esa cifra. Para ver a una persona con todas sus
              inscripciones, entrá por Usuarios.
            </p>
          </CorePanel>
        </div>

        {/* Columna lateral: portada + cifras */}
        <aside className="space-y-8">
          <Img src={event.cover} alt={event.title} ratio="16/10" className="rounded-md border border-line" />
          <div className="grid grid-cols-3 gap-4 border-t border-line pt-5 lg:grid-cols-1 lg:gap-8">
            <Stat value={`${percent(taken, capacity)}%`} label="Ocupación" tone="accent" />
            {/* "en bloques" y no "totales": suma blockAvailability, que deja afuera las
                inscripciones generales (sin bloque) que cuenta generalRegistrationCount. */}
            <Stat value={taken} label="Inscriptos en bloques" />
            <Stat
              value={inscriptos?.length ?? 0}
              label="Inscriptos"
            />
          </div>
        </aside>
      </div>

      {/* Modales: editar evento, crear/editar bloque, confirmaciones de borrado */}
      <OpsEventForm open={editOpen} event={event} onClose={() => setEditOpen(false)} />
      <OpsEventForm
        open={iniciativaOpen}
        parentId={event.id}
        onClose={() => setIniciativaOpen(false)}
      />
      <OpsBlockForm
        open={blockForm.open}
        eventId={event.id}
        block={blockForm.block}
        onClose={() => setBlockForm({ open: false })}
      />
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="¿Eliminar este evento?">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se elimina <em className="text-accent">{event.title}</em> y todos sus bloques. Desaparece de
          la app. {AVISO_BORRADO}
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton
            className="w-full justify-center"
            onClick={() => {
              store.deleteEvent(event.id)
              navigate('/admin/eventos')
            }}
          >
            Sí, eliminar evento
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setConfirmDelete(false)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
      <Sheet open={!!deleteBlock} onClose={() => setDeleteBlock(null)} title="¿Eliminar este bloque?">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se elimina <em className="text-accent">{deleteBlock?.title}</em> del programa.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton
            className="w-full justify-center"
            onClick={() => {
              if (deleteBlock) store.deleteBlock(deleteBlock.id)
              setDeleteBlock(null)
            }}
          >
            Sí, eliminar bloque
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setDeleteBlock(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
