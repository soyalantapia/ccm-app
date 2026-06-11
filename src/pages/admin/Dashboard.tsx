import { Download } from 'lucide-react'
import { Badge, Button, Stat } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { CorePanel } from '../../features/admin/CorePanel'
import { CoreOccupancyBar } from '../../features/admin/CoreOccupancyBar'
import { CoreLiveFeed } from '../../features/admin/CoreLiveFeed'
import { downloadAnalyticsCsv } from '../../features/admin/coreAnalytics'
import { ORDER_STATUSES, ORDER_STATUS_META, formatRelative, percent } from '../../features/admin/coreFormat'

export default function Dashboard() {
  const analytics = useStore((s) => s.getAnalytics())
  const orders = useStore((s) => s.getOrders())
  const applications = useStore((s) => s.getApplications())
  const caminoEvent = useStore((s) => s.getEventById(IDS.events.camino18))
  const occupancy = useStore((s) =>
    s.getBlocks(IDS.events.camino18).map((block) => ({
      block,
      avail: s.blockAvailability(block.id),
    })),
  )

  const count = (name: string) => analytics.filter((e) => e.event === name).length
  const seedOrders = analytics.filter((e) => e.seed && e.event === 'ticket_order_created').length

  const stats = [
    { label: 'Registrados', value: count('user_created') },
    { label: 'Inscripciones', value: count('registration_created') - count('registration_cancelled') },
    { label: 'Descargas de fotos', value: count('photo_download') },
    { label: 'Órdenes VIP', value: orders.length + seedOrders },
    { label: 'Postulaciones', value: applications.length },
  ]

  /* Impresiones y clics agrupados por sponsor (ad_impression / ad_click). */
  const sponsorRows = (() => {
    const grouped = new Map<string, { impressions: number; clicks: number }>()
    for (const e of analytics) {
      if (e.event !== 'ad_impression' && e.event !== 'ad_click') continue
      const sponsorId = typeof e.payload?.sponsorId === 'string' ? e.payload.sponsorId : 'otros'
      const row = grouped.get(sponsorId) ?? { impressions: 0, clicks: 0 }
      if (e.event === 'ad_impression') row.impressions += 1
      else row.clicks += 1
      grouped.set(sponsorId, row)
    }
    return [...grouped.entries()]
      .map(([sponsorId, row]) => {
        const sponsor = store.getSponsor(sponsorId)
        return { sponsorId, name: sponsor?.name ?? 'Otros', level: sponsor?.level, ...row }
      })
      .sort((a, b) => b.impressions - a.impressions)
  })()

  const ordersByStatus = ORDER_STATUSES.map((status) => {
    const ofStatus = orders.filter((o) => o.status === status)
    return { status, count: ofStatus.length, last: ofStatus.at(-1)?.ts }
  })

  const liveEvents = [...analytics].slice(-12).reverse()

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Dashboard"
        live
        lead="Demo local · sincronización en la nube en Fase 1"
        actions={
          <Button variant="outline" size="sm" onClick={() => downloadAnalyticsCsv(analytics)}>
            <Download size={13} strokeWidth={2} /> Exportar CSV
          </Button>
        }
      />

      {/* Cifras propias — el argumento de venta (PRD §10.1) */}
      <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="border-t border-line pt-5">
            <Stat value={s.value} label={s.label} />
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-x-10 gap-y-10 lg:grid-cols-5">
        <div className="space-y-10 lg:col-span-3">
          {/* Ocupación de bloques — acá se VE el dato en vivo */}
          <CorePanel
            title={`Ocupación de bloques · ${caminoEvent?.title ?? 'Camino a CCM'}`}
            note="Se actualiza en vivo con cada inscripción"
          >
            <div className="space-y-5">
              {occupancy.map(({ block, avail }) => (
                <div key={block.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <p className="type-serif min-w-0 truncate text-[15px] text-ink">{block.title}</p>
                    <p className="eyebrow shrink-0 text-[9px] text-ink-soft/70">
                      {block.start} hs · {block.room}
                    </p>
                  </div>
                  <CoreOccupancyBar className="mt-2" taken={avail.taken} capacity={avail.capacity} />
                </div>
              ))}
            </div>
          </CorePanel>

          {/* Órdenes por estado */}
          <CorePanel
            title="Órdenes por estado"
            note={seedOrders > 0 ? `Órdenes de esta demo · ${seedOrders} histórica del seed suma al total` : 'Órdenes de esta demo'}
          >
            {orders.length === 0 ? (
              <p className="py-4 text-sm text-ink-soft">
                Sin órdenes en esta demo todavía. Iniciá una compra VIP desde la app y la vas a ver
                aparecer acá.
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="eyebrow py-2.5 pr-4 text-[9px] font-semibold text-ink-soft">Estado</th>
                    <th className="eyebrow py-2.5 pr-4 text-right text-[9px] font-semibold text-ink-soft">
                      Órdenes
                    </th>
                    <th className="eyebrow hidden py-2.5 text-right text-[9px] font-semibold text-ink-soft sm:table-cell">
                      Última
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ordersByStatus.map(({ status, count: n, last }) => (
                    <tr key={status} className="border-b border-line">
                      <td className="py-3 pr-4">
                        <Badge tone={ORDER_STATUS_META[status].tone}>{ORDER_STATUS_META[status].label}</Badge>
                      </td>
                      <td className="type-serif py-3 pr-4 text-right text-lg tabular-nums text-ink">{n}</td>
                      <td className="hidden py-3 text-right text-[12px] text-ink-soft sm:table-cell">
                        {last ? formatRelative(last) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CorePanel>

          {/* Sponsors — cada impresión queda medida */}
          <CorePanel title="Sponsors" note="Cada impresión queda medida — first-party">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="eyebrow py-2.5 pr-4 text-[9px] font-semibold text-ink-soft">Sponsor</th>
                  <th className="eyebrow py-2.5 pr-4 text-right text-[9px] font-semibold text-ink-soft">
                    Impresiones
                  </th>
                  <th className="eyebrow py-2.5 pr-4 text-right text-[9px] font-semibold text-ink-soft">
                    Clics
                  </th>
                  <th className="eyebrow hidden py-2.5 text-right text-[9px] font-semibold text-ink-soft sm:table-cell">
                    CTR
                  </th>
                </tr>
              </thead>
              <tbody>
                {sponsorRows.map((row) => (
                  <tr key={row.sponsorId} className="border-b border-line">
                    <td className="py-3 pr-4">
                      <p className="type-serif text-[15px] text-ink">{row.name}</p>
                      {row.level && <p className="eyebrow mt-0.5 text-[8px] text-ink-soft/70">{row.level}</p>}
                    </td>
                    <td className="py-3 pr-4 text-right text-[13px] tabular-nums text-ink">{row.impressions}</td>
                    <td className="py-3 pr-4 text-right text-[13px] tabular-nums text-ink">{row.clicks}</td>
                    <td className="hidden py-3 text-right text-[12px] tabular-nums text-ink-soft sm:table-cell">
                      {row.impressions > 0 ? `${percent(row.clicks, row.impressions)}%` : '—'}
                    </td>
                  </tr>
                ))}
                {sponsorRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-sm text-ink-soft">
                      Sin impresiones registradas todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CorePanel>
        </div>

        {/* Actividad en vivo — bloque night de contraste */}
        <div className="lg:col-span-2">
          <div className="rounded-md border border-night-soft bg-night p-5 md:p-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="eyebrow text-[10px] text-night-ink">Actividad en vivo</h2>
              <span className="eyebrow flex items-center gap-1.5 text-[8px] text-success">
                <span aria-hidden className="animate-pulse leading-none">
                  ●
                </span>
                Últimos 12
              </span>
            </div>
            <div className="mt-4">
              <CoreLiveFeed events={liveEvents} />
            </div>
            <p className="mt-4 border-t border-night-soft pt-3 text-[10px] leading-relaxed text-night-ink/40">
              Cada acción del público queda registrada first-party (PRD §13). Probá inscribirte desde
              la app en otra pestaña: la fila entra sola.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
