import { WifiOff } from 'lucide-react'
import { QR } from '../../components/ui'
import { qrToken } from '../../lib/identity'
import { useStore } from '../../data/store'

/**
 * Tarjeta de acreditación (qr-card de los mockups): superficie blanca con borde
 * dorado de 2px, badge dorado, nombre en Playfair 900, QR offline y código
 * monoespaciado. La pieza insignia del evento.
 */
export function AccreditationCard() {
  const profile = useStore((s) => s.getProfile())
  const first = profile.fields.firstName?.value
  const last = profile.fields.lastName?.value
  const name = [first, last].filter(Boolean).join(' ') || 'Invitada/o de CCM'
  const token = qrToken()

  return (
    <div className="mx-auto w-full max-w-sm rounded-[14px] border-2 border-accent bg-white p-5 text-center shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
      <div className="eyebrow text-[9px] text-accent">Acreditación · Entrada General</div>
      <h2 className="type-display mt-3 text-balance text-[24px] leading-[1.15] text-ink">{name}</h2>
      <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.05em] text-text-2">
        CCM 2026 · 19 y 20 de septiembre
      </p>

      <div className="mt-[18px] flex justify-center">
        <QR value={token} size={160} />
      </div>

      <p className="mt-3.5 text-[9px] tracking-[0.06em] text-text-4 [font-family:ui-monospace,SFMono-Regular,Menlo,monospace]">
        {token}
      </p>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-accent">
        <WifiOff size={12} />
        Tu QR funciona sin conexión
      </p>
    </div>
  )
}
