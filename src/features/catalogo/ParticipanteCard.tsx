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
        <Img
          src={profile.photo}
          alt={profile.name}
          ratio="16/10"
          imgClassName={profile.photo.endsWith('.svg') ? 'object-contain' : undefined}
        />
        {profile.verified && (
          <span
            title="Verificado CCM"
            aria-label="Verificado CCM"
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-[4px] bg-accent text-accent-ink shadow-[0_1px_6px_rgba(0,0,0,0.25)] lg:h-7 lg:w-7"
          >
            <Check size={13} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="p-3.5 lg:p-5">
        <div className="eyebrow text-[9px] text-accent lg:text-[10px]">
          {profile.role} · {profile.platform}
        </div>
        <h3 className="type-serif mt-1 text-[16px] leading-tight text-ink lg:text-[21px]">{profile.name}</h3>
        {profile.city && <div className="mt-1 text-[10px] font-semibold text-accent lg:text-[11px]">{profile.city}</div>}
        <p className="mt-2 line-clamp-3 text-[10px] leading-[1.5] text-text-3 lg:text-[12px] lg:leading-[1.6]">{profile.bio}</p>
        {profile.quote && (
          <p className="mt-2 text-[11px] italic leading-snug text-accent-strong lg:text-[13px]">
            "{profile.quote}"
          </p>
        )}
        <Link
          to={`/p/${profile.slug}`}
          // accent-strong y no accent: es texto de 10px sobre el fondo, y el acento puro da
          // 3,25:1 (AA pide 4,5). Mismo criterio que el botón primario.
          className="mt-3 block rounded-[8px] bg-accent-strong py-2 text-center text-[10px] font-bold uppercase tracking-[0.04em] text-accent-ink transition-transform active:scale-[0.98] lg:mt-4 lg:py-2.5 lg:text-[11px]"
        >
          Ver Catálogo →
        </Link>
      </div>
    </div>
  )
}
