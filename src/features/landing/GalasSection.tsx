import { ButtonLink, Img, SectionTitle } from '../../components/ui'

const GALAS = [
  {
    plan: 'Night VIP',
    show: 'Desfile de las Estrellas',
    when: 'Sábado 19 · 19 a 21 hs',
    image: 'img/hero/hero-night.jpg',
    alt: 'Gala Night VIP con el Desfile de las Estrellas',
  },
  {
    plan: 'Sunset VIP',
    show: 'Desfile Internacional',
    when: 'Domingo 20 · 18 a 20 hs',
    image: 'img/hero/hero-sunset.jpg',
    alt: 'Gala Sunset VIP con el Desfile Internacional',
  },
]

/** Experiencias de gala (PRD §6.1.5) — dark block azul noche. */
export function GalasSection() {
  return (
    <section className="bg-night text-night-ink">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <SectionTitle
          tone="night"
          eyebrow="Experiencias de gala"
          title={
            <>
              Dos noches que <em className="italic text-accent">cierran</em> cada jornada
            </>
          }
          lead="Las pasarelas centrales de la 14ª edición, con acceso exclusivo para entradas VIP."
        />
        <div className="mt-10 grid gap-8 md:mt-14 md:grid-cols-2 md:gap-10">
          {GALAS.map((g, i) => (
            <article key={g.plan} className={`group ${i === 1 ? 'md:mt-16' : ''}`}>
              <div className="relative overflow-hidden rounded-md">
                <Img
                  src={g.image}
                  alt={g.alt}
                  ratio="4/5"
                  imgClassName="transition duration-700 group-hover:scale-[1.04]"
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night/80 via-night/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                  <div className="eyebrow text-[10px] text-accent">{g.when}</div>
                  <h3 className="type-display mt-2 text-4xl text-night-ink md:text-5xl">{g.plan}</h3>
                  <p className="type-serif mt-1.5 text-lg italic text-night-ink/85">{g.show}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-5">
          <ButtonLink to="/entradas" size="lg">
            Comprá tu entrada VIP
          </ButtonLink>
          <span className="text-[13px] text-night-ink/60">Cupos reducidos por gala.</span>
        </div>
      </div>
    </section>
  )
}
