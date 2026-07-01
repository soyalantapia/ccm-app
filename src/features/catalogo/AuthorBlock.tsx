import { ArrowUp, Check, MapPin } from 'lucide-react'
import { Eyebrow, Img } from '../../components/ui'
import type { CatalogProfile } from '../../data/types'

interface AuthorBlockProps {
  profile: CatalogProfile
  /** Scrollea de vuelta a las piezas del portfolio. */
  onViewPieces: () => void
}

/** Bloque autor en azul noche: retrato, bio, datos y "Participa en". */
export function AuthorBlock({ profile, onViewPieces }: AuthorBlockProps) {
  const instagram = profile.instagram
    ? profile.instagram.startsWith('@')
      ? profile.instagram
      : `@${profile.instagram}`
    : null

  return (
    <section id="autor" className="scroll-mt-20 bg-night py-16 text-night-ink md:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid gap-10 md:grid-cols-12 md:gap-14">
          <div className="md:col-span-5">
            <Img
              src={profile.photo}
              alt={profile.name}
              ratio="4/5"
              className="rounded-md"
            />
          </div>

          <div className="flex flex-col justify-center md:col-span-7">
            <Eyebrow>El autor</Eyebrow>
            <h2 className="type-display mt-4 text-[clamp(2rem,6vw,3.4rem)] text-balance text-night-ink">
              {profile.name}
            </h2>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {profile.verified && (
                <span className="eyebrow inline-flex items-center gap-1.5 rounded-sm bg-accent px-2.5 py-1 text-[10px] text-accent-ink">
                  <Check size={11} strokeWidth={3} /> Verificado CCM
                </span>
              )}
              <span className="eyebrow inline-flex items-center rounded-sm border border-night-soft px-2.5 py-1 text-[10px] text-night-ink/80">
                {profile.role}
              </span>
              <span className="eyebrow inline-flex items-center gap-1.5 text-[10px] text-night-ink/60">
                <MapPin size={12} strokeWidth={1.5} /> {profile.city}
              </span>
            </div>

            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-night-ink/70">
              {profile.bio}
            </p>

            <div className="mt-8 flex flex-wrap gap-x-12 gap-y-5 border-t border-night-soft pt-6">
              {instagram && (
                <div>
                  <span className="eyebrow block text-[10px] text-night-ink/50">Instagram</span>
                  <a
                    href={`https://instagram.com/${instagram.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="type-serif mt-1 block text-lg text-night-ink decoration-accent underline-offset-4 hover:underline"
                  >
                    {instagram}
                  </a>
                </div>
              )}
              <div>
                <span className="eyebrow block text-[10px] text-night-ink/50">Plataforma</span>
                <p className="type-serif mt-1 text-lg text-night-ink">{profile.platform}</p>
              </div>
            </div>

            {profile.participatesIn.length > 0 && (
              <div className="mt-8">
                <span className="eyebrow block text-[10px] text-night-ink/50">Participa en</span>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.participatesIn.map((p) => (
                    <span
                      key={p}
                      className="eyebrow rounded-sm border border-night-soft px-3 py-1.5 text-[10px] text-night-ink/85"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.portfolio.length > 0 && (
              <button
                onClick={onViewPieces}
                className="group eyebrow mt-10 inline-flex items-center gap-2 self-start text-[10px] text-accent transition-colors duration-200 hover:text-night-ink"
              >
                <ArrowUp size={14} className="transition-transform duration-200 group-hover:-translate-y-0.5" />
                Ver sus piezas
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
