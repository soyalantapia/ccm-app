import { useEffect, useMemo, useState } from 'react'
import { AdBanner, EmptyState } from '../components/ui'
import { store, useStore } from '../data/store'
import { VideoCard } from '../features/contenido/VideoCard'
import { EntrevistaRow, PaywallCard, SectionLabel, VideoThumb } from '../features/app/mockup'
import { formatMoney } from '../features/tickets/format'
import { SOCIO_PRICE } from '../features/membresia/plans'

/** Elukamo (mockup): header ELUKAMO + sponsor-elukamo box + tabs Entrevistas/
 *  Capacitaciones. Entrevistas: featured + rows + carrusel. Capacitaciones:
 *  paywall-card (o acceso si es socio) + carruseles de video. */
export default function Contenido() {
  const contents = useStore((s) => s.getContents())
  const sponsors = useStore((s) => s.getSponsors())
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
  const elukamoSponsor = sponsors[0]

  return (
    <div className="mx-auto max-w-2xl pb-6 lg:max-w-4xl">
      {/* Header ELUKAMO + sponsor-elukamo box + tabs */}
      <div className="bg-ink px-5 pb-2.5 pt-3.5">
        <div className="type-display text-[22px] leading-none text-night-ink">ELUKAMO</div>
        {elukamoSponsor && (
          <div className="mt-3.5 flex items-center justify-between gap-3 rounded-[10px] border border-dashed border-accent/50 bg-white/[0.07] px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-accent">Sponsor Elukamo</div>
              <div className="type-serif mt-0.5 truncate text-[13px] text-night-ink">{elukamoSponsor.name}</div>
            </div>
            <span className="shrink-0 rounded-[4px] bg-accent px-2 py-1 text-[9px] font-bold uppercase text-accent-ink">
              Sponsor
            </span>
          </div>
        )}
        <div className="mt-2.5 flex border-b border-white/[0.08]">
          {(['entrevistas', 'capacitaciones'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative flex-1 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                tab === t ? 'text-accent' : 'text-[#6b6b6b]'
              }`}
            >
              {t === 'entrevistas' ? 'Entrevistas' : 'Capacitaciones'}
              {tab === t && <span aria-hidden className="absolute inset-x-[15%] bottom-0 h-0.5 rounded-t bg-accent" />}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5">
        {tab === 'entrevistas' ? (
          !featured ? (
            <EmptyState title="Todavía no hay videos acá" className="mt-10">
              El archivo crece después de cada evento.
            </EmptyState>
          ) : (
            <>
              <div className="mt-4">
                <VideoCard item={featured} featured />
              </div>

              <AdBanner slot="S2" className="mt-4" />

              {rest.length > 0 && (
                <>
                  <SectionLabel>Entrevistas</SectionLabel>
                  <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3">
                    {rest.map((item) => (
                      <EntrevistaRow key={item.id} c={item} />
                    ))}
                  </div>
                </>
              )}

              <SectionLabel>Noticias</SectionLabel>
              <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
                {sorted.slice(0, 6).map((c) => (
                  <VideoThumb key={c.id} c={c} />
                ))}
              </div>

              <AdBanner slot="S2" index={1} className="mt-6" />
            </>
          )
        ) : (
          <>
            {/* Capacitaciones: gate premium (o acceso si es socio) */}
            <AdBanner slot="S2" className="mt-4" />
            {isSocio ? (
              <div className="mt-1 rounded-[14px] border border-accent/30 bg-gradient-to-br from-ink to-brown-warm p-4 text-center">
                <div className="type-serif text-[15px] text-night-ink">Ya sos Socio CCM VIP</div>
                <div className="mt-1 text-[10px] text-text-2">Tenés acceso completo a las capacitaciones de Elukamo.</div>
              </div>
            ) : (
              <div className="mt-1">
                <PaywallCard priceLabel={formatMoney(SOCIO_PRICE)} />
              </div>
            )}

            <SectionLabel>Entrevistas Elukamo</SectionLabel>
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
              {sorted.slice(0, 6).map((c) => (
                <VideoThumb key={c.id} c={c} />
              ))}
            </div>

            <SectionLabel>Noticias CCM</SectionLabel>
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
              {sorted.slice(0, 6).map((c) => (
                <VideoThumb key={`n-${c.id}`} c={c} />
              ))}
            </div>

            <AdBanner slot="S2" index={1} className="mt-6" />
          </>
        )}
      </div>
    </div>
  )
}
