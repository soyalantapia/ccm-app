import { useMemo, useState } from 'react'
import { MousePointerClick, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Sheet } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { Banner } from '../../data/types'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { OpsBannerForm } from '../../features/admin/OpsBannerForm'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'

const SLOT_LABEL: Record<string, string> = {
  home: 'Home / App', eventos: 'Eventos', catalogo: 'Catálogo', fotos: 'Fotos', contenido: 'Contenido',
}

export default function AdminBanners() {
  const banners = useStore((s) => s.getBanners())
  const analytics = useStore((s) => s.getAnalytics())

  // Clicks / impresiones por banner (medidos vía el bus de analytics).
  const metrics = useMemo(() => {
    const m: Record<string, { clicks: number; impressions: number }> = {}
    for (const e of analytics) {
      const id = (e.payload?.bannerId as string) || ''
      if (!id) continue
      if (e.event === 'banner_click') (m[id] ??= { clicks: 0, impressions: 0 }).clicks++
      else if (e.event === 'banner_impression') (m[id] ??= { clicks: 0, impressions: 0 }).impressions++
    }
    return m
  }, [analytics])

  const [form, setForm] = useState<{ open: boolean; banner?: Banner }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null)

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Banners"
        eyebrow="Admin · Publicidad"
        lead="Subí el banner, elegí a dónde va y si es fijo o rota. Se publica al instante y medimos los clicks."
        actions={
          <Button size="sm" onClick={() => setForm({ open: true })}>
            <Plus size={14} strokeWidth={2} /> Crear banner
          </Button>
        }
      />

      {banners.length === 0 ? (
        <EmptyState title="Todavía no hay banners" className="mt-10">
          Creá el primero con "Crear banner" — aparece en la app al instante.
        </EmptyState>
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {banners.map((b) => {
            const mt = metrics[b.id] ?? { clicks: 0, impressions: 0 }
            return (
              <Card key={b.id} className="overflow-hidden">
                <img src={b.image} alt={b.alt || b.brand} className="aspect-[16/5] w-full object-cover" />
                <div className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="night">{SLOT_LABEL[b.slot] ?? b.slot}</Badge>
                        {b.fixed ? <Badge tone="solid">Fijo</Badge> : <Badge>Rota</Badge>}
                        {!b.active && <Badge tone="danger">Oculto</Badge>}
                      </div>
                      <h3 className="type-serif mt-2 text-xl text-ink">{b.brand}</h3>
                      <p className="mt-0.5 truncate text-xs text-ink-soft">→ {b.destinationUrl}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setForm({ open: true, banner: b })} aria-label="Editar banner"
                        className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink">
                        <Pencil size={14} strokeWidth={1.75} />
                      </button>
                      <button onClick={() => setDeleteTarget(b)} aria-label="Eliminar banner"
                        className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger">
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-ink-soft">
                    <span className="inline-flex items-center gap-1.5"><MousePointerClick size={13} className="text-accent" /> {mt.clicks} clicks</span>
                    <span className="inline-flex items-center gap-1.5"><Eye size={13} /> {mt.impressions} vistas</span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <OpsBannerForm open={form.open} banner={form.banner} onClose={() => setForm({ open: false })} />

      <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="¿Eliminar este banner?">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se elimina el banner de <em className="text-accent">{deleteTarget?.brand}</em>.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton className="w-full justify-center"
            onClick={() => { if (deleteTarget) store.deleteBanner(deleteTarget.id); setDeleteTarget(null) }}>
            Sí, eliminar banner
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
        </div>
      </Sheet>
    </div>
  )
}
