import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Check, Minus, Plus } from 'lucide-react'
import { Badge, Button, Sheet, toast } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import type { TicketOrder, TicketPlan } from '../../data/types'
import { registerFree } from '../../lib/actions'
import { newId } from '../../lib/storage'
import { requireProfile } from '../../lib/profileRequest'
import { formatMoney } from './format'

interface PendingCheckout {
  orders: TicketOrder[]
  total: number
  mpLink: string
}

/**
 * Selector de entradas estilo ticketera (datos reales de la venta vigente):
 * tiers con stepper de cantidad, cargo por servicio visible y barra sticky
 * con el total. Las gratuitas inscriben directo (flujo D22 → QR).
 */
export function TicketSelector({ className }: { className?: string }) {
  const navigate = useNavigate()
  const plans = useStore((s) => s.getPlans())
  const registered = useStore((s) => s.isRegistered(IDS.events.principal))

  const [qty, setQty] = useState<Partial<Record<string, number>>>({})
  const [pending, setPending] = useState<PendingCheckout | null>(null)
  const [confirming, setConfirming] = useState(false)
  /**
   * Guard anti doble-submit. Se usa un ref (no estado) porque el setState no se
   * refleja sincrónicamente: dos taps en el mismo tick leerían el mismo render
   * y crearían órdenes duplicadas. El ref se actualiza al instante. El `busy`
   * de estado existe solo para deshabilitar el botón en la UI.
   */
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  const vipPlans = useMemo(() => plans.filter((p) => p.kind === 'vip'), [plans])

  const totalQty = vipPlans.reduce((acc, p) => acc + (qty[p.id] ?? 0), 0)
  const total = vipPlans.reduce(
    (acc, p) => acc + (qty[p.id] ?? 0) * ((p.price ?? 0) + p.serviceCharge),
    0,
  )

  const bump = (plan: TicketPlan, delta: number) => {
    if (confirming) setConfirming(false) // empieza una selección nueva → oculta el aviso anterior
    setQty((q) => ({ ...q, [plan.id]: Math.min(6, Math.max(0, (q[plan.id] ?? 0) + delta)) }))
  }

  const checkout = async () => {
    if (busyRef.current || pending) return // anti doble-submit (ref = bloqueo en el mismo tick)
    busyRef.current = true
    setBusy(true)
    try {
      const ok = await requireProfile(
        ['firstName', 'lastName', 'email', 'profession', 'phone'],
        'compra_vip',
        { title: 'Para comprar tus entradas necesitamos estos datos' },
      )
      if (!ok) return
      const selected = vipPlans.filter((p) => (qty[p.id] ?? 0) > 0)
      if (selected.length === 0) return
      // Todas las órdenes de esta compra comparten un grupo, así el server cobra la SUMA en un
      // único pago y confirma el grupo entero al acreditarse. Antes se creaba una orden por tipo
      // y se generaba el cobro por la PRIMERA nomás, mientras acá abajo se le mostraba al
      // comprador el total de todas: veía un precio y le cobraban otro (menor), y las entradas de
      // los demás tipos no llegaban nunca.
      const groupId = selected.length > 1 ? newId('grp') : undefined
      const orders = selected.map((p) => store.createOrder(p.id, qty[p.id]!, groupId))
      // Total real de las órdenes creadas (no del render, que pudo cambiar durante el await).
      const orderedTotal = orders.reduce((acc, o) => acc + o.total, 0)
      // El checkout se pide por la primera orden, pero el server resuelve el grupo entero: el
      // monto que cobra es la suma de todas. Si no hay conexión con MP (o el checkout no se pudo
      // generar), cae al link manual del plan — la venta nunca se corta.
      const real = await store.startCheckout('ticket_order', orders[0].id)
      const mpLink = real ?? selected.find((p) => p.mpLink)?.mpLink ?? ''
      setPending({ orders, total: orderedTotal, mpLink })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const goToMp = () => {
    if (!pending) return
    if (!pending.mpLink) {
      toast('La venta de entradas no está disponible en este momento. Probá más tarde.', 'info')
      setPending(null)
      return
    }
    pending.orders.forEach((o) => store.markOrderRedirected(o.id))
    // Misma pestaña (no window.open): en el celular la pestaña nueva se pierde y el comprador
    // nunca vuelve. Con redirección acá, las back_urls de la preferencia lo traen de nuevo a CCM.
    window.location.href = pending.mpLink
    setPending(null)
    setQty({})
    setConfirming(true)
  }

  return (
    <div className={className}>
      {confirming && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-accent/40 bg-accent/10 p-4 animate-rise">
          <Check size={16} className="mt-0.5 shrink-0 text-accent" />
          <div className="text-sm leading-relaxed text-ink">
            <span className="font-semibold">Estamos confirmando tu pago.</span> Tu orden quedó
            registrada: apenas Mercado Pago confirme, tu entrada aparece en{' '}
            <button onClick={() => navigate('/mi-qr')} className="underline decoration-accent underline-offset-2">
              Mi QR
            </button>
            .
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        {plans.map((plan) => {
          const isFree = plan.kind === 'general'
          const count = qty[plan.id] ?? 0
          return (
            <article
              key={plan.id}
              className={`flex items-center justify-between gap-4 border-t border-line p-4 first:border-t-0 md:p-5 ${
                count > 0 ? 'bg-accent/5' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="type-serif text-[17px] leading-snug text-ink md:text-lg">
                    {plan.name}
                  </h3>
                  {plan.preventa && <Badge tone="accent">Preventa</Badge>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{plan.tagline}</p>
                <p className="type-serif mt-2 text-lg text-ink">
                  {isFree ? (
                    'Gratis'
                  ) : (
                    <>
                      {formatMoney(plan.price ?? 0)}
                      <span className="ml-2 font-sans text-[11px] text-ink-soft">
                        +{formatMoney(plan.serviceCharge)} por servicio
                      </span>
                    </>
                  )}
                </p>
              </div>

              {isFree ? (
                registered ? (
                  <Badge tone="success" className="shrink-0">
                    <Check size={11} /> Inscripto
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => void registerFree(navigate)}>
                    Inscribirme
                  </Button>
                )
              ) : (
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    aria-label={`Quitar ${plan.name}`}
                    onClick={() => bump(plan, -1)}
                    disabled={count === 0}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink transition-all active:scale-90 disabled:opacity-30 hover:border-ink lg:h-9 lg:w-9"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="type-serif w-5 text-center text-lg tabular-nums text-ink">{count}</span>
                  <button
                    aria-label={`Agregar ${plan.name}`}
                    onClick={() => bump(plan, 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink shadow-sm transition-all active:scale-90 hover:brightness-105 lg:h-9 lg:w-9"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-soft/80">
        Las experiencias VIP tienen acceso independiente de la entrada general. Cupos limitados.
      </p>

      {/* Espaciador para que la barra sticky no tape contenido */}
      {totalQty > 0 && <div className="h-24" aria-hidden />}

      {/* Barra de compra sticky (app-style) — portal a body: el wrapper de
          transición de página crea un containing block y rompería el fixed */}
      {totalQty > 0 &&
        createPortal(
          // El offset inferior despeja el bottom-nav, así que conmuta en lg (donde el nav
          // desaparece) y NO en md: con md la barra bajaba a 24px, dentro de la banda de 64px
          // del nav, y al ir por portal a body lo tapaba — incluido el botón central de QR.
          <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 px-4 lg:bottom-6 animate-rise">
            <div className="mx-auto flex max-w-xl items-center justify-between gap-4 rounded-md bg-night p-3 pl-5 text-night-ink shadow-2xl">
              <div>
                <div className="type-serif text-lg leading-tight">{formatMoney(total)}</div>
                <div className="text-[11px] text-night-ink/60">
                  {totalQty} {totalQty === 1 ? 'entrada' : 'entradas'} · incluye cargo por servicio
                </div>
              </div>
              <Button onClick={() => void checkout()} disabled={busy || !!pending} className="shrink-0">
                Continuar
              </Button>
            </div>
          </div>,
          document.body,
        )}

      {/* Sheet de salida a Mercado Pago */}
      <Sheet open={pending !== null} onClose={() => setPending(null)} title="Te llevamos a Mercado Pago">
        {pending && (
          <div>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              Tu orden por{' '}
              <span className="font-semibold text-ink">{formatMoney(pending.total)}</span> ya quedó
              registrada: completá el pago en Mercado Pago y confirmamos tu lugar.
            </p>
            <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
              {pending.orders.map((o) => {
                const plan = store.getPlan(o.planId)
                return (
                  <li key={o.id} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="text-ink">
                      {plan?.name ?? o.planId}
                      {o.qty > 1 && <span className="text-ink-soft"> ×{o.qty}</span>}
                    </span>
                    <span className="type-serif text-ink">{formatMoney(o.total)}</span>
                  </li>
                )
              })}
            </ul>
            <Button size="lg" className="mt-6 w-full" onClick={goToMp}>
              Ir a Mercado Pago <ArrowUpRight size={16} strokeWidth={2.25} aria-hidden />
            </Button>
            <p className="eyebrow mt-4 text-center text-[10px] text-ink-soft/70">
              Pago seguro con Mercado Pago
            </p>
          </div>
        )}
      </Sheet>
    </div>
  )
}
