import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Img } from '../../components/ui'
import type { CatalogProfile } from '../../data/types'

/** Ratios alternados para el ritmo masonry del lookbook (retrato siempre). */
const RATIOS = ['4/5', '3/4', '4/5', '5/6', '3/4', '4/5', '5/6', '4/5'] as const

interface CatalogCardProps {
  profile: CatalogProfile
  index: number
}

/** Card editorial del lookbook: foto retrato + nombre serif + rol · ciudad. */
export function CatalogCard({ profile, index }: CatalogCardProps) {
  const ratio = RATIOS[index % RATIOS.length]
  return (
    <Link to={`/p/${profile.slug}`} className="group mb-4 block break-inside-avoid md:mb-6">
      <div className="relative overflow-hidden rounded-md">
        <Img
          src={profile.photo}
          alt={profile.name}
          ratio={ratio}
          imgClassName="transition duration-700 group-hover:scale-[1.04]"
        />
        {profile.verified && (
          <span
            title="Verificado CCM"
            aria-label="Verificado CCM"
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-sm bg-accent text-accent-ink shadow-[0_1px_6px_rgba(0,0,0,0.25)]"
          >
            <Check size={13} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="mt-3">
        <h3 className="type-serif text-lg leading-snug text-ink decoration-accent underline-offset-4 group-hover:underline">
          {profile.name}
        </h3>
        <p className="eyebrow mt-1.5 text-[10px] text-ink-soft">
          {profile.role} · {profile.city}
        </p>
      </div>
    </Link>
  )
}
