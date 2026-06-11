import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  tone?: 'surface' | 'night' | 'bare'
  children: ReactNode
}

const tones = {
  surface: 'bg-surface border border-line',
  night: 'bg-night text-night-ink border border-night-soft',
  bare: 'border border-line',
}

export function Card({ hover, tone = 'surface', className, children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-md ${tones[tone]} ${
        hover
          ? 'transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_50px_-18px_rgba(24,20,16,0.28)]'
          : ''
      } ${className ?? ''}`}
      {...rest}
    >
      {children}
    </div>
  )
}
