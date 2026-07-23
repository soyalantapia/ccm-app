import { useNavigate } from 'react-router-dom'
import { ChevronRight, QrCode, Sparkles } from 'lucide-react'
import { Button, ButtonLink, Img, QR } from '../../../components/ui'
import { store, useStore } from '../../../data/store'
import { IDS } from '../../../data/ids'
import { registerFree } from '../../../lib/actions'
import { qrToken } from '../../../lib/identity'

/**
 * Card de acción principal del home — lo primero y más destacado.
 *
 * - Sin inscripción al principal → CTA "Registrate gratis" sobre la cover.
 * - Con inscripción → "carnet" tipo wallet siempre a mano: nombre, tipo de
 *   entrada, mini-QR y acceso directo a Mi QR.
 */
export function PrimaryActionCard() {
  const navigate = useNavigate()
  const registered = useStore((s) => s.isRegistered(IDS.events.principal))

  return registered ? <WalletCard /> : <RegisterCard onRegister={() => void registerFree(navigate)} />
}

function RegisterCard({ onRegister }: { onRegister: () => void }) {
  return (
    <section className="animate-rise relative mt-6 overflow-hidden rounded-md">
      <Img src="img/events/principal.jpg" alt="CCM 2026 · 14ª Edición" priority className="aspect-[16/10]" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night/95 via-night/60 to-night/15" />
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-7 [text-shadow:0_1px_4px_rgb(0_0_0/0.55)]">
        <div className="eyebrow flex items-center gap-1.5 text-[10px] text-night-ink [text-shadow:0_1px_4px_rgb(0_0_0/0.85)]">
          <Sparkles size={12} />
          Entrada general · gratis
        </div>
        <h2 className="type-display mt-2 text-balance text-2xl leading-[1.05] text-night-ink md:text-3xl">
          Asegurá tu lugar en la 14ª edición
        </h2>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-night-ink/80">
          Sin inscripción no se ingresa. Cupos limitados.
        </p>
        <Button className="mt-4 w-full sm:w-auto" onClick={onRegister}>
          Registrate gratis
        </Button>
      </div>
    </section>
  )
}

function WalletCard() {
  const profile = useStore((s) => s.getProfile())
  // Tipo de entrada más alto: una VIP confirmada manda; si no, entrada general. El kind viaja en
  // la orden (o.planKind, resuelto por el server): si sólo mirara getPlan(o.planId), una VIP cuyo
  // tipo de entrada fue retirado de la venta desaparece de /plans → getPlan undefined → la
  // credencial de un comprador VIP legítimo bajaba a "Entrada general". Fallback a getPlan para
  // órdenes viejas/demo sin el snapshot.
  const hasVip = useStore((s) =>
    s.getOrders().some(
      (o) => o.status === 'confirmada' && (o.planKind ?? s.getPlan(o.planId)?.kind) === 'vip',
    ),
  )
  const first = profile.fields.firstName?.value
  const last = profile.fields.lastName?.value
  const name = [first, last].filter(Boolean).join(' ') || 'Invitada/o de CCM'
  const entryType = hasVip ? 'Acceso VIP' : 'Entrada general'
  const token = qrToken()

  return (
    <section
      className="animate-rise mt-6 overflow-hidden rounded-md border border-line bg-surface"
      aria-label="Tu acreditación"
    >
      <div className="flex items-stretch gap-4 p-4">
        {/* Mini-QR real, lista para mostrar en la puerta */}
        <button
          type="button"
          onClick={() => store.track('qr_view', { from: 'home_wallet' })}
          className="flex shrink-0 items-center justify-center rounded-sm border border-line bg-bg p-2.5 active:scale-[0.97]"
          aria-hidden
          tabIndex={-1}
        >
          <QR value={token} size={84} />
        </button>

        <div className="flex min-w-0 flex-col justify-between py-0.5">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-1.5 text-[9px] text-accent">
              <QrCode size={11} />
              {entryType}
            </div>
            <h2 className="type-serif mt-1.5 truncate text-xl text-ink">{name}</h2>
            <p className="eyebrow mt-1 text-[9px] text-ink-soft/70">Acreditación CCM 2026</p>
          </div>
        </div>
      </div>

      <ButtonLink
        to="/mi-qr"
        variant="night"
        className="flex w-full items-center justify-center gap-1.5 rounded-none rounded-b-md py-3.5"
      >
        Ver Mi QR
        <ChevronRight size={15} />
      </ButtonLink>
    </section>
  )
}
