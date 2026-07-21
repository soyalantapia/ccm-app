import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Eyebrow, Img, SectionTitle, Sheet } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { Gallery, Sponsor } from '../../data/types'
import { OpsSponsorCard } from '../../features/admin/OpsSponsorCard'
import { OpsGalleryForm } from '../../features/admin/OpsGalleryForm'
import { OpsSponsorForm } from '../../features/admin/OpsSponsorForm'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'
import { AVISO_BORRADO } from '../../features/admin/copyDestructivo'

export default function AdminGalerias() {
  const galleries = useStore((s) => s.getGalleries())
  const sponsors = useStore((s) => s.getSponsors())
  const analytics = useStore((s) => s.getAnalytics())

  const [galleryForm, setGalleryForm] = useState<{ open: boolean; gallery?: Gallery }>({ open: false })
  const [sponsorForm, setSponsorForm] = useState<{ open: boolean; sponsor?: Sponsor }>({ open: false })
  const [delGallery, setDelGallery] = useState<Gallery | null>(null)
  const [delSponsor, setDelSponsor] = useState<Sponsor | null>(null)

  const countEvents = (event: string, match: (payload: Record<string, unknown>) => boolean) =>
    analytics.filter((e) => e.event === event && e.payload !== undefined && match(e.payload)).length

  return (
    <div className="px-5 py-8 md:px-10">
      <SectionTitle
        eyebrow="Admin · Galerías y sponsors"
        title="Galerías y sponsors"
        lead="Cada galería tiene su sponsor del slot S3 — y cada vista, descarga e impresión queda medida."
      />

      {/* ─── Galerías (PRD §10.8) ─── */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>Galerías publicadas</Eyebrow>
          <Button size="sm" onClick={() => setGalleryForm({ open: true })}>
            <Plus size={14} strokeWidth={2} /> Crear galería
          </Button>
        </div>
        <div className="mt-5 space-y-5">
          {galleries.map((gallery) => {
            const sponsor = sponsors.find((s) => s.id === gallery.sponsorId)
            const views = countEvents('photo_view', (p) => p.galleryId === gallery.id)
            const downloads = countEvents('photo_download', (p) => p.galleryId === gallery.id)
            const s3Impressions = countEvents(
              'ad_impression',
              (p) => p.slot === 'S3' && p.sponsorId === gallery.sponsorId,
            )
            return (
              <Card key={gallery.id} className="overflow-hidden md:flex">
                <Img
                  src={gallery.cover}
                  alt={`Portada de ${gallery.title}`}
                  ratio="16/10"
                  className="md:w-72 md:shrink-0"
                />
                <div className="flex min-w-0 flex-1 flex-col p-5 md:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="type-serif text-2xl text-ink">{gallery.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-soft">{gallery.date}</span>
                      <button
                        onClick={() => setGalleryForm({ open: true, gallery })}
                        aria-label="Editar galería"
                        className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                      >
                        <Pencil size={14} strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => setDelGallery(gallery)}
                        aria-label="Eliminar galería"
                        className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {gallery.eventLabel} · {gallery.photos.length} fotos
                  </p>
                  {sponsor && (
                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <Badge tone="night">Sponsor S3</Badge>
                      <span className="type-serif text-base text-ink">{sponsor.name}</span>
                    </div>
                  )}
                  <dl className="mt-auto grid grid-cols-3 gap-4 border-t border-line pt-4 md:max-w-md">
                    <div>
                      <dd className="type-serif text-2xl text-ink">{views}</dd>
                      <dt className="eyebrow mt-1 text-[9px] text-ink-soft">Vistas de foto</dt>
                    </div>
                    <div>
                      <dd className="type-serif text-2xl text-ink">{downloads}</dd>
                      <dt className="eyebrow mt-1 text-[9px] text-ink-soft">Descargas</dt>
                    </div>
                    <div>
                      <dd className="type-serif text-2xl text-accent">{s3Impressions}</dd>
                      <dt className="eyebrow mt-1 text-[9px] text-ink-soft">Impresiones S3</dt>
                    </div>
                  </dl>
                </div>
              </Card>
            )
          })}
          {galleries.length === 0 && (
            <p className="py-4 text-sm text-ink-soft">
              Todavía no hay galerías. Creá una con "Crear galería" — aparece en Fotos al instante.
            </p>
          )}
        </div>
      </section>

      {/* ─── Sponsors: Reporte de Impacto (PRD §10.9) ─── */}
      <section className="mt-14 border-t border-line pt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle
            eyebrow="Sponsors"
            title="Reporte de Impacto"
            lead="Cada impresión y clic queda registrado — el argumento de venta del deck, en números propios."
          />
          <Button size="sm" onClick={() => setSponsorForm({ open: true })}>
            <Plus size={14} strokeWidth={2} /> Crear sponsor
          </Button>
        </div>
        <div className="mt-8 grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sponsors.map((sponsor) => {
            const impressions = countEvents('ad_impression', (p) => p.sponsorId === sponsor.id)
            const clicks = countEvents('ad_click', (p) => p.sponsorId === sponsor.id)
            return (
              <OpsSponsorCard
                key={sponsor.id}
                sponsor={sponsor}
                impressions={impressions}
                clicks={clicks}
                onEdit={() => setSponsorForm({ open: true, sponsor })}
                onDelete={() => setDelSponsor(sponsor)}
              />
            )
          })}
        </div>
      </section>

      {/* ─── Formularios + confirmaciones ─── */}
      <OpsGalleryForm
        open={galleryForm.open}
        gallery={galleryForm.gallery}
        onClose={() => setGalleryForm({ open: false })}
      />
      <OpsSponsorForm
        open={sponsorForm.open}
        sponsor={sponsorForm.sponsor}
        onClose={() => setSponsorForm({ open: false })}
      />

      <Sheet open={!!delGallery} onClose={() => setDelGallery(null)} title="¿Eliminar esta galería?">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se elimina <em className="text-accent">{delGallery?.title}</em> de Fotos. {AVISO_BORRADO}
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton
            className="w-full justify-center"
            onClick={() => {
              if (delGallery) store.deleteGallery(delGallery.id)
              setDelGallery(null)
            }}
          >
            Sí, eliminar galería
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setDelGallery(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!delSponsor} onClose={() => setDelSponsor(null)} title="¿Eliminar este sponsor?">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se elimina <em className="text-accent">{delSponsor?.name}</em> y sus creatividades de los
          slots publicitarios. Las galerías que lo tenían como sponsor S3 quedan sin sponsor.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton
            className="w-full justify-center"
            onClick={() => {
              if (delSponsor) store.deleteSponsor(delSponsor.id)
              setDelSponsor(null)
            }}
          >
            Sí, eliminar sponsor
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setDelSponsor(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
