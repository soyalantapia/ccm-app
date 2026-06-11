import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { SectionTitle, YouTubeEmbed } from '../../components/ui'
import { useStore } from '../../data/store'

/** Contenido reciente (PRD §6.1.9) — últimos videos, siempre embebidos (D3). */
export function RecentContent() {
  const videos = useStore((s) =>
    [...s.getContents()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3),
  )

  if (videos.length === 0) return null

  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionTitle
            eyebrow="Contenido reciente"
            title={
              <>
                CCM se <em className="italic text-accent">mira</em>
              </>
            }
            lead="Aftermovies, desfiles y backstage de cada edición — sin salir de la plataforma."
          />
          <Link
            to="/contenido"
            className="eyebrow group flex items-center gap-1.5 text-[10px] text-ink-soft transition-colors hover:text-ink"
          >
            Ver todo el contenido
            <ArrowUpRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="mt-10 grid gap-6 md:mt-14 md:grid-cols-2">
          {videos.map((v, i) => (
            <div key={v.id} className={i === 0 && videos.length > 1 ? 'md:col-span-2' : ''}>
              <YouTubeEmbed
                youtubeId={v.youtubeId}
                title={v.title}
                trackPayload={{ contentId: v.id, source: 'landing' }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
