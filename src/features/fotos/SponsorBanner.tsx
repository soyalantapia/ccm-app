import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { store } from '../../data/store'
import type { Sponsor } from '../../data/types'

interface SponsorBannerProps {
  /** Sponsor de LA galería (S3 fijo por galería — no rota como AdBanner). */
  sponsor: Sponsor
  galleryId: string
  photoId: string
  className?: string
}

/**
 * Banner S3 pre-descarga (PRD §11, §12): franja del sponsor de la galería
 * bajo la foto abierta. Cada foto vista registra una impresión asociada a
 * foto + galería + sponsor; el clic trackea y lleva a /sponsors (nunca afuera).
 */
export function SponsorBanner({ sponsor, galleryId, photoId, className }: SponsorBannerProps) {
  const creative = sponsor.creatives.find((c) => c.slot === 'S3')

  useEffect(() => {
    store.track('ad_impression', { slot: 'S3', sponsorId: sponsor.id, galleryId, photoId })
  }, [sponsor.id, galleryId, photoId])

  const onClick = () =>
    store.track('ad_click', { slot: 'S3', sponsorId: sponsor.id, galleryId, photoId })

  return (
    <div className={`border-t-2 border-accent bg-night px-5 py-4 ${className ?? ''}`}>
      <Link to="/sponsors" onClick={onClick} className="group flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow text-[9px] text-night-ink/50">Presentado por</div>
          <div className="type-serif mt-0.5 text-lg text-night-ink">{sponsor.name}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-night-ink/70">
            {creative?.headline ?? sponsor.tagline}
          </div>
        </div>
        <span className="eyebrow flex shrink-0 items-center gap-1 text-[10px] text-accent transition-transform duration-200 group-hover:translate-x-0.5">
          {creative?.cta ?? 'Conocer más'} <ArrowUpRight size={12} />
        </span>
      </Link>
    </div>
  )
}
