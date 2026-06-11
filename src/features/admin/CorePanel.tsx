import type { ReactNode } from 'react'

interface CorePanelProps {
  title: string
  /** Nota fina a la derecha del título (contexto comercial del dato). */
  note?: ReactNode
  className?: string
  children: ReactNode
}

/** Sección de dashboard: regla fina superior + eyebrow como header (DESIGN §editorial). */
export function CorePanel({ title, note, className, children }: CorePanelProps) {
  return (
    <section className={`border-t border-line pt-5 ${className ?? ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="eyebrow text-[10px] text-ink">{title}</h2>
        {note && <p className="text-[11px] text-ink-soft/80">{note}</p>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}
