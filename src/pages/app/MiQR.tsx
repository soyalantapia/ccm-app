import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdBanner, Badge, Button, EmptyState, SectionTitle } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { registerFree } from '../../lib/actions'
import { AccreditationCard } from '../../features/app/AccreditationCard'
import { AppSection } from '../../features/app/AppSection'
import { RegistrationRow } from '../../features/app/RegistrationRow'
import { ORDER_STATUS_META, formatDay, registrationSortKey } from '../../features/app/meta'

/** Mi QR — PRD §8.3: acreditación offline, inscripciones, entradas VIP y slot S6. */
export default function MiQR() {
  const navigate = useNavigate()

  useEffect(() => {
    store.track('qr_view')
  }, [])

  const registrations = useStore((s) => s.getRegistrations().filter((r) => r.status === 'confirmada'))
  const orders = useStore((s) => s.getOrders())
  const registered = registrations.length > 0

  const blockRegistrations = registrations
    .filter((r) => r.blockId)
    .sort((a, b) => registrationSortKey(a).localeCompare(registrationSortKey(b)))

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:py-20">
      <SectionTitle
        align="center"
        eyebrow="Mi QR"
        title={
          <>
            Tu <em className="italic text-accent">acreditación</em>
          </>
        }
        lead={
          registered
            ? 'Mostrala en el acceso y en cada sala. No hace falta imprimir nada.'
            : undefined
        }
      />

      {!registered ? (
        <EmptyState
          className="mt-6"
          title="Todavía no tenés tu QR"
          action={<Button onClick={() => void registerFree(navigate)}>Registrate gratis</Button>}
        >
          La entrada general es gratuita con inscripción obligatoria. Registrate y tu acreditación
          aparece acá, lista para mostrar en la puerta.
        </EmptyState>
      ) : (
        <>
          <div className="mt-10 animate-rise">
            <AccreditationCard />
          </div>

          {/* Inscripciones a bloques: día, hora y sala */}
          {blockRegistrations.length > 0 && (
            <AppSection eyebrow="Tus inscripciones">
              <div className="border-b border-line">
                {blockRegistrations.map((r) => (
                  <RegistrationRow key={r.id} registration={r} />
                ))}
              </div>
            </AppSection>
          )}

          {/* Entradas VIP con estado de la orden MP */}
          {orders.length > 0 && (
            <AppSection eyebrow="Tus entradas VIP">
              <div className="border-b border-line">
                {orders.map((o) => {
                  const plan = store.getPlan(o.planId)
                  const meta = ORDER_STATUS_META[o.status]
                  return (
                    <article key={o.id} className="flex items-center justify-between gap-4 border-t border-line py-4">
                      <div className="min-w-0">
                        <h3 className="type-serif truncate text-lg text-ink">{plan?.name ?? o.planId}</h3>
                        <p className="mt-0.5 text-xs text-ink-soft">Orden del {formatDay(o.ts)}</p>
                      </div>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </article>
                  )
                })}
              </div>
            </AppSection>
          )}
        </>
      )}

      {/* Slot discreto de sponsor (S6) */}
      <AdBanner slot="S6" className="mt-16" />
    </div>
  )
}
