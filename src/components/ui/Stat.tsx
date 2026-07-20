import type { ReactNode } from 'react'

interface StatProps {
  value: ReactNode
  label: string
  tone?: 'ink' | 'night' | 'accent'
  className?: string
}

/**
 * Tamaño del número según su LONGITUD, no según el breakpoint.
 *
 * Con un tamaño fijo, un valor corto ("6") y uno largo ("$ 20.000") ocupan anchos muy
 * distintos: medido en el Dashboard, el monto necesitaba 185px dentro de una caja de
 * 160px y se desbordaba encima del KPI de al lado. Como el ancho disponible depende de
 * la grilla que lo contenga —y los montos crecen con el tiempo— el tamaño se deriva del
 * contenido, así funciona en cualquier layout sin que haya que acordarse de ajustarlo.
 */
function tamañoSegunLargo(value: ReactNode): string {
  const largo = typeof value === 'string' || typeof value === 'number' ? String(value).length : 2
  if (largo <= 4) return 'text-[clamp(1.75rem,2vw+0.9rem,3rem)]' // "11", "250+"
  if (largo <= 8) return 'text-[clamp(1.4rem,1.4vw+0.7rem,2.1rem)]' // "$ 20.000"
  return 'text-[clamp(1.1rem,1vw+0.6rem,1.6rem)]' // "$ 1.200.000"
}

export function Stat({ value, label, tone = 'ink', className }: StatProps) {
  const valueColor = tone === 'night' ? 'text-night-ink' : tone === 'accent' ? 'text-accent' : 'text-ink'
  const labelColor = tone === 'night' ? 'text-night-ink/60' : 'text-ink-soft'
  return (
    // min-w-0: sin esto un item de grid toma el ancho de su contenido y empuja a los vecinos.
    <div className={`min-w-0 ${className ?? ''}`}>
      <div className={`type-display leading-[1.05] ${tamañoSegunLargo(value)} ${valueColor}`}>{value}</div>
      <div className={`eyebrow mt-2.5 text-[10px] ${labelColor}`}>{label}</div>
    </div>
  )
}
