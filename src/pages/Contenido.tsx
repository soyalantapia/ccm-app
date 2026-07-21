import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/ui'
import { SponsorCarousel } from '../features/ads/SponsorCarousel'
import { store, useStore } from '../data/store'
import { VideoCard } from '../features/contenido/VideoCard'
import { EntrevistaRow, PaywallCard, SectionLabel, VideoThumb } from '../features/app/mockup'
import { formatMoney } from '../features/tickets/format'
import { SOCIO_PRICE } from '../features/membresia/plans'

/** Elukamo: header ELUKAMO + tabs Entrevistas/Capacitaciones. Entrevistas: featured + rows + carrusel. Capacitaciones:
 *  paywall-card (o acceso si es socio) + carruseles de video. */
export default function Contenido() {
  const contents = useStore((s) => s.getContents())
  const isSocio = useStore((s) => s.isSocio())
  const [tab, setTab] = useState<'entrevistas' | 'capacitaciones'>('entrevistas')

  useEffect(() => {
    store.track('content_view', { section: 'contenido' })
  }, [])

  const sorted = useMemo(
    () => [...contents].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [contents],
  )
  const [featured, ...rest] = sorted

  return (
    <div className="mx-auto max-w-2xl pb-6 lg:max-w-6xl lg:pb-16">
      {/* Header ELUKAMO + tabs */}
      <div className="bg-ink px-5 pb-2.5 pt-3.5 lg:rounded-b-[20px] lg:px-10 lg:pb-4 lg:pt-8">
        <div className="type-display text-[22px] leading-none text-night-ink lg:text-[46px] lg:tracking-[0.02em]">ELUKAMO</div>
        <div className="mt-2.5 flex border-b border-white/[0.08] lg:mt-6 lg:gap-2">
          {(['entrevistas', 'capacitaciones'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative flex-1 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] transition-colors lg:flex-none lg:px-7 lg:py-4 lg:text-[14px] ${
                tab === t ? 'text-accent' : 'text-night-ink/55'
              }`}
            >
              {t === 'entrevistas' ? 'Entrevistas' : 'Capacitaciones'}
              {tab === t && <span aria-hidden className="absolute inset-x-[15%] bottom-0 h-0.5 rounded-t bg-accent lg:inset-x-0 lg:h-[3px]" />}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 lg:px-10">
        <SponsorCarousel className="mt-4 lg:mt-8" />
        {tab === 'entrevistas' ? (
          !featured ? (
            <EmptyState title="Todavía no hay videos acá" className="mt-10">
              El archivo crece después de cada evento.
            </EmptyState>
          ) : (
            <>
              <div className="mt-4 lg:mt-8">
                <VideoCard item={featured} featured />
              </div>

              {rest.length > 0 && (
                <>
                  <SectionLabel>Entrevistas</SectionLabel>
                  <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-5">
                    {rest.map((item) => (
                      <EntrevistaRow key={item.id} c={item} />
                    ))}
                  </div>
                </>
              )}

              {/* Acá había un tercer carrusel titulado «Noticias» que volvía a renderizar
                  `sorted.slice(0, 6)` — los mismos videos que ya están arriba como destacado y
                  como filas. Con los 3 videos del catálogo, el visitante los veía tres veces en
                  la misma pantalla. Se va: el listado de arriba ya los muestra todos. */}
            </>
          )
        ) : (
          <>
            {/* Capacitaciones: gate premium (o acceso si es socio) */}
            {isSocio ? (
              <div className="mt-1 rounded-[14px] border border-accent/30 bg-gradient-to-br from-ink to-brown-warm p-4 text-center lg:mx-auto lg:max-w-2xl lg:rounded-[18px] lg:p-8">
                <div className="type-serif text-[15px] text-night-ink lg:text-[22px]">Ya sos Socio CCM VIP</div>
                <div className="mt-1 text-[10px] text-text-2 lg:mt-2 lg:text-[13px]">Tenés acceso completo a las capacitaciones de Elukamo.</div>
              </div>
            ) : (
              <div className="mt-1">
                <PaywallCard priceLabel={formatMoney(SOCIO_PRICE)} />
              </div>
            )}

            {/* UN listado, no dos. Acá había dos carruseles titulados «Entrevistas Elukamo» y
                «Noticias CCM» que renderizaban exactamente el mismo `sorted.slice(0, 6)`:
                el visitante veía los mismos videos repetidos bajo nombres distintos, como si
                fueran secciones separadas. No se puede filtrar por sección porque ContentItem
                no tiene categoría — el modelo no la modela (ver el reporte del cazabug). Hasta
                que exista ese campo, mostrar una sola lista es lo honesto. */}
            {sorted.length > 0 ? (
              <>
                <SectionLabel>Videos de Elukamo</SectionLabel>
                <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0">
                  {sorted.map((c) => (
                    <VideoThumb key={c.id} c={c} />
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-4">
                <EmptyState title="Todavía no hay capacitaciones">
                  Cuando el equipo publique videos, aparecen acá.
                </EmptyState>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
