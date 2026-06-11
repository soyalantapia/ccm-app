import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type ButtonVariant = 'primary' | 'ink' | 'outline' | 'ghost' | 'night'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-[0.14em] rounded-sm transition-all duration-200 select-none disabled:opacity-40 disabled:pointer-events-none'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-ink shadow-[0_1px_0_rgba(0,0,0,0.18)] hover:brightness-105 hover:shadow-[0_6px_20px_-6px_var(--t-accent)] active:translate-y-px',
  ink: 'bg-ink text-bg hover:opacity-90 active:translate-y-px',
  outline: 'border border-ink/35 text-ink hover:border-ink hover:bg-ink/5 active:translate-y-px',
  ghost: 'text-ink hover:bg-ink/5',
  night: 'bg-night text-night-ink hover:bg-night-soft active:translate-y-px',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'text-[11px] px-3.5 py-2',
  md: 'text-xs px-5 py-3',
  lg: 'text-[13px] px-7 py-4',
}

function cls(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className ?? ''}`
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: ButtonProps) {
  return (
    <button className={cls(variant, size, className)} {...rest}>
      {children}
    </button>
  )
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to?: string
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

/** Botón-link: `to` para rutas internas, `href` para salidas permitidas (MP / Maps). */
export function ButtonLink({ to, href, variant = 'primary', size = 'md', className, children, ...rest }: ButtonLinkProps) {
  if (to) {
    return (
      <Link to={to} className={cls(variant, size, className)}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} className={cls(variant, size, className)} {...rest}>
      {children}
    </a>
  )
}
