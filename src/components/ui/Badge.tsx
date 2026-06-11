import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'night' | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-ink/5 text-ink-soft',
  accent: 'bg-accent/15 text-ink',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  night: 'bg-night text-night-ink',
  outline: 'border border-line text-ink-soft',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={`eyebrow inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[10px] ${tones[tone]} ${className ?? ''}`}
    >
      {children}
    </span>
  )
}
