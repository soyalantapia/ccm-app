import { useState } from 'react'
import { BadgeCheck, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Img, Sheet } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { CatalogProfile } from '../../data/types'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { OpsCatalogForm } from '../../features/admin/OpsCatalogForm'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'

export default function AdminCatalogo() {
  const catalog = useStore((s) => s.getCatalog())

  const [form, setForm] = useState<{ open: boolean; profile?: CatalogProfile }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<CatalogProfile | null>(null)

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Expositores"
        eyebrow="Admin · Catálogo"
        lead="Cada perfil aparece en el Catálogo de la app — diseñadores, artistas y marcas del ecosistema CCM."
        actions={
          <Button size="sm" onClick={() => setForm({ open: true })}>
            <Plus size={14} strokeWidth={2} /> Crear expositor
          </Button>
        }
      />

      {catalog.length === 0 ? (
        <EmptyState title="Todavía no hay expositores" className="mt-12">
          Creá el primero con "Crear expositor" — aparece en el Catálogo de la app al instante.
        </EmptyState>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.map((profile) => (
            <Card key={profile.id} className="flex flex-col overflow-hidden">
              <Img
                src={profile.photo}
                alt={`Retrato de ${profile.name}`}
                ratio="4/5"
              />
              <div className="flex min-w-0 flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="type-serif min-w-0 text-xl text-ink">{profile.name}</h3>
                  {profile.verified && (
                    <Badge tone="accent" className="shrink-0">
                      <BadgeCheck size={12} strokeWidth={2} aria-hidden /> Verificado
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {profile.role} · {profile.platform} · {profile.city}
                </p>
                <div className="mt-auto flex items-center gap-1 border-t border-line pt-4">
                  <button
                    onClick={() => setForm({ open: true, profile })}
                    aria-label={`Editar ${profile.name}`}
                    className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                  >
                    <Pencil size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(profile)}
                    aria-label={`Eliminar ${profile.name}`}
                    className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <OpsCatalogForm
        open={form.open}
        profile={form.profile}
        onClose={() => setForm({ open: false })}
      />

      <Sheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="¿Eliminar este expositor?"
      >
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se elimina <em className="text-accent">{deleteTarget?.name}</em> del Catálogo. Podés
          recrearlo o reiniciar la demo para volver a los datos originales.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton
            className="w-full justify-center"
            onClick={() => {
              if (deleteTarget) store.deleteCatalogProfile(deleteTarget.id)
              setDeleteTarget(null)
            }}
          >
            Sí, eliminar expositor
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
