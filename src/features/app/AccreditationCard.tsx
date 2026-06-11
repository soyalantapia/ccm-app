import { WifiOff } from 'lucide-react'
import { Card, QR } from '../../components/ui'
import { qrToken } from '../../lib/identity'
import { useStore } from '../../data/store'

function Corner({ className }: { className: string }) {
  return <span aria-hidden className={`pointer-events-none absolute h-6 w-6 border-accent ${className}`} />
}

/**
 * Tarjeta de acreditación editorial (PRD §8.3): marco fino con esquinas
 * doradas, QR offline grande, nombre serif. La pieza insignia del evento.
 */
export function AccreditationCard() {
  const profile = useStore((s) => s.getProfile())
  const first = profile.fields.firstName?.value
  const last = profile.fields.lastName?.value
  const name = [first, last].filter(Boolean).join(' ') || 'Invitada/o de CCM'
  const token = qrToken()

  return (
    <Card className="relative mx-auto w-full max-w-sm px-7 py-10 text-center md:px-10">
      {/* Marco interior fino + esquinas doradas decorativas */}
      <span aria-hidden className="pointer-events-none absolute inset-2.5 rounded-sm border border-line" />
      <Corner className="left-2.5 top-2.5 border-l-2 border-t-2" />
      <Corner className="right-2.5 top-2.5 border-r-2 border-t-2" />
      <Corner className="bottom-2.5 left-2.5 border-b-2 border-l-2" />
      <Corner className="bottom-2.5 right-2.5 border-b-2 border-r-2" />

      <div className="eyebrow text-[10px] text-accent">Acreditación · Entrada General</div>
      <h2 className="type-serif mt-3 text-balance text-3xl text-ink">{name}</h2>
      <p className="eyebrow mt-2.5 text-[9px] text-ink-soft">CCM 2026 · 19 y 20 de septiembre</p>

      <div className="mt-7 flex justify-center">
        <QR value={token} size={240} />
      </div>

      <p className="eyebrow mt-6 text-[9px] text-ink-soft/50">{token}</p>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-ink-soft/70">
        <WifiOff size={12} className="text-accent" />
        Tu QR funciona sin conexión
      </p>
    </Card>
  )
}
