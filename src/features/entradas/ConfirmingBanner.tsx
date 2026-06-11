import { Hourglass } from 'lucide-react'
import { shortOrderId } from './format'

/** Estado post-redirección a MP: la orden quedó `redirigida_mp` (PRD §6.2). */
export function ConfirmingBanner({ orderId }: { orderId: string }) {
  return (
    <div
      role="status"
      className="animate-rise mt-8 rounded-md border border-accent/40 bg-accent/10 px-5 py-4"
    >
      <div className="flex items-start gap-3">
        <Hourglass size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div>
          <p className="text-[15px] font-semibold text-ink">Estamos confirmando tu pago</p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
            Tu orden <span className="font-semibold text-ink">#{shortOrderId(orderId)}</span> quedó
            registrada. Apenas se acredite el pago, tu entrada aparece en Mi QR.
          </p>
        </div>
      </div>
    </div>
  )
}
