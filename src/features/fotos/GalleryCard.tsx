import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Img } from '../../components/ui'
import type { Gallery } from '../../data/types'

interface GalleryCardProps {
  gallery: Gallery
  /** Primera galería = protagonista: ocupa todo el ancho en desktop. */
  featured?: boolean
}

/** Card editorial de galería: cover protagonista + overlay azul noche. */
export function GalleryCard({ gallery, featured }: GalleryCardProps) {
  return (
    <Link
      to={`/fotos/${gallery.slug}`}
      className={`group relative block overflow-hidden rounded-md ${featured ? 'md:col-span-2' : ''}`}
    >
      <Img
        src={gallery.cover}
        alt={`Portada de la galería ${gallery.title}`}
        ratio={featured ? '16/10' : '4/5'}
        imgClassName="transition duration-700 group-hover:scale-[1.04]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-night/80 via-night/20 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-8">
        <div className="eyebrow text-[10px] text-accent">
          {gallery.eventLabel} · {gallery.date}
        </div>
        <h3 className="type-serif mt-2 text-2xl text-night-ink md:text-3xl">{gallery.title}</h3>
        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="text-xs text-night-ink/70">{gallery.photos.length} fotos</span>
          <span className="eyebrow flex items-center gap-1 text-[10px] text-night-ink transition-transform duration-200 group-hover:translate-x-0.5">
            Ver galería <ArrowUpRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  )
}
