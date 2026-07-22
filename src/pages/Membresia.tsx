import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Lock, MessageCircle, QrCode, Sparkles, Star } from 'lucide-react'
import { Badge, Button, ButtonLink, QR, SectionTitle } from '../components/ui'
import { esDePrimerNivel } from '../features/eventos/eventMeta'
import { store, useStore } from '../data/store'
import { config } from '../config'
import { formatMoney } from '../features/tickets/format'
import { FREE_PLAN, SOCIO_PLAN, SOCIO_PRICE } from '../features/membresia/plans'
import { estaPorVenir } from '../lib/eventDate'
import { mpLinkValido } from '../lib/mpLink'

/** Link de cobro real de la membresía; null mientras no haya uno configurado. */
const mpLink = mpLinkValido(import.meta.env.VITE_MP_LINK_MEMBRESIA)

type Step = 'plans' | 'pay' | 'done'

/** Lista de capacitaciones premium con su candado — se destraba en vivo al hacerse Socio. */
function PremiumList() {
  const socio = useStore((s) => s.isSocio())
  // Sólo las que todavía se pueden aprovechar: ofrecer una capacitación vencida como beneficio
  // de la membresía sería venderle a alguien algo a lo que ya no puede entrar.
  const capacitaciones = useStore((s) =>
    s.getEvents().filter((e) => esDePrimerNivel(e) && e.socioOnly && estaPorVenir(e)),
  )
  if (capacitaciones.length === 0) return null

  return (
    <div className="mt-5 space-y-2.5">
      {capacitaciones.map((c) => (
        <div
          key={c.id}
          className={`flex items-center gap-3 rounded-md border px-4 py-3 transition-colors ${
            socio ? 'border-accent/40 bg-accent/5' : 'border-line bg-surface'
          }`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              socio ? 'bg-accent text-accent-ink' : 'bg-ink/8 text-ink-soft'
            }`}
          >
            {socio ? <Check size={15} strokeWidth={2.5} /> : <Lock size={14} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink">{c.title}</p>
            <p className="eyebrow text-[9px] text-ink-soft/70">{c.dateLabel}</p>
          </div>
          {socio ? (
            <Link to={`/eventos/${c.slug}`} className="eyebrow shrink-0 text-[9px] text-accent-strong hover:underline">
              Acceder
            </Link>
          ) : (
            <span className="eyebrow shrink-0 text-[9px] text-ink-soft/60">Solo Socios</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Membresia() {
  const alreadySocio = useStore((s) => s.isSocio())
  const [step, setStep] = useState<Step>(alreadySocio ? 'done' : 'plans')

  useEffect(() => {
    store.track('membership_view')
  }, [])

  const pay = () => {
    store.becomeSocio(SOCIO_PRICE)
    setStep('done')
  }

  // Gate reactivo desde la fuente de verdad (isSocio): becomeSocio setea la membresía optimista
  // (isSocio→true al instante) y la REVIERTE si el server rechaza. Antes el OR con el flag pegajoso
  // step==='done' dejaba "Membresía activa" tras un rechazo (falso éxito contradictorio con la lista).
  const isMember = alreadySocio

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 md:py-16">
      <SectionTitle
        align="center"
        eyebrow="Membresías · CCM"
        title={
          isMember ? (
            <>
              Sos <em className="text-accent">Socio CCM</em>
            </>
          ) : (
            <>
              Sumate como <em className="text-accent">Socio</em>
            </>
          )
        }
        lead={
          isMember
            ? 'Ya tenés todo el ecosistema CCM desbloqueado. Estos son tus beneficios.'
            : 'Entrar y vivir el evento es gratis. La membresía Socio te abre las capacitaciones, la zona VIP, el contenido exclusivo y los descuentos.'
        }
      />

      {/* ─── Estado socio / éxito ─── */}
      {isMember ? (
        <div className="mt-10">
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-7 text-center md:p-10">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Star size={26} strokeWidth={2} />
            </span>
            <h2 className="type-display mt-5 text-3xl text-ink">Membresía activa</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
              {step === 'done' && !alreadySocio
                ? 'Listo: tu membresía Socio CCM quedó activa. Se desbloqueó todo el ecosistema.'
                : 'Tu membresía Socio CCM está activa. Disfrutá los beneficios.'}
            </p>

            <div className="mx-auto mt-7 grid max-w-2xl gap-3 sm:grid-cols-2">
              {SOCIO_PLAN.benefits.map((b) => (
                <div key={b.title} className="flex items-start gap-3 rounded-md border border-line bg-surface p-4 text-left">
                  <Check size={16} strokeWidth={2.5} className="mt-0.5 shrink-0 text-accent-strong" />
                  <div>
                    <p className="text-sm font-medium text-ink">{b.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{b.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <h3 className="eyebrow text-[10px] text-ink-soft">Tus capacitaciones premium</h3>
            <PremiumList />
          </div>

          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <ButtonLink to="/eventos" size="lg">
              Ver capacitaciones <ArrowRight size={15} />
            </ButtonLink>
            <ButtonLink to="/perfil" variant="outline" size="lg">
              Ver mi perfil
            </ButtonLink>
          </div>
        </div>
      ) : step === 'plans' ? (
        <>
          {/* ─── Comparativa de niveles ─── */}
          <div className="mt-10 grid items-stretch gap-5 md:grid-cols-2 lg:gap-8">
            {/* Gratis */}
            <div className="flex flex-col rounded-lg border border-line bg-surface p-6 md:p-7">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="type-serif text-2xl text-ink">{FREE_PLAN.name}</h3>
                <Badge tone="outline">Actual</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{FREE_PLAN.tagline}</p>
              <p className="type-display mt-5 text-4xl text-ink">$0</p>
              <ul className="mt-6 space-y-3 border-t border-line pt-5">
                {FREE_PLAN.benefits.map((b) => (
                  <li key={b.title} className="flex items-start gap-2.5 text-sm text-ink-soft">
                    <Check size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-soft/50" />
                    <span>
                      {b.title}
                      {/* Detalle solo desktop: sin él la card quedaba con ~200px de vacío
                          frente a la card Socio (items-stretch) */}
                      <span className="hidden text-xs leading-relaxed text-ink-soft/60 lg:block">{b.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-auto pt-6 text-center text-[11px] text-ink-soft/70">
                Ya lo tenés con tu registro
              </p>
            </div>

            {/* Socio CCM */}
            <div className="relative flex flex-col rounded-lg border-2 border-accent bg-night p-6 text-night-ink md:p-7">
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-ink">
                <Sparkles size={12} /> Recomendado
              </span>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="type-serif text-2xl text-night-ink">{SOCIO_PLAN.name}</h3>
              </div>
              <p className="mt-1 text-sm text-night-ink/70">{SOCIO_PLAN.tagline}</p>
              <p className="type-display mt-5 text-4xl text-night-ink">
                {formatMoney(SOCIO_PLAN.price)}
                <span className="text-sm font-normal text-night-ink/50"> / edición</span>
              </p>
              <ul className="mt-6 space-y-3 border-t border-night-soft pt-5">
                {SOCIO_PLAN.benefits.map((b) => (
                  <li key={b.title} className="flex items-start gap-2.5 text-sm text-night-ink/90">
                    <Check size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-accent" />
                    <span>
                      <span className="text-night-ink">{b.title}</span>
                      <span className="block text-xs text-night-ink/55">{b.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Button size="lg" className="mt-7 w-full" onClick={() => setStep('pay')}>
                Hacerme Socio · {formatMoney(SOCIO_PLAN.price)}
              </Button>
            </div>
          </div>

          {/* Vidriera de lo que se desbloquea */}
          <div className="mt-12 border-t border-line pt-8">
            <h3 className="eyebrow text-[10px] text-ink-soft">Lo que desbloqueás como Socio</h3>
            <PremiumList />
          </div>
        </>
      ) : (
        /* ─── Paso pago con QR ─── */
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="eyebrow text-[10px] text-ink-soft">Resumen</h3>
            <dl className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Membresía</dt>
                <dd className="text-ink">{SOCIO_PLAN.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Vigencia</dt>
                <dd className="text-ink">Edición 2026</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="eyebrow text-[10px] text-ink-soft">Total</dt>
                <dd className="type-serif text-3xl text-ink">{formatMoney(SOCIO_PRICE)}</dd>
              </div>
            </dl>
            <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
              {SOCIO_PLAN.benefits.map((b) => (
                <li key={b.title} className="flex items-start gap-2.5 text-sm text-ink-soft">
                  <Check size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-accent-strong" />
                  {b.title}
                </li>
              ))}
            </ul>
            <button onClick={() => setStep('plans')} className="eyebrow mt-5 text-[9px] text-accent-strong hover:underline">
              ← Volver
            </button>
          </div>

          <div className="flex flex-col items-center rounded-md border border-line bg-surface p-6 text-center">
            {mpLink ? (
              <>
                <div className="eyebrow flex items-center gap-1.5 text-[10px] text-ink-soft">
                  <QrCode size={13} className="text-accent-strong" /> Pagá con Mercado Pago
                </div>
                <div className="mt-4 rounded-md border border-line bg-bg p-3">
                  <QR value={mpLink} size={184} />
                </div>
                <p className="mt-4 text-xs leading-relaxed text-ink-soft">
                  Escaneá el QR desde tu app de Mercado Pago y aboná{' '}
                  <strong className="text-ink">{formatMoney(SOCIO_PRICE)}</strong>.
                </p>
                <ButtonLink
                  href={mpLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outline"
                  size="md"
                  className="mt-4 w-full"
                >
                  Abrir el pago en Mercado Pago
                </ButtonLink>
              </>
            ) : (
              /* Sin link de cobro real NO mostramos QR: el que había apuntaba a una URL
                 inventada de Mercado Pago y devolvía "La página que buscás ya no existe".
                 Mejor decir la verdad que simular un pago que no se puede completar. */
              <>
                <div className="eyebrow flex items-center gap-1.5 text-[10px] text-ink-soft">
                  <MessageCircle size={13} className="text-accent-strong" /> El pago lo coordinamos con vos
                </div>
                <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                  Todavía no tenemos el pago online publicado. Escribinos por Instagram a{' '}
                  <a
                    href={config.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink underline decoration-accent underline-offset-4 transition-colors hover:text-accent"
                  >
                    {config.instagramHandle}
                  </a>{' '}
                  y el equipo de CCM te pasa cómo abonar los{' '}
                  <strong className="text-ink">{formatMoney(SOCIO_PRICE)}</strong> de la membresía.
                </p>
              </>
            )}
            <Button size="lg" className="mt-5 w-full" onClick={pay}>
              <Check size={16} strokeWidth={2} /> Ya pagué · activar membresía
            </Button>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-soft/70">
              Demo: el cobro real se confirma por webhook de Mercado Pago en producción.
            </p>
          </div>
        </div>
      )}

      {!isMember && step === 'plans' && (
        <p className="mt-10 border-t border-line pt-5 text-center text-[12px] leading-relaxed text-ink-soft/80">
          El nivel gratis siempre queda disponible: registrarte y entrar al evento no cuesta nada.
        </p>
      )}
    </div>
  )
}
