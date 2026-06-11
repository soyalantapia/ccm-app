import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface OpsDangerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md'
  children: ReactNode
}

const sizes = {
  sm: 'text-[11px] px-3.5 py-2',
  md: 'text-xs px-5 py-3',
}

/**
 * Botón outline de peligro — variante que el kit no trae (rechazos,
 * cancelaciones, reset de demo). Misma anatomía que `Button` del kit.
 */
export function OpsDangerButton({ size = 'md', className, children, ...rest }: OpsDangerButtonProps) {
  return (
    <button
      className={`inline-flex select-none items-center justify-center gap-2 rounded-sm border border-danger/40 font-semibold uppercase tracking-[0.14em] text-danger transition-all duration-200 hover:border-danger hover:bg-danger/5 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ${sizes[size]} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  )
}
