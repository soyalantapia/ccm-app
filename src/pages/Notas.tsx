import { Link } from 'react-router-dom'
import { ArrowUpRight, PlayCircle } from 'lucide-react'
import { Badge, Card, EmptyState, Img, SectionTitle } from '../components/ui'
import { useNotas } from '../data/queries'
import type { Nota } from '../data/types'

function fmtDate(iso: string) {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
  } catch {
    return iso
  }
}

function NotaCard({ n }: { n: Nota }) {
  return (
    <Link to={`/novedades/${n.slug}`} className="group block">
      <Card className="overflow-hidden">
        <div className="relative">
          {n.cover ? (
            <Img src={n.cover} alt={n.title} ratio="16/9" imgClassName="transition duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="aspect-video w-full bg-night" />
          )}
          {n.youtubeId && (
            <span className="absolute inset-0 flex items-center justify-center text-night-ink">
              <PlayCircle size={40} strokeWidth={1.5} className="drop-shadow" />
            </span>
          )}
        </div>
        <div className="flex flex-col p-5">
          <div className="flex items-center gap-2">
            {n.category && <Badge tone="solid">{n.category}</Badge>}
            <span className="text-[11px] uppercase tracking-wide text-ink-soft">{fmtDate(n.publishedAt)}</span>
          </div>
          <h3 className="type-serif mt-2 text-xl text-ink decoration-accent underline-offset-4 group-hover:underline">
            {n.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{n.excerpt}</p>
          <span className="eyebrow mt-3 inline-flex items-center gap-1 text-[10px] text-accent">
            Leer nota <ArrowUpRight size={12} />
          </span>
        </div>
      </Card>
    </Link>
  )
}

/** /novedades — notas editoriales (las publica prensa). */
export default function Notas() {
  const notas = useNotas()
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:py-16">
      <SectionTitle
        eyebrow="Novedades"
        title={
          <>
            Lo último de <em className="text-accent">CCM</em>
          </>
        }
        lead="Notas, entrevistas y novedades del ecosistema, semana a semana."
      />
      {notas.length === 0 ? (
        <EmptyState title="Todavía no hay novedades">Volvé pronto: estamos preparando las primeras notas.</EmptyState>
      ) : (
        <div className="mt-10 grid animate-rise gap-6 md:grid-cols-2 lg:grid-cols-3">
          {notas.map((n) => (
            <NotaCard key={n.id} n={n} />
          ))}
        </div>
      )}
    </div>
  )
}
