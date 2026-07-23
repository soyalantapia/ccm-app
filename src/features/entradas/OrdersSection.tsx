import { Badge, Eyebrow } from '../../components/ui'
import { useStore } from '../../data/store'
import type { OrderStatus } from '../../data/types'
import { formatOrderDate, shortOrderId } from './format'

const STATUS: Record<OrderStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'danger' }> = {
  iniciada: { label: 'Iniciada', tone: 'neutral' },
  redirigida_mp: { label: 'Confirmando pago', tone: 'accent' },
  confirmada: { label: 'Confirmada', tone: 'success' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
}

/** "Tus órdenes": seguimiento local de las compras VIP. Solo se muestra si hay órdenes. */
export function OrdersSection() {
  const orders = useStore((s) => s.getOrders())
  // TODOS los planes a propósito, sin filtrar por evento: acá se resuelve el nombre de cualquier
  // entrada que la persona haya comprado, y sus compras pueden ser de eventos distintos.
  const plans = useStore((s) => s.getPlans())
  if (orders.length === 0) return null

  const planName = new Map(plans.map((p) => [p.id, p.name]))
  const sorted = [...orders].sort((a, b) => b.ts.localeCompare(a.ts))

  return (
    <section className="mx-auto max-w-6xl px-5 pb-16 md:pb-24">
      <div className="border-t border-line pt-10 md:pt-14">
        <Eyebrow>Seguimiento</Eyebrow>
        <h2 className="type-serif mt-3 text-2xl text-ink md:text-3xl">Tus órdenes</h2>
        <ul className="mt-6 border-y border-line divide-y divide-line">
          {sorted.map((order) => {
            const status = STATUS[order.status]
            return (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4"
              >
                <div>
                  <p className="type-serif text-lg text-ink">
                    {planName.get(order.planId) ?? order.planId}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    #{shortOrderId(order.id)} · {formatOrderDate(order.ts)}
                  </p>
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
