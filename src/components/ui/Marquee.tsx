interface MarqueeProps {
  items: string[]
  tone?: 'night' | 'accent'
  className?: string
}

/** Cinta editorial en movimiento — separadores ✦ */
export function Marquee({ items, tone = 'night', className }: MarqueeProps) {
  const palette =
    tone === 'night' ? 'bg-night text-night-ink' : 'bg-accent text-accent-ink'
  return (
    <div className={`overflow-hidden py-3 ${palette} ${className ?? ''}`} aria-hidden>
      <div className="flex w-max animate-marquee">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {items.map((item, i) => (
              <span key={i} className="eyebrow flex items-center whitespace-nowrap">
                <span className="px-5">{item}</span>
                <span className="text-accent">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
