import { ArrowUpRight } from 'lucide-react'
import type { TicketOrder, TicketPlan } from '../../data/types'
import { Button, Sheet } from '../../components/ui'
import { shortOrderId } from './format'

interface MpRedirectSheetProps {
  open: boolean
  order: TicketOrder | null
  plan: TicketPlan | null
  /** Marca la orden como redirigida y abre Mercado Pago (lo maneja la página). */
  onConfirm: () => void
  onClose: () => void
}

/** Sheet intermedio del flujo VIP: orden registrada → salida única a Mercado Pago. */
export function MpRedirectSheet({ open, order, plan, onConfirm, onClose }: MpRedirectSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Te llevamos a Mercado Pago">
      {order && plan && (
        <div>
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Tu orden <span className="font-semibold text-ink">#{shortOrderId(order.id)}</span> de{' '}
            <span className="font-semibold text-ink">{plan.name}</span> ya quedó registrada: completá el
            pago en Mercado Pago y confirmamos tu lugar.
          </p>
          <Button size="lg" className="mt-6 w-full" onClick={onConfirm}>
            Ir a Mercado Pago
            <ArrowUpRight size={16} strokeWidth={2.25} aria-hidden />
          </Button>
          <p className="eyebrow mt-4 text-center text-[10px] text-ink-soft/70">
            Pago seguro · se abre en una pestaña nueva
          </p>
        </div>
      )}
    </Sheet>
  )
}
