import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AdBanner, Badge, ButtonLink, EmptyState, Eyebrow, Img, PagePending, RichText, YouTubeEmbed } from '../components/ui'
import { store, useStore } from '../data/store'

function fmtDate(iso: string) {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

/** /novedades/:slug — una nota editorial completa. */
export default function NotaDetalle() {
  const { slug = '' } = useParams()
  const nota = useStore((s) => s.getNota(slug))
  const hydrating = useStore((s) => s.isHydrating('notas'))

  const notaId = nota?.id
  useEffect(() => {
    if (notaId) store.track('nota_view', { notaId })
  }, [notaId])

  if (!nota) {
    if (hydrating) return <PagePending />
    return (
      <section className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <EmptyState
          title="No encontramos esta nota"
          action={
            <ButtonLink to="/novedades" variant="outline" size="sm">
              Ver novedades
            </ButtonLink>
          }
        >
          Puede que el enlace esté mal escrito o que la nota ya no esté publicada.
        </EmptyState>
      </section>
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-5 py-10 md:py-16 lg:max-w-4xl">
      <Link
        to="/novedades"
        className="group eyebrow inline-flex items-center gap-2 text-[10px] text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
        Volver a novedades
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {nota.category && <Badge tone="solid">{nota.category}</Badge>}
        <Eyebrow>{fmtDate(nota.publishedAt)}</Eyebrow>
        {nota.author && <span className="text-xs text-ink-soft">por {nota.author}</span>}
      </div>

      <h1 className="type-display mt-4 text-[clamp(2rem,6vw,3.2rem)] text-balance text-ink">{nota.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">{nota.excerpt}</p>

      {nota.youtubeId ? (
        <div className="mt-8">
          <YouTubeEmbed youtubeId={nota.youtubeId} title={nota.title} trackPayload={{ notaId: nota.id }} />
        </div>
      ) : (
        nota.cover && (
          <div className="mt-8 overflow-hidden rounded-md">
            <Img src={nota.cover} alt={nota.title} ratio="16/9" priority />
          </div>
        )
      )}

      <RichText body={nota.body} className="mt-8" />

      {/* Cierre editorial — solo desktop: la nota terminaba en seco contra el footer */}
      <div className="mt-12 hidden border-t border-ink/10 pt-8 lg:flex lg:items-center lg:justify-between">
        <ButtonLink to="/novedades" variant="outline" size="sm">
          Más novedades
        </ButtonLink>
        <ButtonLink to="/entradas" size="sm">
          Conseguí tu entrada
        </ButtonLink>
      </div>
      <AdBanner slot="S2" className="mt-12 hidden lg:block" />
    </article>
  )
}
