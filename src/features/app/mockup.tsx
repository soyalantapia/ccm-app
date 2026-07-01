import type { ReactNode } from 'react'

/**
 * Primitivas del sistema visual de los mockups CCM (revista de lujo → app).
 * Reutilizables por todas las pantallas app-facing para mantener el lenguaje
 * (section-label dorado, beneficio-item, section-empty, sponsor-cuadrado).
 */

/** section-label: barra dorada 24×2 + eyebrow dorado uppercase (0.12em). */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 pb-2.5 pt-4 ${className}`}>
      <span aria-hidden className="h-0.5 w-6 shrink-0 bg-accent" />
      <span className="eyebrow text-[10px] text-accent">{children}</span>
    </div>
  )
}

/** beneficio-item: fila blanca con caja-ícono dorada 40px + título Playfair + desc. */
export function BeneficioItem({
  icon,
  title,
  desc,
  trailing,
}: {
  icon: ReactNode
  title: ReactNode
  desc: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.07)]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-ink">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="type-serif text-[13px] leading-tight text-ink">{title}</div>
        <div className="mt-1 text-[10px] leading-[1.5] text-text-3">{desc}</div>
        {trailing}
      </div>
    </div>
  )
}

/** section-empty: hero de estado vacío con tinte dorado (gradiente oscuro cálido). */
export function SectionEmpty({ icon, title, sub }: { icon: ReactNode; title: ReactNode; sub: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-accent/20 bg-gradient-to-br from-ink to-brown-warm p-[18px] text-center">
      <div className="text-[40px] leading-none">{icon}</div>
      <div className="type-serif mt-2.5 text-[16px] text-night-ink">{title}</div>
      <div className="mt-1.5 text-[10px] text-text-2">{sub}</div>
    </div>
  )
}

/** sponsor-cuadrado: card oscura vertical (caja-logo dorada + label + nombre Playfair). */
export function SponsorCuadrado({ icon, name, label = 'Sponsor' }: { icon: ReactNode; name: ReactNode; label?: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-[12px] bg-ink p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-accent text-accent-ink">{icon}</span>
      <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-accent">{label}</span>
      <span className="type-serif text-[12px] leading-tight text-night-ink">{name}</span>
    </div>
  )
}
