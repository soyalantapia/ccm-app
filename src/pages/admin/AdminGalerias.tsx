import { Badge, Card, Eyebrow, Img, SectionTitle } from '../../components/ui'
import { useStore } from '../../data/store'
import { OpsSponsorCard } from '../../features/admin/OpsSponsorCard'

export default function AdminGalerias() {
  const galleries = useStore((s) => s.getGalleries())
  const sponsors = useStore((s) => s.getSponsors())
  const analytics = useStore((s) => s.getAnalytics())

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
        <Eyebrow>Galerías publicadas</Eyebrow>
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
                    <span className="text-xs text-ink-soft">{gallery.date}</span>
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
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft/80">
          Upload masivo con thumbnails y «Notificar: fotos listas» llegan en Fase 1.
        </p>
      </section>

      {/* ─── Sponsors: Reporte de Impacto (PRD §10.9) ─── */}
      <section className="mt-14 border-t border-line pt-10">
        <SectionTitle
          eyebrow="Sponsors"
          title="Reporte de Impacto"
          lead="Cada impresión y clic queda registrado — el argumento de venta del deck, en números propios."
        />
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
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}
