import type { ReactNode } from 'react'

interface StatProps {
  value: ReactNode
  label: string
  tone?: 'ink' | 'night' | 'accent'
  className?: string
}

export function Stat({ value, label, tone = 'ink', className }: StatProps) {
  const valueColor = tone === 'night' ? 'text-night-ink' : tone === 'accent' ? 'text-accent' : 'text-ink'
  const labelColor = tone === 'night' ? 'text-night-ink/60' : 'text-ink-soft'
  return (
    <div className={className}>
      <div className={`type-display text-4xl md:text-5xl ${valueColor}`}>{value}</div>
      <div className={`eyebrow mt-2.5 text-[10px] ${labelColor}`}>{label}</div>
    </div>
  )
}
