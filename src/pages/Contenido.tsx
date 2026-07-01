import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AdBanner, EmptyState } from '../components/ui'
import { store, useStore } from '../data/store'
import { VideoCard } from '../features/contenido/VideoCard'
import { SectionLabel } from '../features/app/mockup'

/** Elukamo (mockup): header con wordmark ELUKAMO + tabs Entrevistas/Capacitaciones,
 *  entrevista destacada, lista de entrevistas y sponsor-banners intercalados. */
export default function Contenido() {
  const contents = useStore((s) => s.getContents())

  useEffect(() => {
    store.track('content_view', { section: 'contenido' })
  }, [])

  const sorted = useMemo(
    () => [...contents].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [contents],
  )
  const [featured, ...rest] = sorted

  return (
    <div className="mx-auto max-w-2xl pb-6">
      {/* Header ELUKAMO + tabs */}
      <div className="bg-ink px-5 pt-3.5">
        <div className="type-display text-[22px] leading-none text-night-ink">ELUKAMO</div>
        <div className="mt-3.5 flex border-b border-white/[0.08]">
          <span className="relative flex-1 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-accent">
            Entrevistas
            <span aria-hidden className="absolute inset-x-[15%] bottom-0 h-0.5 rounded-t bg-accent" />
          </span>
          <Link
            to="/membresia"
            className="flex-1 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#6b6b6b]"
          >
            Capacitaciones
          </Link>
        </div>
      </div>

      <div className="px-5">
        {!featured ? (
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
                <div className="flex flex-col gap-3">
                  {rest.map((item) => (
                    <VideoCard key={item.id} item={item} />
                  ))}
                </div>
                <AdBanner slot="S2" index={1} className="mt-6" />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
