import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge, ButtonLink, EmptyState, Eyebrow, Img, PagePending } from '../components/ui'
import { useStore } from '../data/store'
import { bus } from '../lib/bus'
import type { Application, ConvocatoriaLogo } from '../data/types'
import { ConvocatoriaForm } from '../features/convocatoria/ConvocatoriaForm'
import { ConvocatoriaSuccess } from '../features/convocatoria/ConvocatoriaSuccess'
import { ApplicationStatusPanel } from '../features/convocatoria/ApplicationStatus'
import { formatDeadline } from '../features/convocatoria/format'

/** Agrupa los logos por rubro conservando el orden de aparición del primero de cada rubro. */
function groupByRubro(logos: ConvocatoriaLogo[]): [string, ConvocatoriaLogo[]][] {
  const groups = new Map<string, ConvocatoriaLogo[]>()
  for (const l of logos) {
    const key = l.rubro ?? ''
    const arr = groups.get(key)
    if (arr) arr.push(l)
    else groups.set(key, [l])
  }
  return [...groups.entries()]
}

/** Título display con la última palabra en dorado (énfasis, sin cursiva). */
function DisplayTitle({ title }: { title: string }) {
  const words = title.split(' ')
  const last = words.pop()
  return (
    <h1 className="type-display mt-5 text-[clamp(2.6rem,9vw,5.5rem)] text-balance text-ink">
      {words.join(' ')} <em className="text-accent">{last}</em>
    </h1>
  )
}

export default function Convocatoria() {
  const { slug } = useParams<{ slug: string }>()
  const convocatoria = useStore((s) => (slug ? s.getConvocatoria(slug) : undefined))
  const hydrating = useStore((s) => s.isHydrating('convocatoria'))
  const event = useStore((s) =>
    convocatoria ? s.getEventById(convocatoria.eventId) : undefined,
  )
  /** Postulación previa de ESTE dispositivo (las del seed no cuentan). */
  const existingApplication = useStore((s) =>
    convocatoria
      ? s.getMyApplications().find((a) => a.convocatoriaId === convocatoria.id && !a.fromSeed)
      : undefined,
  )
  const [justSubmitted, setJustSubmitted] = useState<Application | null>(null)

  // Si el server rechaza el POST de la postulación (bus 'application:rejected'), sacamos la pantalla
  // de éxito: antes quedaba "postulación enviada" aunque el backend nunca la recibiera (falso éxito).
  useEffect(() => bus.on((key) => { if (key === 'application:rejected') setJustSubmitted(null) }), [])

  if (!convocatoria) {
    // Mientras el GET del slug esté en vuelo NO se puede afirmar que no existe: este link se
    // comparte para reclutar, y decirle "no encontramos esta convocatoria" a alguien que sí tiene
    // el link bueno lo hace cerrar la pestaña antes de que resuelva el pedido.
    if (hydrating) return <PagePending />
    return (
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <EmptyState
          title="No encontramos esta convocatoria"
          action={
            <ButtonLink to="/" variant="outline">
              Volver al inicio
            </ButtonLink>
          }
        >
          Puede que el link haya vencido o que la convocatoria ya esté cerrada.
        </EmptyState>
      </section>
    )
  }

  function handleSubmitted(application: Application) {
    setJustSubmitted(application)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ¿Ya cerró? El deadline es el ÚLTIMO día hábil (hasta las 23:59). Antes no se chequeaba:
  // la página decía "Convocatoria abierta" para siempre y aceptaba postulaciones tarde.
  const closed = new Date(`${convocatoria.deadline}T23:59:59`) < new Date()

  return (
    <>
      {/* ─── Hero editorial ─── */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-12 md:gap-12 md:py-20">
          <div className="md:col-span-7 animate-rise">
            <Eyebrow>{closed ? 'Convocatoria cerrada' : 'Convocatoria abierta'}</Eyebrow>
            <DisplayTitle title={convocatoria.title} />
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-soft md:text-base">
              {convocatoria.intro}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Badge tone={closed ? 'neutral' : 'accent'}>
                {closed ? 'Cerró el' : 'Cierra el'} {formatDeadline(convocatoria.deadline)}
              </Badge>
              {event && (
                <Link
                  to={`/eventos/${event.slug}`}
                  className="group eyebrow inline-flex items-center gap-2 text-[11px] text-ink transition-colors hover:text-accent"
                >
                  Conocé el encuentro
                  <ArrowRight
                    size={14}
                    aria-hidden
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              )}
            </div>
            {convocatoria.ctaLabel && convocatoria.ctaUrl && (
              <a
                href={convocatoria.ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition hover:opacity-90"
              >
                {convocatoria.ctaLabel}
                <ArrowRight size={15} aria-hidden />
              </a>
            )}
          </div>

          {event && (
            <Link
              to={`/eventos/${event.slug}`}
              className="group relative block overflow-hidden rounded-md md:col-span-5 md:mt-8"
            >
              <Img
                src={event.cover}
                alt={event.title}
                ratio="4/5"
                priority
                imgClassName="transition duration-700 group-hover:scale-[1.04]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night/80 via-night/20 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                <p className="eyebrow text-[10px] text-night-ink/80">
                  {event.dateLabel}
                  {event.timeLabel ? ` · ${event.timeLabel}` : ''}
                </p>
                <p className="type-serif mt-1.5 text-xl text-night-ink">{event.title}</p>
                <p className="eyebrow mt-3 text-[10px] text-accent">
                  Ver la ficha del encuentro →
                </p>
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* ─── Muro de logos (universidades / sponsors), agrupados por rubro ─── */}
      {convocatoria.logos && convocatoria.logos.length > 0 && (
        <section className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
            <Eyebrow>Quiénes están</Eyebrow>
            {groupByRubro(convocatoria.logos).map(([rubro, logos]) => (
              <div key={rubro || 'sin-rubro'} className="mt-8 first:mt-6">
                {rubro && <p className="eyebrow text-[10px] text-ink-soft">{rubro}</p>}
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {logos.map((l, i) => {
                    const inner = <Img src={l.logoUrl} alt={l.name} ratio="3/2" imgClassName="object-contain" />
                    return l.url ? (
                      <a
                        key={i}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-md border border-line bg-surface p-4 transition hover:border-accent"
                        aria-label={l.name}
                      >
                        {inner}
                      </a>
                    ) : (
                      <div key={i} className="rounded-md border border-line bg-surface p-4">
                        {inner}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Form / éxito / estado ─── */}
      <section className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        {justSubmitted ? (
          <ConvocatoriaSuccess event={event} />
        ) : existingApplication ? (
          <ApplicationStatusPanel
            convocatoria={convocatoria}
            application={existingApplication}
            event={event}
          />
        ) : closed ? (
          <EmptyState
            title="La convocatoria ya cerró"
            action={<ButtonLink to="/" variant="outline">Volver al inicio</ButtonLink>}
          >
            Cerró el {formatDeadline(convocatoria.deadline)}. Seguí las novedades para la próxima edición.
          </EmptyState>
        ) : (
          <div className="grid gap-10 md:grid-cols-12 md:gap-12">
            <aside className="md:col-span-4">
              <div className="md:sticky md:top-24">
                <Eyebrow>Ficha de postulación</Eyebrow>
                <h2 className="type-serif mt-4 text-2xl text-ink">Contanos quién sos</h2>
                <ol className="mt-8 space-y-6">
                  {[
                    ['01', 'Completá tu ficha con tu historia.'],
                    ['02', 'El equipo CCM la revisa con amor.'],
                    ['03', 'Te confirmamos el lugar por teléfono.'],
                  ].map(([num, step]) => (
                    <li key={num} className="flex items-baseline gap-4 border-t border-line pt-5">
                      <span className="eyebrow text-[10px] text-accent">{num}</span>
                      <span className="text-sm leading-relaxed text-ink-soft">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>

            <div className="md:col-span-8">
              <ConvocatoriaForm convocatoria={convocatoria} onSubmitted={handleSubmitted} />
            </div>
          </div>
        )}
      </section>
    </>
  )
}
