import { ButtonLink, SectionTitle } from '../../components/ui'
import { useStore } from '../../data/store'
import type { Sponsor } from '../../data/types'

const LEVELS: { level: Sponsor['level']; label: string }[] = [
  { level: 'Principal', label: 'Sponsor principal' },
  { level: 'Oro', label: 'Nivel Oro' },
  { level: 'Plata', label: 'Nivel Plata' },
]

/** Sponsors por nivel (PRD §6.1.10) — wordmarks tipográficos sobre night. */
export function SponsorsStrip() {
  const sponsors = useStore((s) => s.getSponsors())

  return (
    <section className="bg-night text-night-ink">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <SectionTitle
          tone="night"
          eyebrow="Sponsors 2026"
          title={
            <>
              Marcas que <em className="text-accent">visten</em> el evento
            </>
          }
          lead="Cada plataforma es un mercado propio, con exclusividad por rubro y resultados medidos."
        />
        <div className="mt-10 md:mt-14">
          {LEVELS.map(({ level, label }) => {
            const group = sponsors.filter((s) => s.level === level)
            if (group.length === 0) return null
            return (
              <div
                key={level}
                className="grid gap-y-4 border-t border-night-soft py-7 last:border-b md:grid-cols-12 md:items-baseline md:gap-x-8"
              >
                <div className="eyebrow text-[10px] text-night-ink/50 md:col-span-3">{label}</div>
                <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4 md:col-span-9">
                  {group.map((s) => (
                    <div key={s.id}>
                      <span className="type-serif text-2xl text-night-ink md:text-3xl">{s.name}</span>
                      <span className="eyebrow mt-1 block text-[9px] text-night-ink/45">
                        {s.industry}
                        {s.exclusive ? ' · Exclusividad de rubro' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-5">
          <ButtonLink to="/sponsors" size="lg">
            Quiero ser sponsor
          </ButtonLink>
          <span className="text-[13px] text-night-ink/60">
            Lead gen en tiempo real, base segmentada y Reporte Técnico de Impacto.
          </span>
        </div>
      </div>
    </section>
  )
}
