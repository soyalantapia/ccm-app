import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Eyebrow, SectionTitle, Select, toast } from '../../components/ui'
import type { BadgeTone } from '../../components/ui/Badge'
import { store, useStore } from '../../data/store'
import type { OrderStatus } from '../../data/types'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'
import { formatDateTime, formatMoney } from '../../features/admin/opsFormat'
import { AVISO_CONFIRMACION_MANUAL, LEAD_ORDENES } from '../../features/admin/copyDestructivo'

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
  // getAdminPlans: una orden puede ser de una entrada que después se retiró de la venta; con
  // getPlans (sin retiradas) su nombre no se resolvería y la fila mostraría el id crudo.
  const plans = useStore((s) => s.getAdminPlans())
  // TODAS las órdenes, no solo las del navegador del organizador.
  const orders = useStore((s) => s.getAdminOrders())
  const analytics = useStore((s) => s.getAnalytics())
  const eventos = useStore((s) => s.getAdminEvents())
  const [filtroEvento, setFiltroEvento] = useState('')

  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id
  /** De qué evento es una orden: se resuelve por su plan, que ahora sí lo sabe. */
  const eventoDeOrden = (planId: string) => plans.find((p) => p.id === planId)?.eventId

  // Sólo los eventos que efectivamente tienen entradas: filtrar por uno que no vende nada no
  // aporta, y llenaría el desplegable de opciones vacías.
  const eventosConEntradas = eventos.filter((e) => plans.some((p) => p.eventId === e.id))

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
  ]
    // Filtro por evento: recién se puede desde que el plan sabe de cuál es. Las filas históricas
    // del seed de analytics no tienen plan resoluble, así que al filtrar quedan fuera — es
    // correcto: no se sabe a qué evento pertenecen y mostrarlas dentro de uno sería inventar.
    .filter((r) => !filtroEvento || eventoDeOrden(r.planId) === filtroEvento)
    .sort((a, b) => b.ts.localeCompare(a.ts))

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
        eyebrow="Admin · Ventas"
        title="Órdenes de compra"
        lead={LEAD_ORDENES}
      />

      {/* ─── Órdenes ─── */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Eyebrow>Ventas</Eyebrow>
          {eventosConEntradas.length > 1 && (
            <label className="flex items-center gap-2.5 text-[12px] text-ink-soft">
              Evento
              <Select
                className="min-w-52"
                options={[
                  { value: '', label: 'Todos' },
                  ...eventosConEntradas.map((e) => ({ value: e.id, label: e.title })),
                ]}
                value={filtroEvento}
                onChange={(e) => setFiltroEvento(e.target.value)}
              />
            </label>
          )}
        </div>

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

        <p className="mt-4 text-xs leading-relaxed text-ink-soft/80">{AVISO_CONFIRMACION_MANUAL}</p>
      </section>
    </div>
  )
}
