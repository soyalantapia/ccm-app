import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { ButtonLink, Card, Img, SectionTitle } from '../../components/ui'
import { useStore } from '../../data/store'
import { IDS } from '../../data/ids'

/** Próximos Caminos a CCM (PRD §6.1.6) — los 2 eventos previos con postulación. */
export function CaminosSection() {
  const caminos = useStore((s) =>
    s
      .getEvents()
      .filter((e) => e.type === 'camino' && !e.past)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 2),
  )

  if (caminos.length === 0) return null

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <SectionTitle
        eyebrow="Próximos Caminos a CCM"
        title={
          <>
            El camino <em className="text-accent">empieza</em> antes
          </>
        }
        lead="Encuentros previos del ecosistema: charlas, networking y desfiles cápsula rumbo a la 14ª edición."
      />
      <div className="mt-10 grid gap-8 md:mt-14 md:grid-cols-2 md:gap-10">
        {caminos.map((ev, i) => (
          <Card key={ev.id} tone="surface" hover className={`group overflow-hidden ${i === 1 ? 'md:mt-12' : ''}`}>
            <Link to={`/eventos/${ev.slug}`} className="block">
              <Img
                src={ev.cover}
                alt={ev.title}
                ratio="16/10"
                imgClassName="transition duration-700 group-hover:scale-[1.04]"
              />
            </Link>
            <div className="p-6 md:p-7">
              <div className="eyebrow text-[10px] text-accent">
                {ev.dateLabel}
                {ev.timeLabel ? ` · ${ev.timeLabel}` : ''}
              </div>
              <h3 className="type-serif mt-2.5 text-2xl leading-snug text-ink">{ev.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{ev.description}</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <ButtonLink to={`/c/${IDS.convocatoriaSlugs.camino}`} size="sm">
                  Quiero participar
                </ButtonLink>
                <Link
                  to={`/eventos/${ev.slug}`}
                  className="eyebrow group/link flex items-center gap-1 text-[10px] text-ink-soft transition-colors hover:text-ink"
                >
                  Ver ficha
                  <ArrowUpRight size={12} className="transition-transform duration-200 group-hover/link:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}
