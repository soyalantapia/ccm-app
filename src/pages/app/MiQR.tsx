import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Minus, Plus, Star } from 'lucide-react'
import { AdBanner, Badge, Button, EmptyState, SectionTitle, Stat } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import { registerFree } from '../../lib/actions'
import { FIELD_META } from '../../lib/profileRequest'
import { AccreditationCard } from '../../features/app/AccreditationCard'
import { AddToCalendar } from '../../features/app/AddToCalendar'
import { AppSection } from '../../features/app/AppSection'
import { ProfileCompleteCard } from '../../features/app/ProfileCompleteCard'
import { ProfileFieldRow } from '../../features/app/ProfileFieldRow'
import { InscripcionItem, SectionLabel } from '../../features/app/mockup'
import { APPLICATION_STATUS_META, ORDER_STATUS_META, formatDay, registrationSortKey } from '../../features/app/meta'
import type { ProfileFieldKey, Registration } from '../../data/types'

const FIELD_ORDER = Object.keys(FIELD_META) as ProfileFieldKey[]

/**
 * Renderiza el inscripcion-item del mockup, para los DOS niveles de inscripción.
 *
 * Antes descartaba con `return null` toda inscripción sin bloque, o sea las que son al evento
 * entero: anotarse a un Camino o a una capacitación no aparecía en ningún lado. La clienta pidió
 * un "sub-registro por evento" creyendo que no existía — existe hace rato, sólo que no se veía.
 */
function InscripcionRow({ registration }: { registration: Registration }) {
  const block = useStore((s) => (registration.blockId ? s.getBlock(registration.blockId) : undefined))
  const event = useStore((s) => s.getEventById(registration.eventId))
  if (block) {
    return <InscripcionItem hora={block.start} titulo={block.title} plataforma={`${block.kind} · ${block.room}`} />
  }
  // Inscripción al evento entero: no hay horario de actividad, se muestra la fecha del evento.
  if (!event) return null
  return <InscripcionItem hora={event.dateLabel} titulo={event.title} plataforma={event.venue} />
}

/**
 * Mi QR — el HUB personal (D-hub): acreditación primero (uso puerta, 1 toque),
 * después agenda, entradas, membresía, beneficios, fotos y datos. Absorbe el
 * viejo /perfil (datos, postulaciones, actividad, permisos — plegados al fondo).
 */
export default function MiQR() {
  const navigate = useNavigate()

  useEffect(() => {
    store.track('qr_view')
  }, [])

  const registrations = useStore((s) => s.getRegistrations().filter((r) => r.status === 'confirmada'))
  const orders = useStore((s) => s.getOrders())
  const mainEvent = useStore((s) => s.getEventById(IDS.events.principal))
  const isSocio = useStore((s) => s.isSocio())
  const profile = useStore((s) => s.getProfile())
  const applications = useStore((s) => s.getMyApplications().filter((a) => !a.fromSeed))
  const favoritesCount = useStore((s) => s.getFavorites().length)
  const downloadsCount = useStore((s) => s.getDownloads().length)
  const registered = registrations.length > 0
  /** Compró entradas VIP (con o sin inscripción gratuita): su compra tiene que verse igual. */
  const hasOrders = orders.length > 0

  // Todas las inscripciones confirmadas, de los dos niveles: a una actividad de la grilla y al
  // evento entero. El filtro por blockId escondía las segundas por completo.
  const blockRegistrations = [...registrations].sort((a, b) =>
    registrationSortKey(a).localeCompare(registrationSortKey(b)),
  )

  const camino = store.getConvocatoria(IDS.convocatoriaSlugs.camino)

  const consents = [
    { key: 'terms', label: 'Términos y Política de Privacidad', ts: profile.consents.terms },
    { key: 'news', label: 'Novedades de CCM', ts: profile.consents.news },
    { key: 'sponsors', label: 'Beneficios de sponsors', ts: profile.consents.sponsors },
  ]

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:py-20 lg:max-w-3xl">
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
            // Antes decía "y en cada sala. No hace falta imprimir nada". Las dos cosas son
            // promesas que la operación no puede cumplir: no hay control por sala —la entrada
            // se modela por jornada, no por actividad— y nadie puede garantizar hoy que el
            // código alcance solo. Se mantiene "mostrala en el acceso" porque el escaneo en
            // puerta sí está decidido.
            ? 'Mostrala en el acceso al evento. Es tu entrada: tenela a mano en el teléfono.'
            : undefined
        }
      />

      {!registered ? (
        /* Sin inscripción no hay acreditación, pero eso NO significa "no tenés nada": quien
           compró una entrada VIP y todavía no se inscribió gratis leía "Todavía no tenés tu QR"
           justo después de que el checkout le prometió que su compra iba a aparecer acá. */
        <EmptyState
          className="mt-6"
          title={hasOrders ? 'Tu compra quedó registrada' : 'Todavía no tenés tu QR'}
          action={<Button onClick={() => void registerFree(navigate)}>Registrate gratis</Button>}
        >
          {hasOrders
            ? 'Más abajo ves el estado de tu entrada VIP. Para tener además tu acreditación con QR te falta la inscripción gratuita: es un toque y queda lista acá.'
            : 'La entrada general es gratuita con inscripción obligatoria. Registrate y tu acreditación aparece acá, lista para mostrar en la puerta.'}
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

        </>
      )}

      {/* ── Hub personal: visible con o sin registro ── */}

      {/* Entradas VIP con estado de la orden MP.
          Vive FUERA del ternario a propósito: estaba dentro de la rama "registrado", así que
          quien compraba VIP sin inscribirse gratis no veía su compra por ningún lado. Lo mismo
          valía para Mi Suscripción y Mis Beneficios: un socio sin inscripción no veía su
          membresía activa. Comprar y ser socio son independientes de la inscripción gratuita. */}
      {hasOrders && (
        <AppSection eyebrow="Tus entradas VIP">
          <div className="border-b border-line">
            {orders.map((o) => {
              const plan = store.getPlan(o.planId)
              const meta = ORDER_STATUS_META[o.status]
              return (
                <article key={o.id} className="flex items-center justify-between gap-4 border-t border-line py-4">
                  <div className="min-w-0">
                    <h3 className="type-serif truncate text-lg text-ink">
                      {/* Nombre resuelto por el server en la orden: una entrada retirada de la
                          venta no está en getPlan, y sin esto se veía el id crudo. */}
                      {o.planName ?? plan?.name ?? o.planId}
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
        <div className="mx-auto max-w-sm rounded-[14px] bg-gradient-to-br from-accent to-gold-deep p-[18px] text-center lg:max-w-md lg:p-7">
          <span className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white lg:text-[10px]">
            Activa
          </span>
          <h3 className="type-display mt-2 text-[22px] text-white lg:text-[28px]">Socio CCM VIP</h3>
          <p className="mt-1.5 text-[10px] text-white/80 lg:text-[12.5px]">Tu membresía premium está activa</p>
          <Link
            to="/membresia"
            className="mt-3.5 inline-block rounded-[8px] bg-white px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-accent transition-transform active:scale-[0.98] lg:px-6 lg:text-[12px]"
          >
            Ver detalles
          </Link>
        </div>
      ) : (
        <Link
          to="/membresia"
          className="mx-auto flex max-w-sm items-center justify-between gap-3 rounded-[14px] border border-accent/30 bg-gradient-to-br from-ink to-brown-warm p-[18px] text-left transition-transform active:scale-[0.99] lg:max-w-md lg:p-6"
        >
          <div>
            <div className="eyebrow text-[8px] text-accent lg:text-[10px]">Membresía</div>
            <div className="type-serif mt-1 text-[15px] text-night-ink lg:text-[18px]">Hacete Socio CCM VIP</div>
            <div className="mt-1 text-[10px] text-text-2 lg:text-[12.5px]">Capacitaciones · descuentos · eventos VIP</div>
          </div>
          <span className="shrink-0 rounded-[8px] bg-accent px-3.5 py-2 text-[10px] font-bold uppercase text-white">
            Quiero ser VIP
          </span>
        </Link>
      )}

      {/* Mis Beneficios (2-col: base + destacado, → /beneficios) */}
      <SectionLabel>Mis Beneficios</SectionLabel>
      <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
        <Link
          to="/beneficios"
          className="rounded-[12px] border-2 border-transparent bg-white p-3.5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-transform active:scale-[0.98] lg:p-5"
        >
          <div className="text-[28px] lg:text-[36px]">🎁</div>
          <div className="type-serif mt-2 text-[13px] text-ink lg:text-[16px]">Beneficios Socio</div>
          <div className="mt-1 text-[9px] leading-[1.4] text-text-3 lg:text-[11px]">Acceso a descuentos y ofertas básicas</div>
          <div className="mt-2.5 text-[10px] font-bold text-accent lg:text-[11px]">Ver →</div>
        </Link>
        <Link
          to="/beneficios"
          className="rounded-[12px] border-2 border-accent bg-gradient-to-br from-ink to-brown-warm p-3.5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-transform active:scale-[0.98] lg:p-5"
        >
          <div className="text-[28px] lg:text-[36px]">⭐</div>
          <div className="type-serif mt-2 text-[13px] text-night-ink lg:text-[16px]">Beneficios VIP</div>
          <div className="mt-1 text-[9px] leading-[1.4] text-text-2 lg:text-[11px]">Acceso premium y exclusivo</div>
          <div className="mt-2.5 text-[10px] font-bold text-accent lg:text-[11px]">Ver →</div>
        </Link>
      </div>

      {/* Mis Fotos (favoritas + descargas → /fotos) */}
      <SectionLabel>Mis Fotos</SectionLabel>
      <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
        <Link
          to="/fotos"
          className="rounded-[12px] border-2 border-transparent bg-white p-3.5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-transform active:scale-[0.98] lg:p-5"
        >
          <div className="text-[28px] lg:text-[36px]">🤍</div>
          <div className="type-serif mt-2 text-[13px] text-ink lg:text-[16px]">
            {favoritesCount} {favoritesCount === 1 ? 'favorita' : 'favoritas'}
          </div>
          <div className="mt-1 text-[9px] leading-[1.4] text-text-3 lg:text-[11px]">Las fotos que marcaste con el corazón</div>
          <div className="mt-2.5 text-[10px] font-bold text-accent lg:text-[11px]">Ver →</div>
        </Link>
        <Link
          to="/fotos"
          className="rounded-[12px] border-2 border-transparent bg-white p-3.5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-transform active:scale-[0.98] lg:p-5"
        >
          <div className="text-[28px] lg:text-[36px]">📸</div>
          <div className="type-serif mt-2 text-[13px] text-ink lg:text-[16px]">
            {downloadsCount} {downloadsCount === 1 ? 'descarga' : 'descargas'}
          </div>
          <div className="mt-1 text-[9px] leading-[1.4] text-text-3 lg:text-[11px]">Tus fotos del evento en alta calidad</div>
          <div className="mt-2.5 text-[10px] font-bold text-accent lg:text-[11px]">Ver →</div>
        </Link>
      </div>

      {/* Mis Datos — progressive profiling (antes en /perfil) */}
      <SectionLabel>Mis Datos</SectionLabel>
      <ProfileCompleteCard />
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        Acá podés ver y corregir cada dato por separado cuando quieras.
      </p>
      <div className="mt-4 border-b border-line">
        {FIELD_ORDER.map((field) => (
          <ProfileFieldRow key={field} field={field} />
        ))}
      </div>

      {/* Lo administrativo, plegado al fondo (antes en /perfil) */}
      <details className="group mt-10 rounded-[12px] border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
          <span className="eyebrow text-[10px] text-ink-soft">Postulaciones · Actividad · Permisos</span>
          <Plus
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-ink-soft transition-transform duration-300 group-open:rotate-45"
          />
        </summary>
        <div className="space-y-8 border-t border-line px-4 pb-6 pt-5">
          <div>
            <div className="eyebrow text-[10px] text-accent-strong">Tus postulaciones</div>
            {applications.length === 0 ? (
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                Todavía no te postulaste a ninguna convocatoria.{' '}
                <Link
                  to={`/c/${IDS.convocatoriaSlugs.camino}`}
                  className="text-ink underline decoration-accent underline-offset-4 transition-colors hover:text-accent"
                >
                  Conocé el Camino a CCM
                </Link>
                .
              </p>
            ) : (
              <div className="mt-2 border-b border-line">
                {applications.map((a) => {
                  const meta = APPLICATION_STATUS_META[a.status]
                  return (
                    <article key={a.id} className="flex items-center justify-between gap-4 border-t border-line py-4">
                      <div className="min-w-0">
                        <h3 className="type-serif truncate text-lg text-ink">
                          {camino && a.convocatoriaId === camino.id ? camino.title : 'Convocatoria CCM'}
                        </h3>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          Enviada el {formatDay(a.ts)}
                          {a.decidedAt ? ` · resuelta el ${formatDay(a.decidedAt)}` : ''}
                        </p>
                      </div>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <div className="eyebrow text-[10px] text-accent-strong">Tu actividad</div>
            <div className="mt-4 grid grid-cols-3 gap-6">
              <Stat value={registrations.length} label="Inscripciones" />
              <Stat value={downloadsCount} label="Descargas" />
              <Stat value={favoritesCount} label="Favoritos" />
            </div>
          </div>

          <div>
            <div className="eyebrow text-[10px] text-accent-strong">Consentimientos</div>
            <div className="mt-2 border-b border-line">
              {consents.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-4 border-t border-line py-3.5">
                  <span className="text-sm text-ink">{c.label}</span>
                  {c.ts ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-success">
                      <Check size={13} /> {formatDay(c.ts)}
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft/60">
                      <Minus size={13} /> No otorgado
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>

      {/* Nota legal — sin logout (D22): tu dispositivo es tu cuenta */}
      <p className="mt-10 text-center text-[11px] leading-relaxed text-ink-soft/70">
        Tu dispositivo es tu cuenta: no hay contraseñas ni cierre de sesión. Tus datos se usan solo
        para la experiencia CCM.{' '}
        <Link
          to="/privacidad"
          className="underline decoration-accent underline-offset-2 transition-colors hover:text-ink"
        >
          Política de Privacidad
        </Link>
      </p>

      {/* Slot discreto de sponsor (S6) */}
      <AdBanner slot="S6" className="mt-10" />
    </div>
  )
}
