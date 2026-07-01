import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Img } from '../../components/ui'
import type { CatalogProfile } from '../../data/types'

/**
 * participante-card de los mockups: foto arriba, plataforma (rol · plataforma) en
 * eyebrow dorado, nombre Playfair, especialidad dorada, bio y CTA "Ver Catálogo →".
 */
export function ParticipanteCard({ profile }: { profile: CatalogProfile }) {
  return (
    <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <div className="relative">
        <Img src={profile.photo} alt={profile.name} ratio="16/10" />
        {profile.verified && (
          <span
            title="Verificado CCM"
            aria-label="Verificado CCM"
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-[4px] bg-accent text-accent-ink shadow-[0_1px_6px_rgba(0,0,0,0.25)]"
          >
            <Check size={13} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="p-3.5">
        <div className="eyebrow text-[9px] text-accent">
          {profile.role} · {profile.platform}
        </div>
        <h3 className="type-serif mt-1 text-[16px] leading-tight text-ink">{profile.name}</h3>
        <div className="mt-1 text-[10px] font-semibold text-accent">{profile.city}</div>
        <p className="mt-2 line-clamp-3 text-[10px] leading-[1.5] text-text-3">{profile.bio}</p>
        <Link
          to={`/p/${profile.slug}`}
          className="mt-3 block rounded-[8px] bg-accent py-2 text-center text-[10px] font-bold uppercase tracking-[0.04em] text-accent-ink transition-transform active:scale-[0.98]"
        >
          Ver Catálogo →
        </Link>
      </div>
    </div>
  )
}
