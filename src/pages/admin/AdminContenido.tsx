import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Sheet } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { ContentItem } from '../../data/types'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { OpsContentForm } from '../../features/admin/OpsContentForm'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'
import { AVISO_BORRADO } from '../../features/admin/copyDestructivo'

export default function AdminContenido() {
  // Lista SIN el gate de socio: si no, los videos solo-socios llegan con el youtubeId vacío
  // y el formulario no deja guardarlos.
  const contents = useStore((s) => s.getAdminContents())
  const sponsors = useStore((s) => s.getSponsors())

  const [form, setForm] = useState<{ open: boolean; content?: ContentItem }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null)

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Contenido"
        eyebrow="Admin · Contenido"
        lead="Videos del catálogo — se publican al instante en la app."
        actions={
          <Button size="sm" onClick={() => setForm({ open: true })}>
            <Plus size={14} strokeWidth={2} /> Crear video
          </Button>
        }
      />

      {contents.length === 0 ? (
        <EmptyState title="Todavía no hay videos" className="mt-10">
          Creá el primero con "Crear video" — aparece en Contenido al instante.
        </EmptyState>
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {contents.map((content) => {
            const sponsor = sponsors.find((s) => s.id === content.sponsorId)
            return (
              <Card key={content.id} className="overflow-hidden">
                <img
                  src={`https://img.youtube.com/vi/${content.youtubeId}/hqdefault.jpg`}
                  alt={`Miniatura de ${content.title}`}
                  className="aspect-video w-full object-cover"
                />
                <div className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="type-serif min-w-0 text-xl text-ink">{content.title}</h3>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setForm({ open: true, content })}
                        aria-label="Editar video"
                        className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                      >
                        <Pencil size={14} strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(content)}
                        aria-label="Eliminar video"
                        className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {content.platform ?? 'Sin plataforma'}
                    {content.duration && ` · ${content.duration}`}
                  </p>
                  {sponsor && (
                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <Badge tone="night">Sponsor</Badge>
                      <span className="type-serif text-base text-ink">{sponsor.name}</span>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <OpsContentForm
        open={form.open}
        content={form.content}
        onClose={() => setForm({ open: false })}
      />

      <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="¿Eliminar este video?">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se elimina <em className="text-accent">{deleteTarget?.title}</em> de Contenido. {AVISO_BORRADO}
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton
            className="w-full justify-center"
            onClick={() => {
              if (deleteTarget) store.deleteContent(deleteTarget.id)
              setDeleteTarget(null)
            }}
          >
            Sí, eliminar video
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
