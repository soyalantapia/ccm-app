import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Check, Minus, Plus } from 'lucide-react'
import { Badge, Button, Sheet, toast } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { esLinkDePagoReal } from '../../config/plans'
import { IDS } from '../../data/ids'
import type { TicketOrder, TicketPlan } from '../../data/types'
import { registerFree } from '../../lib/actions'
import { requireProfile } from '../../lib/profileRequest'
import { formatMoney } from './format'

interface PendingCheckout {
  orders: TicketOrder[]
  total: number
  mpLink: string
  /** El link no es de un cobro nuevo: es un pago que el comprador ya tenía abierto y va a retomar. */
  retomando?: boolean
}

/**
 * Link manual del plan (mpLink), la red de seguridad para cuando no hay checkout real.
 *
 * Dos condiciones, y las dos son plata:
 *
 * 1. SOLO sirve para UNA entrada de UN plan: es una URL de precio fijo de Mercado Pago. Con dos
 *    planes en el carrito, o con cantidad > 1, mandar ahí al comprador le cobra una fracción de
 *    lo que compró.
 * 2. Tiene que ser un link de pago DE VERDAD. El sembrado traía MP_PLACEHOLDER — la portada de
 *    mercadopago.com.ar — y esta red de seguridad era humo: el guard `if (!pending.mpLink)` no lo
 *    atrapaba porque no está vacío, así que el comprador aterrizaba en la home de MP mientras la
 *    UI le decía que su pago se estaba confirmando.
 *
 * Si no se cumplen, devuelve '' y el comprador se entera con un aviso honesto, sin que se marque
 * nada como redirigido. No cobrar es malo; cobrar de menos o mentirle es peor.
 */
function fallbackManual(selected: TicketPlan[], totalQty: number): string {
  if (selected.length > 1 || totalQty > 1) return ''
  return selected.find((p) => esLinkDePagoReal(p.mpLink))?.mpLink ?? ''
}

/**
 * Selector de entradas estilo ticketera (datos reales de la venta vigente):
 * tiers con stepper de cantidad, cargo por servicio visible y barra sticky
 * con el total. Las gratuitas inscriben directo (flujo D22 → QR).
 */
/**
 * Selector de entradas de UN evento. `eventId` por defecto es el principal porque los dos lugares
 * donde se usa hoy son suyos (/entradas y el cuerpo del evento principal), pero el parámetro
 * existe para que la ficha de cualquier otro evento pueda mostrar sus propios tiers.
 */
export function TicketSelector({
  className,
  eventId = IDS.events.principal,
}: {
  className?: string
  eventId?: string
}) {
  const navigate = useNavigate()
  // Acotado al evento: sin esto, un tier de una capacitación aparecería acá para comprar.
  const plans = useStore((s) => s.getPlans(eventId))
  const registered = useStore((s) => s.isRegistered(eventId))

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

      // AWAIT de verdad: `createOrder` es fire-and-forget y el checkout de abajo puede llegar al
      // server ANTES que las órdenes (→ RESOURCE_NOT_FOUND → link manual mal cobrado).
      let orders: TicketOrder[]
      try {
        orders = await store.createOrders(selected.map((p) => ({ planId: p.id, qty: qty[p.id]! })))
      } catch {
        toast('No pudimos registrar tu compra. Revisá tu conexión y probá de nuevo.', 'info')
        return
      }
      // Total real de las órdenes creadas (no el del render, que pudo cambiar durante el await).
      const orderedTotal = orders.reduce((acc, o) => acc + o.total, 0)

      // UN solo cobro que cubre TODAS las órdenes: una preferencia de MP por el total. Antes se
      // pedía el cobro de la PRIMERA orden nada más, así que un carrito de dos planes pagaba uno
      // y se llevaba los dos.
      let real: { initPoint: string; amount: number } | null
      try {
        real = await store.startCheckout(orders.map((o) => ({ kind: 'ticket_order' as const, resourceId: o.id })))
      } catch (err) {
        // COBRO_SOLAPADO: alguna de estas órdenes ya está adentro de otro pago en curso. No se
        // resuelve solo y NO hay que darle el link manual (cobra otra cosa): se le ofrece
        // retomar el pago que ya tiene abierto.
        const enCurso = (err as { details?: { initPoint?: string } })?.details?.initPoint
        if (enCurso) {
          setPending({ orders, total: orderedTotal, mpLink: enCurso, retomando: true })
        } else {
          toast('Ya tenés un pago en curso para estas entradas. Esperá unos minutos y probá de nuevo.', 'info')
        }
        return
      }

      // Si el server cobra distinto de lo que el comprador vio en pantalla, NO se redirige.
      if (real && real.amount !== orderedTotal) {
        toast('Los precios cambiaron, revisá tu compra antes de pagar.', 'info')
        return
      }

      const mpLink = real?.initPoint ?? fallbackManual(selected, totalQty)
      // Sin un cobro real no se abre el sheet: ese sheet promete "te llevamos a Mercado Pago" y
      // después marca las órdenes como redirigidas. Prometerlo sin link es la mentira que este
      // arreglo viene a sacar. La orden ya quedó registrada, así que se lo decimos tal cual.
      if (!mpLink) {
        toast(
          'No pudimos abrir el pago. Tu pedido quedó registrado pero NO está pago: probá de nuevo en unos minutos o escribinos.',
          'info',
        )
        return
      }

      setPending({ orders, total: orderedTotal, mpLink })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const goToMp = () => {
    if (!pending) return
    // Segundo cinturón: ni siquiera un initPoint que llegue del server (o el link de un pago en
    // curso) se usa si no es un link de pago de verdad. Redirigir a una portada sería igual de
    // mentiroso viniendo de donde viniera.
    if (!esLinkDePagoReal(pending.mpLink)) {
      toast(
        'No pudimos abrir el pago. Tu pedido quedó registrado pero NO está pago: probá de nuevo en unos minutos o escribinos.',
        'info',
      )
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
              {pending.retomando ? (
                <>
                  Ya tenías un pago en curso que incluye estas entradas. Para no cobrarte dos
                  veces, te llevamos a <span className="font-semibold text-ink">ese mismo pago</span>{' '}
                  en vez de generar uno nuevo.
                </>
              ) : (
                <>
                  Tu orden por{' '}
                  <span className="font-semibold text-ink">{formatMoney(pending.total)}</span> ya
                  quedó registrada: completá el pago en Mercado Pago y confirmamos tu lugar.
                </>
              )}
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
              {pending.retomando ? 'Retomar el pago en curso' : 'Ir a Mercado Pago'}{' '}
              <ArrowUpRight size={16} strokeWidth={2.25} aria-hidden />
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
