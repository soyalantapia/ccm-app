import { Link } from 'react-router-dom'
import { Camera, Megaphone, Shirt, Ticket, type LucideIcon } from 'lucide-react'
import { IDS } from '../../data/ids'

const LINKS: { to: string; label: string; sub: string; Icon: LucideIcon }[] = [
  { to: '/entradas', label: 'Entradas', sub: 'General y VIP', Icon: Ticket },
  { to: '/catalogo', label: 'Catálogo', sub: 'Talentos del ecosistema', Icon: Shirt },
  { to: '/fotos', label: 'Fotos', sub: 'Galerías del evento', Icon: Camera },
  { to: `/c/${IDS.convocatoriaSlugs.camino}`, label: 'Postulate', sub: 'Camino a CCM', Icon: Megaphone },
]

/** Accesos rápidos del feed: grilla de 4 mini-cards utilitarias. */
export function QuickLinks() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {LINKS.map(({ to, label, sub, Icon }) => (
        <Link
          key={to}
          to={to}
          className="group rounded-md border border-line bg-surface p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent"
        >
          <Icon size={18} strokeWidth={1.75} className="text-accent" />
          <div className="eyebrow mt-3 text-[10px] text-ink">{label}</div>
          <div className="mt-1 text-[11px] text-ink-soft">{sub}</div>
        </Link>
      ))}
    </div>
  )
}
