import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Heart } from 'lucide-react'
import { ButtonLink, EmptyState, Eyebrow, Img } from '../components/ui'
import { useStore } from '../data/store'
import { PhotoLightbox } from '../features/fotos'

export default function FotosGaleria() {
  const { slug } = useParams<{ slug: string }>()
  const gallery = useStore((s) => (slug ? s.getGallery(slug) : undefined))
  const sponsor = useStore((s) => (gallery ? s.getSponsor(gallery.sponsorId) : undefined))
  const favorites = useStore((s) => s.getFavorites())
  const [index, setIndex] = useState<number | null>(null)

  if (!gallery) {
    return (
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <EmptyState
          title="Galería no encontrada"
          action={
            <ButtonLink to="/fotos" variant="outline" size="sm">
              Ver todas las galerías
            </ButtonLink>
          }
        >
          Puede que el link esté vencido o mal escrito.
        </EmptyState>
      </section>
    )
  }

  const favSet = new Set(favorites)

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <Link
        to="/fotos"
        className="group eyebrow inline-flex items-center gap-2 text-[10px] text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <ArrowLeft
          size={13}
          className="transition-transform duration-200 group-hover:-translate-x-0.5"
        />
        Fotos
      </Link>

      <header className="mt-8">
        {sponsor && <Eyebrow>Fotos por cortesía de {sponsor.name}</Eyebrow>}
        <h1 className="type-display mt-4 text-[clamp(2rem,6vw,3.4rem)] text-balance text-ink">
          {gallery.title}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          {gallery.eventLabel} · {gallery.date} · {gallery.photos.length} fotos
        </p>
      </header>

      <div className="mt-10 grid animate-rise grid-cols-2 gap-3 md:mt-14 md:grid-cols-4 md:gap-4">
        {gallery.photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => setIndex(i)}
            aria-label={`Ver foto ${i + 1} de ${gallery.photos.length}: ${photo.alt}`}
            className="group relative block overflow-hidden rounded-md text-left"
          >
            <Img
              src={photo.src}
              alt={photo.alt}
              ratio="3/4"
              priority={i < 8}
              imgClassName="transition duration-700 group-hover:scale-[1.04]"
            />
            {favSet.has(photo.id) && (
              <span className="absolute right-2 top-2 rounded-sm bg-night/55 p-1.5 text-accent">
                <Heart size={12} strokeWidth={1.5} fill="currentColor" />
              </span>
            )}
          </button>
        ))}
      </div>

      <PhotoLightbox
        gallery={gallery}
        index={index}
        onClose={() => setIndex(null)}
        onNavigate={setIndex}
      />
    </section>
  )
}
