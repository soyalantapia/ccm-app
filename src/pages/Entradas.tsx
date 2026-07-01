import { Link } from 'react-router-dom'
import { ArrowRight, Check, CalendarDays, MapPin } from 'lucide-react'
import { SectionTitle } from '../components/ui'
import { IDS } from '../data/ids'
import { config } from '../config'
import { TicketSelector } from '../features/tickets/TicketSelector'
import { OrdersSection } from '../features/entradas/OrdersSection'

/** /entradas — los tiers reales de la venta vigente, con compra en el lugar.
 *  Desktop: 2 columnas (tickets que llenan el ancho + aside sticky del evento).
 *  Mobile: columna única, idéntica a los mockups. */
export default function Entradas() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 py-12 md:py-20">
        <SectionTitle
          eyebrow="CCM 2026 · 19 y 20 de septiembre"
          title="Entradas"
          lead={
            <>
              La entrada general es <em className="text-accent-strong">gratuita</em> con inscripción
              previa obligatoria. Las experiencias VIP — Night, Sunset o el combo de las dos noches —
              se compran acá, con acceso independiente.
            </>
          }
        />

        <div className="mt-10 md:mt-14 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
          <TicketSelector className="md:max-w-3xl lg:max-w-none" />

          {/* Aside del evento — solo desktop; en mobile la página queda 1:1 */}
          <aside className="hidden lg:sticky lg:top-28 lg:block">
            <div className="rounded-lg border border-line bg-surface p-6">
              <div className="eyebrow flex items-center gap-3 text-[10px] text-accent-strong">
                <span aria-hidden className="inline-block h-px w-8 bg-accent-strong" />
                El evento
              </div>
              <h3 className="type-serif mt-3 text-xl text-ink">CCM 2026 · {config.edition}</h3>

              <dl className="mt-5 space-y-4 border-t border-line pt-5 text-sm">
                <div className="flex items-start gap-3">
                  <CalendarDays size={16} className="mt-0.5 shrink-0 text-accent-strong" />
                  <div>
                    <dt className="text-ink">{config.mainDatesLabel}</dt>
                    <dd className="mt-0.5 text-ink-soft">Dos jornadas de pasarela y negocios</dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-accent-strong" />
                  <div>
                    <dt className="text-ink">{config.venue.name}</dt>
                    <dd className="mt-0.5 text-ink-soft">{config.venue.address}</dd>
                  </div>
                </div>
              </dl>

              <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm text-ink-soft">
                <li className="flex items-start gap-2.5">
                  <Check size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-accent-strong" />
                  Entrada general gratuita con inscripción previa
                </li>
                <li className="flex items-start gap-2.5">
                  <Check size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-accent-strong" />
                  Experiencias VIP con acceso independiente
                </li>
                <li className="flex items-start gap-2.5">
                  <Check size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-accent-strong" />
                  Estacionamiento sin cargo en Shopping Nuevo Centro
                </li>
              </ul>

              <Link
                to={`/eventos/${IDS.slugs.principal}`}
                className="group mt-6 flex items-center gap-2 border-t border-line pt-5 text-sm text-ink-soft transition-colors hover:text-ink"
              >
                Ver programa, experiencias y agenda
                <ArrowRight size={14} className="text-accent transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </aside>
        </div>

        <p className="mt-10 text-center text-[11px] uppercase tracking-[0.22em] text-ink-soft/70 lg:hidden">
          Cupos limitados · Estacionamiento sin cargo en Shopping Nuevo Centro
        </p>

        <div className="mt-8 flex justify-center lg:hidden">
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
