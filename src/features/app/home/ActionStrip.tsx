import { Link } from 'react-router-dom'
import { Calendar, Camera, Megaphone, Shirt, Ticket, type LucideIcon } from 'lucide-react'
import { IDS } from '../../../data/ids'

interface Action {
  to: string
  label: string
  Icon: LucideIcon
}

const ACTIONS: Action[] = [
  { to: '/entradas', label: 'Entradas', Icon: Ticket },
  { to: '/catalogo', label: 'Expositores', Icon: Shirt },
  { to: '/fotos', label: 'Fotos', Icon: Camera },
  { to: `/c/${IDS.convocatoriaSlugs.camino}`, label: 'Postulate', Icon: Megaphone },
  { to: '/eventos', label: 'Eventos', Icon: Calendar },
]

/**
 * Strip horizontal tipo "stories": accesos rápidos circulares con scroll-snap.
 * Muy app — tocables con tap feedback, sin barra de scroll visible.
 */
export function ActionStrip() {
  return (
    <nav aria-label="Accesos rápidos" className="no-scrollbar -mx-5 mt-6 flex snap-x gap-4 overflow-x-auto px-5">
      {ACTIONS.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={to}
          className="group flex shrink-0 snap-start flex-col items-center gap-2"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors duration-200 group-hover:border-accent group-hover:text-accent group-active:scale-[0.94]">
            <Icon size={22} strokeWidth={1.75} />
          </span>
          <span className="eyebrow text-[9px] text-ink-soft">{label}</span>
        </Link>
      ))}
    </nav>
  )
}
