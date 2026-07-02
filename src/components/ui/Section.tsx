import type { ReactNode } from 'react'

export function Eyebrow({
  children,
  className,
  tone = 'ink',
}: {
  children: ReactNode
  className?: string
  /** 'ink' = sobre superficie clara (dorado oscuro AA); 'night' = sobre fondo oscuro (dorado de marca). */
  tone?: 'ink' | 'night'
}) {
  const color = tone === 'night' ? 'text-accent' : 'text-accent-strong'
  const line = tone === 'night' ? 'bg-accent' : 'bg-accent-strong'
  return (
    <div className={`eyebrow flex items-center gap-3 ${color} ${className ?? ''}`}>
      <span aria-hidden className={`inline-block h-px w-8 ${line}`} />
      {children}
    </div>
  )
}

interface SectionTitleProps {
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  /** Acción a la derecha (CTA / link "Ver todo"). Se ancla a la fila del título
   *  —no al pie de la bajada—, así el botón queda a la altura del título. */
  action?: ReactNode
  align?: 'left' | 'center'
  tone?: 'ink' | 'night'
  className?: string
}

/** Cabecera editorial estándar: eyebrow dorado + display serif + lead. */
export function SectionTitle({ eyebrow, title, lead, action, align = 'left', tone = 'ink', className }: SectionTitleProps) {
  const center = align === 'center'
  const heading = (
    <div className="min-w-0">
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      <h2
        className={`type-display mt-4 text-[clamp(2rem,6vw,3.4rem)] text-balance ${
          tone === 'night' ? 'text-night-ink' : 'text-ink'
        }`}
      >
        {title}
      </h2>
    </div>
  )
  return (
    <header className={`${center ? 'flex flex-col items-center text-center' : ''} ${className ?? ''}`}>
      {action ? (
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          {heading}
          <div className="shrink-0 pb-1.5">{action}</div>
        </div>
      ) : (
        heading
      )}
      {lead && (
        <p
          className={`mt-5 max-w-xl text-[15px] leading-relaxed md:text-base ${
            tone === 'night' ? 'text-night-ink/70' : 'text-ink-soft'
          }`}
        >
          {lead}
        </p>
      )}
    </header>
  )
}
