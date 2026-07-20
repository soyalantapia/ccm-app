import { useState } from 'react'
import { Pencil, Plus, Trash2, PlayCircle } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Sheet } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { Nota } from '../../data/types'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { OpsNotaForm } from '../../features/admin/OpsNotaForm'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'

export default function AdminNotas() {
  const notas = useStore((s) => s.getAdminNotas())

  const [form, setForm] = useState<{ open: boolean; nota?: Nota }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<Nota | null>(null)

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Novedades"
        eyebrow="Admin · Notas"
        lead="Notas y entrevistas que publica prensa. Se actualizan como noticias: subí, editá y publicá al instante."
        actions={
          <Button size="sm" onClick={() => setForm({ open: true })}>
            <Plus size={14} strokeWidth={2} /> Crear nota
          </Button>
        }
      />

      {notas.length === 0 ? (
        <EmptyState title="Todavía no hay notas" className="mt-10">
          Creá la primera con "Crear nota" — aparece en /novedades al instante.
        </EmptyState>
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {notas.map((n) => (
            <Card key={n.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {n.category && <Badge tone="night">{n.category}</Badge>}
                    {n.youtubeId && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
                        <PlayCircle size={12} /> video
                      </span>
                    )}
                    {!n.published && <Badge tone="danger">Borrador</Badge>}
                  </div>
                  <h3 className="type-serif mt-2 text-xl text-ink">{n.title}</h3>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {n.publishedAt}
                    {n.author ? ` · ${n.author}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setForm({ open: true, nota: n })} aria-label="Editar nota"
                    className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink">
                    <Pencil size={14} strokeWidth={1.75} />
                  </button>
                  <button onClick={() => setDeleteTarget(n)} aria-label="Eliminar nota"
                    className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger">
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{n.excerpt}</p>
            </Card>
          ))}
        </div>
      )}

      <OpsNotaForm open={form.open} nota={form.nota} onClose={() => setForm({ open: false })} />

      <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="¿Eliminar esta nota?">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se elimina <em className="text-accent">{deleteTarget?.title}</em> de Novedades.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton className="w-full justify-center"
            onClick={() => { if (deleteTarget) store.deleteNota(deleteTarget.id); setDeleteTarget(null) }}>
            Sí, eliminar nota
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
        </div>
      </Sheet>
    </div>
  )
}
