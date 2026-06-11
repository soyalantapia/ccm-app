import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Eyebrow } from '../../components/ui'

interface AppSectionProps {
  eyebrow: string
  title?: ReactNode
  /** Link editorial a la derecha del header ("Ver todo →"). */
  link?: { to: string; label: string }
  className?: string
  children: ReactNode
}

/** Sección del feed/app: eyebrow dorado + título serif + link opcional. */
export function AppSection({ eyebrow, title, link, className, children }: AppSectionProps) {
  return (
    <section className={`mt-14 md:mt-20 ${className ?? ''}`}>
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>{eyebrow}</Eyebrow>
          {title && <h2 className="type-serif mt-3 text-balance text-2xl text-ink md:text-3xl">{title}</h2>}
        </div>
        {link && (
          <Link
            to={link.to}
            className="group eyebrow flex shrink-0 items-center gap-1 pb-1 text-[10px] text-ink transition-colors hover:text-accent"
          >
            {link.label}
            <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        )}
      </header>
      <div className="mt-6">{children}</div>
    </section>
  )
}
