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
  align?: 'left' | 'center'
  tone?: 'ink' | 'night'
  className?: string
}

/** Cabecera editorial estándar: eyebrow dorado + display serif + lead. */
export function SectionTitle({ eyebrow, title, lead, align = 'left', tone = 'ink', className }: SectionTitleProps) {
  const center = align === 'center'
  return (
    <header className={`${center ? 'flex flex-col items-center text-center' : ''} ${className ?? ''}`}>
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      <h2
        className={`type-display mt-4 text-[clamp(2rem,6vw,3.4rem)] text-balance ${
          tone === 'night' ? 'text-night-ink' : 'text-ink'
        }`}
      >
        {title}
      </h2>
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
