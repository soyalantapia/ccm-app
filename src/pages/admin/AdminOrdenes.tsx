import { Badge, Button, Card, EmptyState, Eyebrow, SectionTitle, toast } from '../../components/ui'
import type { BadgeTone } from '../../components/ui/Badge'
import { store, useStore } from '../../data/store'
import type { OrderStatus } from '../../data/types'
import { OpsPlanEditor } from '../../features/admin/OpsPlanEditor'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'
import { formatDateTime, formatMoney } from '../../features/admin/opsFormat'

const STATUS_META: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  iniciada: { label: 'Iniciada', tone: 'neutral' },
  redirigida_mp: { label: 'Redirigida a MP', tone: 'accent' },
  confirmada: { label: 'Confirmada', tone: 'success' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
}

interface OrderRow {
  id: string
  buyer: string
  planId: string
  ts: string
  status: OrderStatus
  historic: boolean
  qty?: number
  total?: number
}

export default function AdminOrdenes() {
  const plans = useStore((s) => s.getPlans())
  // TODAS las órdenes, no solo las del navegador del organizador.
  const orders = useStore((s) => s.getAdminOrders())
  const analytics = useStore((s) => s.getAnalytics())

  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id

  /* Órdenes reales del dispositivo + históricas del seed de analytics (informativas). */
  const seedCreated = analytics.filter((e) => e.seed && e.event === 'ticket_order_created')
  const seedRedirected = new Set(
    analytics
      .filter((e) => e.seed && e.event === 'ticket_order_redirected_mp')
      .map((e) => `${e.deviceId}|${String(e.payload?.planId)}`),
  )
  const rows: OrderRow[] = [
    ...orders.map((o) => ({
      id: o.id,
      buyer: o.buyerName || o.buyerEmail || 'Visitante sin perfil',
      planId: o.planId,
      ts: o.ts,
      status: o.status,
      historic: false,
      qty: o.qty ?? 1,
      total: o.total,
    })),
    ...seedCreated.map((e) => ({
      id: e.id,
      buyer: 'Visitante anónimo',
      planId: String(e.payload?.planId ?? ''),
      ts: e.ts,
      status: (seedRedirected.has(`${e.deviceId}|${String(e.payload?.planId)}`)
        ? 'redirigida_mp'
        : 'iniciada') as OrderStatus,
      historic: true,
    })),
  ].sort((a, b) => b.ts.localeCompare(a.ts))

  const confirm = (id: string) => {
    store.setOrderStatus(id, 'confirmada')
    toast('✓ Orden confirmada')
  }
  const cancel = (id: string) => {
    store.setOrderStatus(id, 'cancelada')
    toast('Orden cancelada', 'info')
  }

  const actions = (row: OrderRow) =>
    row.historic ? null : (
      <div className="flex justify-end gap-2">
        {row.status !== 'confirmada' && row.status !== 'cancelada' && (
          <Button size="sm" onClick={() => confirm(row.id)}>
            Confirmar
          </Button>
        )}
        {row.status !== 'cancelada' && (
          <OpsDangerButton size="sm" onClick={() => cancel(row.id)}>
            Cancelar
          </OpsDangerButton>
        )}
      </div>
    )

  return (
    <div className="px-5 py-8 md:px-10">
      <SectionTitle
        eyebrow="Admin · Entradas"
        title="Entradas y órdenes"
        lead="Editá precios y links de pago de Mercado Pago por plan, y gestioná las órdenes de la demo."
      />

      {/* ─── Planes (PRD §10.15) ─── */}
      <section className="mt-10">
        <Eyebrow>Planes de entrada</Eyebrow>
        <div className="mt-5 grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <OpsPlanEditor key={plan.id} plan={plan} />
          ))}
        </div>
      </section>

      {/* ─── Órdenes ─── */}
      <section className="mt-14 border-t border-line pt-10">
        <Eyebrow>Órdenes</Eyebrow>

        {rows.length === 0 ? (
          <EmptyState title="Todavía no hay órdenes" className="mt-2">
            Cuando alguien compre una entrada VIP desde la app, la orden aparece acá en vivo.
          </EmptyState>
        ) : (
          <>
            {/* Tabla desktop */}
            <div className="mt-5 hidden md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="eyebrow pb-3 pr-4 text-[10px] font-normal text-ink-soft">Comprador</th>
                    <th className="eyebrow pb-3 pr-4 text-[10px] font-normal text-ink-soft">Plan</th>
                    <th className="eyebrow pb-3 pr-4 text-[10px] font-normal text-ink-soft">Total</th>
                    <th className="eyebrow pb-3 pr-4 text-[10px] font-normal text-ink-soft">Fecha</th>
                    <th className="eyebrow pb-3 pr-4 text-[10px] font-normal text-ink-soft">Estado</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-line">
                      <td className="py-4 pr-4">
                        <span className="text-[15px] text-ink">{row.buyer}</span>
                        {row.historic && (
                          <Badge tone="outline" className="ml-2.5">
                            Histórico
                          </Badge>
                        )}
                      </td>
                      <td className="type-serif py-4 pr-4 text-base text-ink">
                        {planName(row.planId)}
                        {(row.qty ?? 1) > 1 && <span className="text-ink-soft"> ×{row.qty}</span>}
                      </td>
                      <td className="type-serif py-4 pr-4 text-base text-ink">
                        {row.total !== undefined ? formatMoney(row.total) : '—'}
                      </td>
                      <td className="py-4 pr-4 text-sm text-ink-soft">{formatDateTime(row.ts)}</td>
                      <td className="py-4 pr-4">
                        <Badge tone={STATUS_META[row.status].tone}>{STATUS_META[row.status].label}</Badge>
                      </td>
                      <td className="py-4 text-right">{actions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards mobile */}
            <div className="mt-5 space-y-3 md:hidden">
              {rows.map((row) => (
                <Card key={row.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[15px] text-ink">{row.buyer}</div>
                      <div className="type-serif mt-0.5 text-base text-ink">
                        {planName(row.planId)}
                        {(row.qty ?? 1) > 1 && <span className="text-ink-soft"> ×{row.qty}</span>}
                        {row.total !== undefined && <span> · {formatMoney(row.total)}</span>}
                      </div>
                      <div className="mt-1 text-xs text-ink-soft">{formatDateTime(row.ts)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge tone={STATUS_META[row.status].tone}>{STATUS_META[row.status].label}</Badge>
                      {row.historic && <Badge tone="outline">Histórico</Badge>}
                    </div>
                  </div>
                  {!row.historic && <div className="mt-3 border-t border-line pt-3">{actions(row)}</div>}
                </Card>
              ))}
            </div>
          </>
        )}

        <p className="mt-4 text-xs leading-relaxed text-ink-soft/80">
          Confirmación manual en la demo · la conciliación automática por webhook de Mercado Pago llega
          en Fase 1.
        </p>
      </section>
    </div>
  )
}
