import { percent } from './coreFormat'

interface CoreOccupancyBarProps {
  taken: number
  capacity: number
  /** Celda compacta de tabla: esconde la fracción mientras haya lugar. Al llenarse se muestra igual. */
  compact?: boolean
  className?: string
}

/**
 * Barra de ocupación: relleno dorado sobre bg-ink/10.
 *
 * La fracción NO se pierde al llenarse: "Completo" se SUMA al número, no lo reemplaza. Llenarse
 * es justo cuando hace falta saber sobre cuánto está lleno — y sin el número una sobreventa
 * (45 sobre 40) queda invisible, porque la condición es `taken >= capacity` y 45/40 se veía
 * idéntico a 40/40. Además el cliente pidió textual "cupo máximo 50, ya tenemos 20": el número
 * es el pedido, no un adorno.
 */
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
      {(full || !compact) && (
        <span className={`shrink-0 text-xs tabular-nums ${full ? 'text-danger' : 'text-ink-soft'}`}>
          {taken}/{capacity}
        </span>
      )}
      {full && <span className="eyebrow shrink-0 text-[9px] text-danger">Completo</span>}
    </div>
  )
}
