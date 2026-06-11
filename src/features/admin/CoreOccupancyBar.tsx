import { percent } from './coreFormat'

interface CoreOccupancyBarProps {
  taken: number
  capacity: number
  /** Oculta los números (para celdas compactas de tabla). */
  compact?: boolean
  className?: string
}

/** Barra de ocupación: relleno dorado sobre bg-ink/10, "Completo" en danger. */
export function CoreOccupancyBar({ taken, capacity, compact, className }: CoreOccupancyBarProps) {
  const pct = percent(taken, capacity)
  const full = capacity > 0 && taken >= capacity
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-ink/10">
        <div
          className="h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {full ? (
        <span className="eyebrow shrink-0 text-[9px] text-danger">Completo</span>
      ) : (
        !compact && (
          <span className="shrink-0 text-xs tabular-nums text-ink-soft">
            {taken}/{capacity}
          </span>
        )
      )}
    </div>
  )
}
