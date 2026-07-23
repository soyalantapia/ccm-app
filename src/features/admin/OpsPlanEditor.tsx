import { useState } from 'react'
import { EyeOff, RotateCcw, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Field, Input, toast } from '../../components/ui'
import { store } from '../../data/store'
import { esLinkDePagoReal } from '../../config/plans'
import type { TicketPlan } from '../../data/types'
import { formatMoney } from './opsFormat'

/**
 * Editor de un plan de entrada: precio y link de pago de Mercado Pago editables en vivo
 * (PRD §10.15). La General es gratuita y sin link.
 *
 * Una entrada RETIRADA de la venta se muestra en gris, sin los campos de edición y con un botón
 * para volver a ponerla a la venta. Retirar es la salida cuando una entrada ya tiene compras (no
 * se puede borrar sin llevarse el registro) o cuando terminó la preventa.
 *
 * OpsPlanEditor es un DESPACHADOR sin hooks: elige entre dos componentes según `archived`. La
 * versión anterior tenía un `if (archived) return …` ANTES de dos `useState`, así que al retirar
 * una entrada montada —justo la acción central— el conteo de hooks bajaba de 2 a 0 y React
 * crasheaba ("Rendered fewer hooks than expected"). Separado en dos componentes, cada uno tiene
 * sus hooks estables y el toggle sólo cambia qué componente se monta.
 */
export function OpsPlanEditor({ plan, onBorrar }: { plan: TicketPlan; onBorrar?: () => void }) {
  return plan.archived ? (
    <PlanRetirado plan={plan} onBorrar={onBorrar} />
  ) : (
    <PlanALaVenta plan={plan} onBorrar={onBorrar} />
  )
}

/** Botón de borrar (papelera) compartido por los dos estados. */
function BotonBorrar({ plan, onBorrar }: { plan: TicketPlan; onBorrar?: () => void }) {
  if (!onBorrar) return null
  return (
    <button
      type="button"
      onClick={onBorrar}
      aria-label={`Eliminar ${plan.name}`}
      className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"
    >
      <Trash2 size={14} />
    </button>
  )
}

/** Entrada retirada de la venta: gris, sin campos de edición, con opción de reactivar. */
function PlanRetirado({ plan, onBorrar }: { plan: TicketPlan; onBorrar?: () => void }) {
  const volverALaVenta = () => {
    store.updatePlan(plan.id, { archived: false })
    toast('✓ Entrada de vuelta a la venta')
  }
  return (
    <Card className="flex h-full flex-col p-5 opacity-70 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="type-serif text-xl text-ink">{plan.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{plan.tagline}</p>
        </div>
        <Badge tone="neutral" className="shrink-0">
          <EyeOff size={11} /> Retirada
        </Badge>
      </div>
      <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-soft">
        No aparece en la app y no se puede comprar. Las ventas anteriores siguen válidas y sus
        compradores conservan su entrada.
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        <Button size="sm" variant="ink" onClick={volverALaVenta}>
          <RotateCcw size={13} /> Volver a la venta
        </Button>
        <BotonBorrar plan={plan} onBorrar={onBorrar} />
      </div>
    </Card>
  )
}

/** Entrada a la venta: precio y link editables, con opción de retirarla. */
function PlanALaVenta({ plan, onBorrar }: { plan: TicketPlan; onBorrar?: () => void }) {
  const isFree = plan.kind === 'general'
  const [price, setPrice] = useState(plan.price === null || plan.price === 0 ? '' : String(plan.price))
  // Los planes guardados en la base todavía traen el placeholder (la portada de MP) de un seed
  // viejo. Si se precargara el campo con eso, el organizador vería un "link cargado" que no cobra
  // nada y lo dejaría como está. Se muestra vacío: no hay link, y hay que poner uno.
  const [mpLink, setMpLink] = useState(esLinkDePagoReal(plan.mpLink) ? plan.mpLink! : '')

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
    // `startsWith('http')` dejaba pasar https://www.mercadopago.com.ar — la portada, que no cobra
    // nada. Guardado como link de pago, mandaba al comprador a una página donde no puede pagar.
    if (!esLinkDePagoReal(mpLink)) {
      toast('Ese link no cobra nada (la portada de Mercado Pago no sirve). Pegá el link del cobro.', 'info')
      return
    }
    store.updatePlan(plan.id, { mpLink: mpLink.trim() })
    toast('✓ Link de pago actualizado')
  }

  const retirar = () => {
    store.updatePlan(plan.id, { archived: true })
    toast('Entrada retirada de la venta · ya no aparece en la app')
  }

  return (
    <Card className="flex h-full flex-col p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="type-serif text-xl text-ink">{plan.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{plan.tagline}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {plan.featured && <Badge tone="accent">Destacada</Badge>}
          <BotonBorrar plan={plan} onBorrar={onBorrar} />
        </div>
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
            {/* flex-wrap + ancho mínimo: dentro del panel del evento la columna es angosta y,
                con el botón `shrink-0` al lado, el input quedaba en 63px — mostraba "45" cuando
                el valor era 45000. Ahora el botón baja de línea antes que el campo se vuelva
                ilegible. */}
            <div className="flex flex-wrap gap-2">
              <Input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="A confirmar"
                className="min-w-32 flex-1"
              />
              <Button size="sm" variant="ink" onClick={savePrice} className="shrink-0">
                Guardar
              </Button>
            </div>
          </Field>
          <Field label="Link de pago Mercado Pago" hint="El comprador sale de la app solo acá.">
            <div className="flex flex-wrap gap-2">
              <Input
                type="url"
                value={mpLink}
                onChange={(e) => setMpLink(e.target.value)}
                placeholder="https://mpago.la/..."
                className="min-w-40 flex-1"
              />
              <Button size="sm" variant="ink" onClick={saveLink} className="shrink-0">
                Guardar
              </Button>
            </div>
          </Field>
        </div>
      )}

      {/* Retirar de la venta: la salida cuando la entrada ya se vendió (no se puede borrar sin
          llevarse el registro) o cuando terminó la preventa. Deja de aparecer sin perder nada. */}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4 text-xs text-ink-soft">
        <span>Cuando deje de venderse, retirala en vez de borrarla.</span>
        <button
          type="button"
          onClick={retirar}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <EyeOff size={13} /> Retirar de la venta
        </button>
      </div>
    </Card>
  )
}
