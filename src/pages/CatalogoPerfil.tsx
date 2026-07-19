import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowRight, Maximize2, MessageCircle } from 'lucide-react'
import { ButtonLink, EmptyState, Eyebrow, Img, PagePending } from '../components/ui'
import { store, useStore } from '../data/store'
import { AuthorBlock, PortfolioViewer } from '../features/catalogo'
import { formatMoney } from '../features/tickets/format'

/** Link de contacto del participante: WhatsApp directo o Instagram. */
function contactHref(profile: { whatsapp?: string; instagram?: string }): string | null {
  if (profile.whatsapp) return /^https?:\/\//.test(profile.whatsapp) ? profile.whatsapp : `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}`
  if (profile.instagram) return `https://instagram.com/${profile.instagram.replace(/^@/, '')}`
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function CatalogoPerfil() {
  const { slug = '' } = useParams()
  const catalog = useStore((s) => s.getCatalog())
  const profile = useStore((s) => s.getCatalogProfile(slug))
  const hydrating = useStore((s) => s.isHydrating('catalog'))
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const profileId = profile?.id
  useEffect(() => {
    if (profileId) store.track('profile_view', { profileId })
  }, [profileId])

  useEffect(() => {
    setOpenIndex(null)
  }, [slug])

  if (!profile) {
    if (hydrating) return <PagePending />
    return (
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <EmptyState
          title="No encontramos este perfil"
          action={
            <ButtonLink to="/catalogo" variant="outline" size="sm">
              Volver al catálogo
            </ButtonLink>
          }
        >
          Puede que el enlace esté mal escrito o que la persona ya no esté en el catálogo.
        </EmptyState>
      </section>
    )
  }

  const pieces = profile.portfolio
  const hero = pieces[0]
  const rest = pieces.slice(1)
  const total = pieces.length

  const idx = catalog.findIndex((c) => c.id === profile.id)
  const many = catalog.length > 1
  const prev = many ? catalog[(idx - 1 + catalog.length) % catalog.length] : null
  const next = many ? catalog[(idx + 1) % catalog.length] : null

  const goToAuthor = () => {
    setOpenIndex(null)
    // espera a que el modal libere el scroll del body antes de scrollear
    window.setTimeout(() => scrollToId('autor'), 80)
  }

  return (
    <>
      {/* ─── El trabajo primero (vista doble producto ↔ autor) ─── */}
      <section id="portfolio" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-16 pt-8 md:pb-24 md:pt-10">
        <Link
          to="/catalogo"
          className="group eyebrow inline-flex items-center gap-2 text-[10px] text-ink-soft transition-colors duration-200 hover:text-ink"
        >
          <ArrowLeft size={14} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
          Volver al catálogo
        </Link>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5 md:mt-10">
          <div>
            <Eyebrow>
              {profile.platform} · {profile.role}
            </Eyebrow>
            <h1 className="type-display mt-4 text-[clamp(2.2rem,7vw,4rem)] text-balance text-ink">
              {profile.name}
            </h1>
          </div>
          <div className="flex items-center gap-5">
            {contactHref(profile) && (
              <a
                href={contactHref(profile)!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => store.track('profile_contact', { profileId: profile.id })}
                className="inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink transition hover:brightness-95 active:scale-[0.98]"
              >
                <MessageCircle size={14} /> Contactar
              </a>
            )}
            <button
              onClick={goToAuthor}
              className="group eyebrow inline-flex items-center gap-2 text-[10px] text-ink-soft transition-colors duration-200 hover:text-ink"
            >
              Conocé al autor
              <ArrowDown size={14} className="transition-transform duration-200 group-hover:translate-y-0.5" />
            </button>
          </div>
        </div>

        {hero ? (
          <>
            {/* Pieza 1 en grande, estilo tapa de lookbook */}
            <button
              onClick={() => setOpenIndex(0)}
              className="group mt-10 block w-full animate-rise text-left md:mt-14"
            >
              <div className="grid items-end gap-5 md:grid-cols-12 md:gap-8">
                <div className="relative overflow-hidden rounded-md md:col-span-8">
                  <Img
                    src={hero.image}
                    alt={hero.title}
                    ratio="4/5"
                    priority
                    imgClassName="transition duration-700 group-hover:scale-[1.04]"
                  />
                </div>
                <div className="md:col-span-4 md:pb-2">
                  <span className="eyebrow text-[10px] text-accent">
                    01 / {pad(total)}
                  </span>
                  <h2 className="type-serif mt-3 text-2xl text-ink decoration-accent underline-offset-4 group-hover:underline md:text-3xl">
                    {hero.title}
                  </h2>
                  {hero.caption && (
                    <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{hero.caption}</p>
                  )}
                  {hero.price != null && (
                    <p className="type-serif mt-3 text-xl text-accent">{formatMoney(hero.price)}</p>
                  )}
                  <span className="eyebrow mt-5 inline-flex items-center gap-2 text-[10px] text-ink-soft transition-colors duration-200 group-hover:text-ink">
                    <Maximize2 size={12} strokeWidth={1.5} />
                    Tocá para verla en grande
                  </span>
                </div>
              </div>
            </button>

            {/* El resto del portfolio */}
            {rest.length > 0 && (
              <div className="mt-10 grid grid-cols-2 gap-4 md:mt-14 md:grid-cols-3 md:gap-6">
                {rest.map((piece, i) => (
                  <button
                    key={piece.id}
                    onClick={() => setOpenIndex(i + 1)}
                    className={`group block text-left ${i % 3 === 1 ? 'md:mt-10' : ''}`}
                  >
                    <div className="overflow-hidden rounded-md">
                      <Img
                        src={piece.image}
                        alt={piece.title}
                        ratio={i % 2 === 0 ? '4/5' : '3/4'}
                        imgClassName="transition duration-700 group-hover:scale-[1.04]"
                      />
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-2">
                      <span className="eyebrow text-[10px] text-accent">{pad(i + 2)}</span>
                      <span className="type-serif text-base text-ink decoration-accent underline-offset-4 group-hover:underline">
                        {piece.title}
                      </span>
                    </div>
                    {piece.price != null && (
                      <p className="type-serif mt-1 text-sm text-accent">{formatMoney(piece.price)}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <EmptyState title="Todavía no subió piezas" className="mt-6">
            Su portfolio se está curando: volvé a pasar pronto.
          </EmptyState>
        )}
      </section>

      {/* ─── El autor, en la misma vista ─── */}
      <AuthorBlock profile={profile} onViewPieces={() => scrollToId('portfolio')} />

      {/* ─── Prev / next entre perfiles (orden del catálogo) ─── */}
      {prev && next && (
        <nav aria-label="Otros perfiles del catálogo" className="mx-auto max-w-6xl px-5">
          <div className="grid grid-cols-2 gap-6 py-10 md:py-12">
            <Link to={`/p/${prev.slug}`} className="group">
              <span className="eyebrow flex items-center gap-2 text-[10px] text-ink-soft">
                <ArrowLeft size={12} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
                Anterior
              </span>
              <span className="type-serif mt-2 block text-lg text-ink decoration-accent underline-offset-4 group-hover:underline md:text-xl">
                {prev.name}
              </span>
            </Link>
            <Link to={`/p/${next.slug}`} className="group text-right">
              <span className="eyebrow flex items-center justify-end gap-2 text-[10px] text-ink-soft">
                Siguiente
                <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
              <span className="type-serif mt-2 block text-lg text-ink decoration-accent underline-offset-4 group-hover:underline md:text-xl">
                {next.name}
              </span>
            </Link>
          </div>
        </nav>
      )}

      <PortfolioViewer
        pieces={pieces}
        index={openIndex}
        authorName={profile.name}
        onClose={() => setOpenIndex(null)}
        onNavigate={setOpenIndex}
        onViewAuthor={goToAuthor}
      />
    </>
  )
}
