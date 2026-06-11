import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Img, SectionTitle } from '../../components/ui'
import { useStore } from '../../data/store'

/** Catálogo destacado (PRD §6.1.8) — carrusel horizontal con scroll-snap. */
export function CatalogCarousel() {
  const profiles = useStore((s) => s.getCatalog().slice(0, 8))

  if (profiles.length === 0) return null

  return (
    <section className="overflow-hidden py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionTitle
            eyebrow="Catálogo CCM"
            title={
              <>
                Los <em className="italic text-accent">protagonistas</em> del ecosistema
              </>
            }
            lead="Diseñadores, artistas, influencers y marcas verificadas, con su portfolio completo."
          />
          <Link
            to="/catalogo"
            className="eyebrow group flex items-center gap-1.5 text-[10px] text-ink-soft transition-colors hover:text-ink"
          >
            Ver catálogo completo
            <ArrowUpRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="no-scrollbar -mx-5 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 md:mt-14">
          {profiles.map((p, i) => (
            <Link
              key={p.id}
              to={`/p/${p.slug}`}
              className={`group w-[68%] shrink-0 snap-start sm:w-[42%] md:w-[30%] lg:w-[23%] ${
                i % 2 === 1 ? 'md:mt-10' : ''
              }`}
            >
              <Img
                src={p.photo}
                alt={p.name}
                ratio="4/5"
                className="rounded-md"
                imgClassName="transition duration-700 group-hover:scale-[1.04]"
              />
              <div className="mt-3.5 flex items-baseline justify-between gap-3">
                <h3 className="type-serif text-xl leading-snug text-ink transition-colors group-hover:text-accent">
                  {p.name}
                </h3>
              </div>
              <div className="eyebrow mt-1 text-[9px] text-ink-soft">
                {p.role} · {p.platform}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
