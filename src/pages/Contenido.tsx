import { useEffect, useMemo, useState } from 'react'
import { EmptyState, SectionTitle } from '../components/ui'
import { store, useStore } from '../data/store'
import { VideoCard } from '../features/contenido/VideoCard'

export default function Contenido() {
  const contents = useStore((s) => s.getContents())
  const [platform, setPlatform] = useState<string | null>(null)

  useEffect(() => {
    store.track('content_view', { section: 'contenido' })
  }, [])

  /* Más reciente primero; el primero del listado se destaca a ancho completo. */
  const sorted = useMemo(
    () => [...contents].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [contents],
  )
  const platforms = useMemo(
    () => [...new Set(sorted.map((c) => c.platform).filter((p): p is string => Boolean(p)))],
    [sorted],
  )
  const filtered = platform ? sorted.filter((c) => c.platform === platform) : sorted
  const [featured, ...rest] = filtered

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <SectionTitle
        eyebrow="Archivo CCM"
        title="Contenido"
        lead="Aftermovies, backstage y masterclasses del ecosistema CCM. Todos los videos se reproducen acá mismo, embebidos: nunca te sacamos de la plataforma."
      />

      {platforms.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2 md:mt-10">
          {[null, ...platforms].map((p) => {
            const active = platform === p
            return (
              <button
                key={p ?? 'todas'}
                onClick={() => setPlatform(p)}
                aria-pressed={active}
                className={`eyebrow rounded-sm border px-3.5 py-2 text-[10px] transition-colors duration-200 ${
                  active
                    ? 'border-ink bg-ink text-bg'
                    : 'border-line text-ink-soft hover:border-ink/40 hover:text-ink'
                }`}
              >
                {p ?? 'Todas'}
              </button>
            )
          })}
        </div>
      )}

      {!featured ? (
        <EmptyState title="Todavía no hay videos acá" className="mt-10">
          Probá con otra plataforma: el archivo crece después de cada evento.
        </EmptyState>
      ) : (
        <>
          <div className="mt-10 md:mt-14 animate-rise">
            <VideoCard item={featured} featured />
          </div>

          {rest.length > 0 && (
            <div className="mt-14 grid gap-12 border-t border-line pt-12 md:mt-20 md:grid-cols-2 md:gap-x-8">
              {rest.map((item, i) => (
                <VideoCard key={item.id} item={item} className={i % 2 === 1 ? 'md:mt-12' : ''} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Nota editorial — D3: el contenido se consume sin salir de la app. */}
      <div className="mt-16 border-t border-line pt-10 md:mt-24 md:grid md:grid-cols-12 md:gap-x-8">
        <p className="type-serif text-2xl text-ink md:col-span-6 md:text-3xl">
          Todo el contenido vive <em className="italic text-accent">acá adentro</em>.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft md:col-span-5 md:col-start-8 md:mt-1">
          Nada de saltar entre plataformas: los videos del canal de CCM se reproducen embebidos, y
          las capacitaciones, notas y newsletters se van sumando a este mismo archivo, todo el año.
        </p>
      </div>
    </section>
  )
}
