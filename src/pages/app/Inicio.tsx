import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AdBanner, ButtonLink, EmptyState, YouTubeEmbed } from '../../components/ui'
import { useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import { AppSection } from '../../features/app/AppSection'
import { RegistrationRow } from '../../features/app/RegistrationRow'
import { registrationSortKey } from '../../features/app/meta'
import { HomeHeader } from '../../features/app/home/HomeHeader'
import { PrimaryActionCard } from '../../features/app/home/PrimaryActionCard'
import { ActionStrip } from '../../features/app/home/ActionStrip'
import { DiscoverRow } from '../../features/app/home/DiscoverRow'

/**
 * Inicio (feed) — PRD §8.1, estrategia app-nativa: header compacto, card de
 * acción principal (registro o carnet wallet), strip de accesos tipo stories,
 * agenda, descubrí, lo nuevo y slot S2. Módulos cortos, escaneable, accionable.
 */
export default function Inicio() {
  const firstName = useStore((s) => s.getProfile().fields.firstName?.value)
  const principal = useStore((s) => s.getEventById(IDS.events.principal))
  const registrations = useStore((s) =>
    s
      .getRegistrations()
      .filter((r) => r.status === 'confirmada')
      .sort((a, b) => registrationSortKey(a).localeCompare(registrationSortKey(b))),
  )
  const caminos = useStore((s) => s.getEvents().filter((e) => e.type === 'camino' && !e.past).slice(0, 2))
  const contents = useStore((s) => s.getContents().slice(0, 2))

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 md:py-12">
      {/* 1. Header compacto */}
      <HomeHeader firstName={firstName} dateLabel={`CCM 2026 · ${principal?.dateLabel ?? '19 y 20 sept'}`} />

      {/* 2. Card de acción principal: registro o carnet wallet */}
      <PrimaryActionCard />

      {/* 3. Strip de accesos rápidos tipo stories */}
      <ActionStrip />

      {/* 4. Tu agenda: inscripciones confirmadas */}
      <AppSection
        eyebrow="Tu agenda"
        title="Tus inscripciones"
        link={registrations.length > 0 ? { to: '/mi-qr', label: 'Mi QR' } : undefined}
      >
        {registrations.length === 0 ? (
          <EmptyState
            className="py-10"
            title="Tu agenda está vacía"
            action={
              <ButtonLink to="/eventos" variant="outline" size="sm">
                Explorar la agenda
              </ButtonLink>
            }
          >
            Charlas, masterclasses y desfiles con cupo limitado: reservá tu lugar.
          </EmptyState>
        ) : (
          <div className="border-b border-line">
            {registrations.map((r) => (
              <RegistrationRow key={r.id} registration={r} showQrLink />
            ))}
          </div>
        )}
      </AppSection>

      {/* Slot publicitario de feed (S2) */}
      <AdBanner slot="S2" className="mt-12 md:mt-16" />

      {/* 5. Descubrí: próximos Caminos compactos + postulación */}
      <AppSection
        eyebrow="Antes de septiembre"
        title={
          <>
            Próximos <em className="text-accent">Caminos</em>
          </>
        }
        link={{ to: '/eventos', label: 'Toda la agenda' }}
      >
        <div className="border-b border-line">
          {caminos.map((ev) => (
            <DiscoverRow key={ev.id} event={ev} />
          ))}
        </div>
        <Link
          to={`/c/${IDS.convocatoriaSlugs.camino}`}
          className="group mt-5 flex items-center justify-between gap-4 rounded-md border border-line bg-surface p-4 transition-colors active:scale-[0.99]"
        >
          <div className="min-w-0">
            <div className="eyebrow text-[9px] text-accent">Convocatoria abierta</div>
            <p className="type-serif mt-1 text-balance text-base text-ink">
              Postulate al <em className="text-accent">Camino a CCM</em>
            </p>
          </div>
          <ArrowRight
            size={18}
            className="shrink-0 text-ink transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Link>
      </AppSection>

      {/* 6. Lo nuevo: videos compactos */}
      <AppSection eyebrow="Contenido" title="Lo nuevo" link={{ to: '/contenido', label: 'Ver todo' }}>
        <div className="grid gap-4 sm:grid-cols-2">
          {contents.map((c) => (
            <div key={c.id}>
              <YouTubeEmbed youtubeId={c.youtubeId} title={c.title} trackPayload={{ contentId: c.id }} />
              <p className="eyebrow mt-2 text-[9px] text-ink-soft">
                {c.platform}
                {c.duration ? ` · ${c.duration}` : ''}
              </p>
            </div>
          ))}
        </div>
      </AppSection>
    </div>
  )
}
