import { SectionTitle } from '../../components/ui'

const PLATFORMS = [
  { name: 'Moda', desc: 'Pasarelas: el núcleo creativo del ecosistema.' },
  { name: 'Belleza', desc: 'Cosmética, skincare y demostraciones en vivo.' },
  { name: 'Turismo', desc: 'Destinos y experiencias.' },
  { name: 'Arte', desc: 'Intervenciones y galerías en vivo.' },
  { name: 'Gastronomía', desc: '"Sabores CCM": de autor, bodegas y bebidas premium.' },
  { name: 'Tecnología', desc: 'IA e innovación para la industria creativa.' },
  { name: 'Sustentabilidad', desc: 'Economía circular: el eje transversal.' },
]

/** Las 7 plataformas (PRD §6.1.4) — lista editorial numerada 01-07. */
export function PlatformsSection() {
  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <SectionTitle
          eyebrow="Las 7 plataformas"
          title={
            <>
              Un ecosistema, <em className="text-accent">siete</em> mundos
            </>
          }
          lead="Cada plataforma es un mercado propio, con sponsors exclusivos por rubro y su propia audiencia."
        />
        <ol className="mt-10 md:mt-14">
          {PLATFORMS.map((p, i) => (
            <li key={p.name} className="group border-t border-line transition-colors duration-300 last:border-b hover:bg-bg">
              <div className="grid items-baseline gap-x-6 gap-y-1 py-6 md:grid-cols-12 md:py-7">
                <span className="eyebrow text-[10px] text-accent md:col-span-1">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="type-display text-balance text-3xl text-ink transition-transform duration-300 group-hover:translate-x-1.5 md:col-span-5 md:text-[2.6rem]">
                  {p.name}
                </h3>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-soft md:col-span-6 md:mt-0">
                  {p.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
