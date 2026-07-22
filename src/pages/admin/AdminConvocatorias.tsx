import { useState } from 'react'
import { Pencil, Plus, Trash2, ListChecks } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Sheet } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { Convocatoria } from '../../data/types'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { OpsConvocatoriaForm } from '../../features/admin/OpsConvocatoriaForm'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'

export default function AdminConvocatorias() {
  const convocatorias = useStore((s) => s.getConvocatorias())
  const events = useStore((s) => s.getAdminEvents())
  // getApplications() cae en cascada (adminApplications ?? applications del device ?? SEED) —
  // una lista que puede ser parcial o directamente de demo. El guard del borrado en cascada de
  // acá abajo (Application.convocatoriaId es `onDelete: Cascade`) necesita el TOTAL real o nada:
  // getAdminApplications() es la única lectura que nunca miente, null mientras no lo sabe con
  // certeza (cargando o falló) en vez de dejar ver un conteo parcial como si fuera el total.
  // BLOQUEANTE 2 del review.
  const applications = useStore((s) => s.getAdminApplications())
  const fallo = useStore((s) => s.applicationsFailed())

  const [form, setForm] = useState<{ open: boolean; convocatoria?: Convocatoria }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<Convocatoria | null>(null)

  const eventName = (id: string) => events.find((e) => e.id === id)?.title ?? '—'
  // null = todavía no sabemos el total real (hidratando o falló el fetch). Nunca se muestra como
  // "0 postulaciones": un guard destructivo derivado de un conteo que en realidad es "no sé" es
  // peor que no tener guard.
  const appsFor = (id: string): number | null =>
    applications ? applications.filter((a) => a.convocatoriaId === id).length : null
  const targetApps = deleteTarget ? appsFor(deleteTarget.id) : 0
  const conteoConocido = targetApps !== null

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Convocatorias"
        eyebrow="Admin · Convocatorias"
        lead="Formularios de inscripción por evento o rubro (universidades, sponsors, participantes). Creá, editá los campos y publicá; la gente se postula en /c/:slug."
        actions={
          <Button size="sm" onClick={() => setForm({ open: true })}>
            <Plus size={14} strokeWidth={2} /> Crear convocatoria
          </Button>
        }
      />

      {convocatorias.length === 0 ? (
        <EmptyState title="Todavía no hay convocatorias" className="mt-10">
          Creá la primera con "Crear convocatoria" — queda disponible en /c/:slug al instante.
        </EmptyState>
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {convocatorias.map((c) => {
            const count = appsFor(c.id)
            return (
              <Card key={c.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="night">{eventName(c.eventId)}</Badge>
                      <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
                        <ListChecks size={12} /> {c.fields.length} campo{c.fields.length === 1 ? '' : 's'}
                      </span>
                      {/* count === null (todavía no sabemos el total real) no muestra nada — nunca "0
                       *  postulaciones" cuando en realidad es "no sé". */}
                      {!!count && count > 0 && <Badge tone="accent">{count} postulaciones</Badge>}
                    </div>
                    <h3 className="type-serif mt-2 text-xl text-ink">{c.title}</h3>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      /c/{c.slug} · cierra {c.deadline}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setForm({ open: true, convocatoria: c })}
                      aria-label="Editar convocatoria"
                      className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(c)}
                      aria-label="Eliminar convocatoria"
                      className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{c.intro}</p>
              </Card>
            )
          })}
        </div>
      )}

      <OpsConvocatoriaForm
        open={form.open}
        convocatoria={form.convocatoria}
        onClose={() => setForm({ open: false })}
      />

      <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="¿Eliminar esta convocatoria?">
        {targetApps === null ? (
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Todavía no pudimos confirmar cuántas postulaciones tiene <em className="text-accent">{deleteTarget?.title}</em>
            {' '}({fallo ? 'no pudimos traer la lista' : 'está cargando'}). Borrar a ciegas puede llevarse
            postulaciones reales — esperá a que confirme el número antes de eliminarla.
          </p>
        ) : targetApps > 0 ? (
          <p className="text-[15px] leading-relaxed text-ink-soft">
            <em className="text-accent">{deleteTarget?.title}</em> tiene <strong>{targetApps} postulación(es)</strong>.
            No se puede eliminar sin perder esos datos — primero resolvé o exportá las postulaciones.
          </p>
        ) : (
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Se elimina <em className="text-accent">{deleteTarget?.title}</em> y sus campos. Los links a /c/{deleteTarget?.slug} dejan de funcionar.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2.5">
          {conteoConocido && targetApps === 0 && (
            <OpsDangerButton
              className="w-full justify-center"
              onClick={() => {
                if (deleteTarget) store.deleteConvocatoria(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Sí, eliminar convocatoria
            </OpsDangerButton>
          )}
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
