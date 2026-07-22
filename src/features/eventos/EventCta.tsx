import { useNavigate } from 'react-router-dom'
import { Badge, Button, ButtonLink, toast } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { requireProfile } from '../../lib/profileRequest'
import { registerFree } from '../../lib/actions'
import { formatMoney } from '../tickets/format'
import type { EventItem } from '../../data/types'

/**
 * CTA general de la ficha: registro a nivel evento (sin bloque).
 * Principal → registerFree (entrada general gratuita). Caminos/capacitaciones →
 * "Inscribirme al encuentro" con el mismo flujo D22.
 * Renderizar con key={event.id} (la reactividad del selector depende del remount).
 */
export function EventCta({ event }: { event: EventItem }) {
  const navigate = useNavigate()
  const registration = useStore((s) =>
    s
      .getRegistrations()
      .find((r) => r.status === 'confirmada' && r.eventId === event.id && r.blockId === undefined),
  )

  if (event.type === 'principal') {
    if (registration) {
      return (
        <div className="flex flex-wrap items-center gap-4">
          <Badge tone="success">Ya estás inscripto</Badge>
          <ButtonLink to="/mi-qr" variant="outline" size="sm">
            Ver mi QR
          </ButtonLink>
        </div>
      )
    }
    return (
      <Button size="lg" onClick={() => void registerFree(navigate)}>
        Registrate gratis
      </Button>
    )
  }

  if (registration) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <Badge tone="success">Ya estás inscripto</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const eventId = registration.eventId
            store.cancelRegistration(registration.id)
            toast('Inscripción cancelada', {
              tone: 'info',
              action: {
                label: 'Deshacer',
                onClick: () => {
                  const restored = store.register(eventId)
                  if (restored) toast('Inscripción confirmada ✓')
                  else toast('No pudimos reactivar tu inscripción', 'info')
                },
              },
            })
          }}
        >
          Cancelar
        </Button>
      </div>
    )
  }

  const onRegister = async () => {
    const ok = await requireProfile(
      ['firstName', 'lastName', 'email', 'profession'],
      'inscripcion_evento',
      {
        title: 'Para inscribirte necesitamos estos datos',
        message: 'Una sola vez: no te lo volvemos a pedir.',
      },
    )
    if (!ok) return
    store.register(event.id)
    toast('Inscripción confirmada ✓')
  }

  /**
   * Evento con precio: se compra, no se regala. El lugar se crea recién cuando Mercado Pago
   * avisa que el pago entró — acá no se inscribe a nadie. Ésa es toda la diferencia con el
   * botón de abajo, y es la que hace que el precio sirva de filtro como pidió el cliente.
   */
  const onComprar = async () => {
    const ok = await requireProfile(
      ['firstName', 'lastName', 'email', 'profession'],
      'compra_evento',
      {
        title: 'Para comprar tu lugar necesitamos estos datos',
        message: 'Una sola vez: no te lo volvemos a pedir.',
      },
    )
    if (!ok) return
    try {
      const r = await store.startCheckout([{ kind: 'event', resourceId: event.id }])
      if (!r) {
        toast('No pudimos abrir el pago. Probá de nuevo en un momento.', 'info')
        return
      }
      // El monto lo calcula el server. Si no coincide con el que se mostró en pantalla, no se
      // redirige: es la red barata contra cobrarle a alguien algo distinto de lo que vio.
      if (event.price != null && r.amount !== event.price) {
        toast('El precio cambió recién. Recargá la página antes de comprar.', 'info')
        return
      }
      window.location.href = r.initPoint
    } catch {
      toast('No pudimos abrir el pago. Probá de nuevo en un momento.', 'info')
    }
  }

  if (event.price != null) {
    return (
      <Button size="lg" onClick={() => void onComprar()}>
        Comprar mi lugar · {formatMoney(event.price)}
      </Button>
    )
  }

  return (
    <Button size="lg" onClick={() => void onRegister()}>
      Inscribirme al encuentro
    </Button>
  )
}
