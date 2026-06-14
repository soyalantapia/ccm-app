import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge, ButtonLink, EmptyState, Eyebrow, Img } from '../components/ui'
import { useStore } from '../data/store'
import type { Application } from '../data/types'
import { ConvocatoriaForm } from '../features/convocatoria/ConvocatoriaForm'
import { ConvocatoriaSuccess } from '../features/convocatoria/ConvocatoriaSuccess'
import { ApplicationStatusPanel } from '../features/convocatoria/ApplicationStatus'
import { formatDeadline } from '../features/convocatoria/format'

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
  const event = useStore((s) =>
    convocatoria ? s.getEventById(convocatoria.eventId) : undefined,
  )
  /** Postulación previa de ESTE dispositivo (las del seed no cuentan). */
  const existingApplication = useStore((s) =>
    convocatoria
      ? s.getApplications().find((a) => a.convocatoriaId === convocatoria.id && !a.fromSeed)
      : undefined,
  )
  const [justSubmitted, setJustSubmitted] = useState<Application | null>(null)

  if (!convocatoria) {
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

  return (
    <>
      {/* ─── Hero editorial ─── */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-12 md:gap-12 md:py-20">
          <div className="md:col-span-7 animate-rise">
            <Eyebrow>Convocatoria abierta</Eyebrow>
            <DisplayTitle title={convocatoria.title} />
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-soft md:text-base">
              {convocatoria.intro}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Badge tone="accent">Cierra el {formatDeadline(convocatoria.deadline)}</Badge>
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
