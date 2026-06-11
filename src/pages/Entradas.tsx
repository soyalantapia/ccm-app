import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionTitle } from '../components/ui'
import { store, useStore } from '../data/store'
import { IDS } from '../data/ids'
import type { TicketOrder, TicketPlan } from '../data/types'
import { registerFree } from '../lib/actions'
import { requireProfile } from '../lib/profileRequest'
import { PlanCard } from '../features/entradas/PlanCard'
import { MpRedirectSheet } from '../features/entradas/MpRedirectSheet'
import { ConfirmingBanner } from '../features/entradas/ConfirmingBanner'
import { OrdersSection } from '../features/entradas/OrdersSection'

export default function Entradas() {
  const navigate = useNavigate()
  const plans = useStore((s) => s.getPlans())
  const registered = useStore((s) => s.isRegistered(IDS.events.principal))

  /** Orden creada esperando la redirección a MP (sheet abierto). */
  const [pending, setPending] = useState<{ order: TicketOrder; plan: TicketPlan } | null>(null)
  /** Última orden redirigida a MP en esta visita → banner "confirmando pago". */
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null)

  async function handleBuy(plan: TicketPlan) {
    const ok = await requireProfile(
      ['firstName', 'lastName', 'email', 'profession', 'phone'],
      'compra_vip',
      { title: 'Para comprar tu entrada necesitamos estos datos' },
    )
    if (!ok) return
    const order = store.createOrder(plan.id)
    setPending({ order, plan })
  }

  function handleGoToMp() {
    if (!pending) return
    store.markOrderRedirected(pending.order.id)
    window.open(pending.plan.mpLink!, '_blank', 'noopener')
    setConfirmingOrderId(pending.order.id)
    setPending(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <SectionTitle
          eyebrow="CCM 2026 · 19 y 20 de septiembre"
          title="Entradas"
          lead={
            <>
              La entrada general es <em className="italic text-accent">gratuita</em> con inscripción
              previa obligatoria. Y para vivir las dos galas — Night VIP el sábado y Sunset VIP el
              domingo — comprá tu lugar frente a la pasarela.
            </>
          }
        />

        {confirmingOrderId && <ConfirmingBanner orderId={confirmingOrderId} />}

        <div className="mt-10 grid gap-6 md:mt-14 md:grid-cols-3 md:items-start">
          {plans.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={index}
              registered={plan.id === 'general' ? registered : undefined}
              onAction={() => (plan.id === 'general' ? void registerFree(navigate) : void handleBuy(plan))}
              className={plan.featured ? '' : 'md:mt-10'}
            />
          ))}
        </div>

        <p className="eyebrow mt-12 text-center text-[10px] text-ink-soft/70">
          Cupos limitados · Estacionamiento sin cargo en Shopping Nuevo Centro
        </p>
      </section>

      <OrdersSection />

      <MpRedirectSheet
        open={pending !== null}
        order={pending?.order ?? null}
        plan={pending?.plan ?? null}
        onConfirm={handleGoToMp}
        onClose={() => setPending(null)}
      />
    </>
  )
}
