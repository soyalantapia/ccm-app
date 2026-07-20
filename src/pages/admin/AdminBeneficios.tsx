import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Sheet } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { Benefit } from '../../data/types'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { OpsBenefitForm } from '../../features/admin/OpsBenefitForm'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'

const CAT_LABEL: Record<string, string> = {
  hotel: 'Alojamiento', spa: 'Bienestar', gastronomia: 'Gastronomía',
  entradas: 'Entradas', suscripcion: 'Membresía', otro: 'Otro',
}

export default function AdminBeneficios() {
  const benefits = useStore((s) => s.getAdminBenefits())

  const [form, setForm] = useState<{ open: boolean; benefit?: Benefit }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<Benefit | null>(null)

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Beneficios"
        eyebrow="Admin · Beneficios"
        lead="Descuentos para inscriptos. El código se muestra solo a quien se inscribió. Se publican al instante."
        actions={
          <Button size="sm" onClick={() => setForm({ open: true })}>
            <Plus size={14} strokeWidth={2} /> Crear beneficio
          </Button>
        }
      />

      {benefits.length === 0 ? (
        <EmptyState title="Todavía no hay beneficios" className="mt-10">
          Creá el primero con "Crear beneficio" — aparece en /beneficios al instante.
        </EmptyState>
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {benefits.map((b) => (
            <Card key={b.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="night">{CAT_LABEL[b.category] ?? b.category}</Badge>
                    {b.discountLabel && <Badge tone="solid">{b.discountLabel}</Badge>}
                    {!b.active && <Badge tone="danger">Oculto</Badge>}
                  </div>
                  <h3 className="type-serif mt-2 text-xl text-ink">{b.title}</h3>
                  <p className="mt-0.5 text-xs text-ink-soft">{b.partner}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setForm({ open: true, benefit: b })}
                    aria-label="Editar beneficio"
                    className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                  >
                    <Pencil size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(b)}
                    aria-label="Eliminar beneficio"
                    className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{b.description}</p>
              {b.code && (
                <p className="mt-3 font-mono text-xs text-ink-soft">
                  Código: <span className="text-ink">{b.code}</span>
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <OpsBenefitForm open={form.open} benefit={form.benefit} onClose={() => setForm({ open: false })} />

      <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="¿Eliminar este beneficio?">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se elimina <em className="text-accent">{deleteTarget?.title}</em> de Beneficios.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton
            className="w-full justify-center"
            onClick={() => {
              if (deleteTarget) store.deleteBenefit(deleteTarget.id)
              setDeleteTarget(null)
            }}
          >
            Sí, eliminar beneficio
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
