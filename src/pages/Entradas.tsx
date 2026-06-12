import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { SectionTitle } from '../components/ui'
import { IDS } from '../data/ids'
import { TicketSelector } from '../features/tickets/TicketSelector'
import { OrdersSection } from '../features/entradas/OrdersSection'

/** /entradas — los tiers reales de la venta vigente, con compra en el lugar. */
export default function Entradas() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 py-12 md:py-20">
        <SectionTitle
          eyebrow="CCM 2026 · 19 y 20 de septiembre"
          title="Entradas"
          lead={
            <>
              La entrada general es <em className="italic text-accent">gratuita</em> con inscripción
              previa obligatoria. Las experiencias VIP — Night, Sunset o el combo de las dos noches —
              se compran acá, con acceso independiente.
            </>
          }
        />

        <TicketSelector className="mt-10 md:mt-14 md:max-w-3xl" />

        <p className="mt-10 text-center text-[11px] uppercase tracking-[0.22em] text-ink-soft/70">
          Cupos limitados · Estacionamiento sin cargo en Shopping Nuevo Centro
        </p>

        <div className="mt-8 flex justify-center">
          <Link
            to={`/eventos/${IDS.slugs.principal}`}
            className="group flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
          >
            Ver todo sobre la expo: programa, experiencias y agenda
            <ArrowRight size={14} className="text-accent transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      <OrdersSection />
    </>
  )
}
