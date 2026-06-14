import type { Sponsor } from '../../data/types'

/**
 * Lockup tipográfico honesto para un sponsor FICTICIO (no hay logos reales —
 * son placeholders editables, ver DECISIONS.md). Construye un monograma con las
 * iniciales del nombre + el nombre en tipografía display, con tratamiento por
 * nivel. Dos variantes: `chip` (compacto, para listas/feed) y `card` (muro).
 * Tokens only, sin imágenes externas.
 */

type Variant = 'chip' | 'card'
type Tone = 'light' | 'night'

/** Iniciales del nombre: 1-2 letras (primera de cada palabra significativa). */
function monogram(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '·'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

interface SponsorLogoProps {
  sponsor: Sponsor
  variant?: Variant
  /** Paleta del contexto: `night` para el muro azul noche. */
  tone?: Tone
  className?: string
}

const isPrincipal = (level: Sponsor['level']) => level === 'Principal'

export function SponsorLogo({
  sponsor,
  variant = 'chip',
  tone = 'light',
  className = '',
}: SponsorLogoProps) {
  const mono = monogram(sponsor.name)
  const principal = isPrincipal(sponsor.level)
  const onNight = tone === 'night'

  // Color del nombre según contexto.
  const nameColor = onNight ? 'text-night-ink' : 'text-ink'
  const metaColor = onNight ? 'text-night-ink/55' : 'text-ink-soft'

  if (variant === 'chip') {
    // Recuadro + nombre en línea, para listados densos.
    const boxBase =
      'grid place-items-center rounded-sm type-display leading-none transition'
    const box = principal
      ? `${boxBase} bg-accent text-accent-ink`
      : onNight
        ? `${boxBase} border border-night-soft text-night-ink`
        : `${boxBase} border border-line text-ink`
    return (
      <span
        className={`inline-flex items-center gap-3 ${className}`}
        aria-label={`Sponsor ${sponsor.level}: ${sponsor.name}`}
      >
        <span aria-hidden className={`${box} h-9 w-9 text-[13px]`}>
          {mono}
        </span>
        <span className={`type-serif text-base ${nameColor}`}>{sponsor.name}</span>
      </span>
    )
  }

  // variant === 'card' — pieza del muro.
  const cardBase = 'group flex flex-col rounded-md p-6 transition md:p-7'
  const card = principal
    ? `${cardBase} border-2 border-accent ${onNight ? 'bg-night' : 'bg-surface'}`
    : onNight
      ? `${cardBase} border border-night-soft bg-night`
      : `${cardBase} border border-line bg-surface`

  const boxBase = 'grid shrink-0 place-items-center rounded-sm type-display leading-none'
  const box = principal
    ? `${boxBase} bg-accent text-accent-ink`
    : onNight
      ? `${boxBase} border border-night-soft text-night-ink`
      : `${boxBase} border border-line text-ink`
  const boxSize = principal ? 'h-16 w-16 text-2xl' : 'h-12 w-12 text-lg'

  return (
    <article
      className={`${card} ${className}`}
      aria-label={`Sponsor ${sponsor.level}: ${sponsor.name}`}
    >
      <span aria-hidden className={`${box} ${boxSize}`}>
        {mono}
      </span>

      <p
        className={`type-display mt-5 leading-tight ${nameColor} ${
          principal ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'
        }`}
      >
        {sponsor.name}
      </p>

      <p className={`eyebrow mt-2 text-[9px] ${metaColor}`}>{sponsor.industry}</p>

      {principal && (
        <p className={`mt-4 max-w-xs text-[13px] leading-relaxed ${metaColor}`}>
          {sponsor.tagline}
        </p>
      )}

      {sponsor.exclusive && (
        <span
          className={`eyebrow mt-5 inline-flex w-fit items-center rounded-sm border px-2.5 py-1 text-[9px] ${
            onNight ? 'border-accent/40 text-accent' : 'border-accent/50 text-accent'
          }`}
        >
          Exclusividad de rubro
        </span>
      )}
    </article>
  )
}
