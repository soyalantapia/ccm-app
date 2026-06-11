import type { ReactNode } from 'react'

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-16 text-center ${className ?? ''}`}>
      <span aria-hidden className="mb-5 inline-block h-px w-10 bg-accent" />
      <p className="type-serif text-xl text-ink">{title}</p>
      {children && <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
