import { useState } from 'react'
import { Badge, Button, Card, Field, Input, toast } from '../../components/ui'
import { store } from '../../data/store'
import type { TicketPlan } from '../../data/types'
import { formatMoney } from './opsFormat'

/**
 * Editor de un plan de entrada: precio y link de pago de Mercado Pago
 * editables en vivo (PRD §10.15). La General es gratuita y sin link.
 */
export function OpsPlanEditor({ plan }: { plan: TicketPlan }) {
  const isFree = plan.kind === 'general'
  const [price, setPrice] = useState(plan.price === null || plan.price === 0 ? '' : String(plan.price))
  const [mpLink, setMpLink] = useState(plan.mpLink ?? '')

  const savePrice = () => {
    const n = Number(price)
    if (price.trim() === '' || Number.isNaN(n) || n < 0) {
      toast('Ingresá un precio válido', 'info')
      return
    }
    store.updatePlan(plan.id, { price: n })
    toast('✓ Precio actualizado')
  }

  const saveLink = () => {
    if (!mpLink.trim().startsWith('http')) {
      toast('Ingresá un link válido de Mercado Pago', 'info')
      return
    }
    store.updatePlan(plan.id, { mpLink: mpLink.trim() })
    toast('✓ Link de pago actualizado')
  }

  return (
    <Card className="flex h-full flex-col p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="type-serif text-xl text-ink">{plan.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{plan.tagline}</p>
        </div>
        {plan.featured && <Badge tone="accent">Destacada</Badge>}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="type-serif text-2xl text-ink">
          {plan.price === null ? <span className="text-ink-soft">A confirmar</span> : formatMoney(plan.price)}
          {!isFree && plan.serviceCharge > 0 && (
            <span className="ml-2 font-sans text-[11px] text-ink-soft">
              +{formatMoney(plan.serviceCharge)} por servicio
            </span>
          )}
        </div>
        <div className="eyebrow mt-1 text-[9px] text-ink-soft">Precio actual</div>
      </div>

      {isFree ? (
        <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-ink-soft">
          Acreditación general gratuita con inscripción previa obligatoria — sin link de pago.
        </p>
      ) : (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <Field label="Precio (ARS)">
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="A confirmar"
              />
              <Button size="sm" variant="ink" onClick={savePrice} className="shrink-0">
                Guardar
              </Button>
            </div>
          </Field>
          <Field label="Link de pago Mercado Pago" hint="El comprador sale de la app solo acá.">
            <div className="flex gap-2">
              <Input
                type="url"
                value={mpLink}
                onChange={(e) => setMpLink(e.target.value)}
                placeholder="https://mpago.la/..."
              />
              <Button size="sm" variant="ink" onClick={saveLink} className="shrink-0">
                Guardar
              </Button>
            </div>
          </Field>
        </div>
      )}
    </Card>
  )
}
