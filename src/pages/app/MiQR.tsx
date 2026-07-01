import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Star } from 'lucide-react'
import { AdBanner, Badge, Button, EmptyState, SectionTitle } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import { registerFree } from '../../lib/actions'
import { AccreditationCard } from '../../features/app/AccreditationCard'
import { AddToCalendar } from '../../features/app/AddToCalendar'
import { AppSection } from '../../features/app/AppSection'
import { InscripcionItem, SectionLabel } from '../../features/app/mockup'
import { ORDER_STATUS_META, formatDay, registrationSortKey } from '../../features/app/meta'
import type { Registration } from '../../data/types'

/** Deriva hora/título/rubro del bloque y renderiza el inscripcion-item del mockup. */
function InscripcionRow({ registration }: { registration: Registration }) {
  const block = useStore((s) => (registration.blockId ? s.getBlock(registration.blockId) : undefined))
  if (!block) return null
  return <InscripcionItem hora={block.start} titulo={block.title} plataforma={`${block.kind} · ${block.room}`} />
}

/** Mi QR — PRD §8.3: acreditación offline, inscripciones, entradas VIP y slot S6. */
export default function MiQR() {
  const navigate = useNavigate()

  useEffect(() => {
    store.track('qr_view')
  }, [])

  const registrations = useStore((s) => s.getRegistrations().filter((r) => r.status === 'confirmada'))
  const orders = useStore((s) => s.getOrders())
  const mainEvent = useStore((s) => s.getEventById(IDS.events.principal))
  const isSocio = useStore((s) => s.isSocio())
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
            Tu <em className="text-accent">acreditación</em>
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
            {isSocio && (
              <div className="mb-3 flex justify-center">
                <Badge tone="solid">
                  <Star size={11} /> Acceso VIP · Socio CCM
                </Badge>
              </div>
            )}
            <AccreditationCard />
            {mainEvent && (
              <div className="mt-5 flex justify-center">
                <AddToCalendar event={mainEvent} label="Agregar CCM 2026 al calendario" />
              </div>
            )}
          </div>

          {/* Mis Inscripciones (inscripcion-item de los mockups) */}
          {blockRegistrations.length > 0 && (
            <>
              <SectionLabel>Mis Inscripciones</SectionLabel>
              <div className="flex flex-col gap-2">
                {blockRegistrations.map((r) => (
                  <InscripcionRow key={r.id} registration={r} />
                ))}
              </div>
            </>
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
                        <h3 className="type-serif truncate text-lg text-ink">
                          {plan?.name ?? o.planId}
                          {(o.qty ?? 1) > 1 && <span className="text-ink-soft"> ×{o.qty}</span>}
                        </h3>
                        <p className="mt-0.5 text-xs text-ink-soft">Orden del {formatDay(o.ts)}</p>
                      </div>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </article>
                  )
                })}
              </div>
            </AppSection>
          )}

          {/* Mi Suscripción (suscripcion-card dorada si es socio, si no CTA de membresía) */}
          <SectionLabel>Mi Suscripción</SectionLabel>
          {isSocio ? (
            <div className="mx-auto max-w-sm rounded-[14px] bg-gradient-to-br from-accent to-gold-deep p-[18px] text-center">
              <span className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white">
                Activa
              </span>
              <h3 className="type-display mt-2 text-[22px] text-white">Socio CCM VIP</h3>
              <p className="mt-1.5 text-[10px] text-white/80">Tu membresía premium está activa</p>
              <Link
                to="/membresia"
                className="mt-3.5 inline-block rounded-[8px] bg-white px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-accent transition-transform active:scale-[0.98]"
              >
                Ver detalles
              </Link>
            </div>
          ) : (
            <Link
              to="/membresia"
              className="mx-auto flex max-w-sm items-center justify-between gap-3 rounded-[14px] border border-accent/30 bg-gradient-to-br from-ink to-brown-warm p-[18px] text-left transition-transform active:scale-[0.99]"
            >
              <div>
                <div className="eyebrow text-[8px] text-accent">Membresía</div>
                <div className="type-serif mt-1 text-[15px] text-night-ink">Hacete Socio CCM VIP</div>
                <div className="mt-1 text-[10px] text-text-2">Capacitaciones · descuentos · eventos VIP</div>
              </div>
              <span className="shrink-0 rounded-[8px] bg-accent px-3.5 py-2 text-[10px] font-bold uppercase text-white">
                Quiero ser VIP
              </span>
            </Link>
          )}

          {/* Mis Beneficios (2-col: base + destacado, → /beneficios) */}
          <SectionLabel>Mis Beneficios</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5">
            <Link
              to="/beneficios"
              className="rounded-[12px] border-2 border-transparent bg-white p-3.5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-transform active:scale-[0.98]"
            >
              <div className="text-[28px]">🎁</div>
              <div className="type-serif mt-2 text-[13px] text-ink">Beneficios Socio</div>
              <div className="mt-1 text-[9px] leading-[1.4] text-text-3">Acceso a descuentos y ofertas básicas</div>
              <div className="mt-2.5 text-[10px] font-bold text-accent">Ver →</div>
            </Link>
            <Link
              to="/beneficios"
              className="rounded-[12px] border-2 border-accent bg-gradient-to-br from-ink to-brown-warm p-3.5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-transform active:scale-[0.98]"
            >
              <div className="text-[28px]">⭐</div>
              <div className="type-serif mt-2 text-[13px] text-night-ink">Beneficios VIP</div>
              <div className="mt-1 text-[9px] leading-[1.4] text-text-2">Acceso premium y exclusivo</div>
              <div className="mt-2.5 text-[10px] font-bold text-accent">Ver →</div>
            </Link>
          </div>
        </>
      )}

      {/* Slot discreto de sponsor (S6) */}
      <AdBanner slot="S6" className="mt-16" />
    </div>
  )
}
