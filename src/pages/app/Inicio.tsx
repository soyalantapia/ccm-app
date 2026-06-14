import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AdBanner, Button, ButtonLink, EmptyState, Eyebrow, Img, YouTubeEmbed } from '../../components/ui'
import { useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import { registerFree } from '../../lib/actions'
import { AppSection } from '../../features/app/AppSection'
import { QuickLinks } from '../../features/app/QuickLinks'
import { RegistrationRow } from '../../features/app/RegistrationRow'
import { registrationSortKey } from '../../features/app/meta'

/** Inicio (feed) — PRD §8.1: agenda personal, Caminos, lo nuevo y slot S2. */
export default function Inicio() {
  const navigate = useNavigate()
  const firstName = useStore((s) => s.getProfile().fields.firstName?.value)
  const principal = useStore((s) => s.getEventById(IDS.events.principal))
  const registeredMain = useStore((s) => s.isRegistered(IDS.events.principal))
  const registrations = useStore((s) =>
    s
      .getRegistrations()
      .filter((r) => r.status === 'confirmada')
      .sort((a, b) => registrationSortKey(a).localeCompare(registrationSortKey(b))),
  )
  const caminos = useStore((s) => s.getEvents().filter((e) => e.type === 'camino' && !e.past).slice(0, 2))
  const contents = useStore((s) => s.getContents().slice(0, 2))

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:py-16">
      {/* Saludo editorial */}
      <header className="animate-rise">
        <Eyebrow>CCM 2026 · {principal?.dateLabel ?? '19 y 20 de septiembre'}</Eyebrow>
        <h1 className="type-display mt-4 text-balance text-[clamp(2.4rem,8vw,4rem)] text-ink">
          {firstName ? (
            <>
              Hola, <em className="text-accent">{firstName}</em>
            </>
          ) : (
            <>
              Bienvenida/o a <em className="text-accent">CCM</em>
            </>
          )}
        </h1>
      </header>

      {/* Hero CTA: registro gratuito al evento principal */}
      {!registeredMain && (
        <section className="relative mt-10 overflow-hidden rounded-md">
          <Img
            src="img/events/principal.jpg"
            alt="CCM 2026 · 14ª Edición"
            priority
            className="aspect-[4/5] sm:aspect-[16/9]"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night/90 via-night/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-9">
            <div className="eyebrow text-[10px] text-accent">Entrada general · Gratis con inscripción</div>
            <h2 className="type-display mt-2 text-balance text-3xl text-night-ink md:text-4xl">
              Asegurá tu lugar en la 14ª edición
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-night-ink/80">
              Entrada general con inscripción obligatoria: sin inscripción no se ingresa. Cupos limitados.
            </p>
            <Button className="mt-5" onClick={() => void registerFree(navigate)}>
              Registrate gratis
            </Button>
          </div>
        </section>
      )}

      {/* Tus próximos eventos */}
      <AppSection
        eyebrow="Tu agenda"
        title="Tus próximos eventos"
        link={registrations.length > 0 ? { to: '/mi-qr', label: 'Mi QR' } : undefined}
      >
        {registrations.length === 0 ? (
          <EmptyState
            title="Todavía no tenés inscripciones"
            action={
              <ButtonLink to="/eventos" variant="outline" size="sm">
                Explorar la agenda
              </ButtonLink>
            }
          >
            Charlas, masterclasses y desfiles con cupo limitado: reservá tu lugar antes de que se llene.
          </EmptyState>
        ) : (
          <div className="border-b border-line">
            {registrations.map((r) => (
              <RegistrationRow key={r.id} registration={r} showQrLink />
            ))}
          </div>
        )}
      </AppSection>

      {/* Próximos Caminos */}
      <AppSection
        eyebrow="Antes de septiembre"
        title={
          <>
            Próximos <em className="text-accent">Caminos</em>
          </>
        }
        link={{ to: '/eventos', label: 'Toda la agenda' }}
      >
        <div className="grid gap-x-8 gap-y-10 md:grid-cols-2">
          {caminos.map((ev, i) => (
            <Link key={ev.id} to={`/eventos/${ev.slug}`} className={`group block ${i === 1 ? 'md:mt-10' : ''}`}>
              <Img
                src={ev.cover}
                alt={ev.title}
                ratio="16/10"
                className="rounded-md"
                imgClassName="transition duration-700 group-hover:scale-[1.04]"
              />
              <div className="eyebrow mt-4 text-[10px] text-accent">
                {ev.dateLabel}
                {ev.timeLabel ? ` · ${ev.timeLabel}` : ''}
              </div>
              <h3 className="type-serif mt-2 text-balance text-2xl text-ink">{ev.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{ev.venue}</p>
            </Link>
          ))}
        </div>
        <Link
          to={`/c/${IDS.convocatoriaSlugs.camino}`}
          className="group mt-10 flex items-center justify-between gap-4 border-t border-line pt-5"
        >
          <div>
            <div className="eyebrow text-[10px] text-accent">Convocatoria abierta</div>
            <p className="type-serif mt-1 text-balance text-lg text-ink">
              ¿Querés estar del otro lado de la pasarela? Postulate al Camino a CCM
            </p>
          </div>
          <ArrowRight size={18} className="shrink-0 text-ink transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </AppSection>

      {/* Slot publicitario de feed (S2) */}
      <AdBanner slot="S2" className="mt-14 md:mt-20" />

      {/* Lo nuevo */}
      <AppSection eyebrow="Contenido" title="Lo nuevo" link={{ to: '/contenido', label: 'Ver todo' }}>
        <div className="grid gap-x-8 gap-y-8 md:grid-cols-2">
          {contents.map((c) => (
            <div key={c.id}>
              <YouTubeEmbed youtubeId={c.youtubeId} title={c.title} trackPayload={{ contentId: c.id }} />
              <p className="eyebrow mt-3 text-[10px] text-ink-soft">
                {c.platform}
                {c.duration ? ` · ${c.duration}` : ''}
              </p>
            </div>
          ))}
        </div>
      </AppSection>

      {/* Accesos rápidos */}
      <AppSection eyebrow="Accesos rápidos">
        <QuickLinks />
      </AppSection>
    </div>
  )
}
