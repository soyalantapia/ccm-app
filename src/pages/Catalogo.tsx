import { useMemo, useState, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { AdBanner } from '../components/ui'
import { useStore } from '../data/store'
import { ParticipanteCard } from '../features/catalogo/ParticipanteCard'
import { DesignerCard, SectionEmpty, SectionLabel, SponsorCuadrado } from '../features/app/mockup'

/** filtro-btn de los mockups: pill; inactivo crema apagado, activo oscuro + dorado. */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-[20px] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em] transition-colors ${
        active ? 'bg-ink text-accent' : 'bg-cream-muted text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** Participantes (mockup):
 *  - "Todas": banner global → secciones por plataforma (participante-cards).
 *  - Plataforma seleccionada: catálogo por plataforma (designer-grid) + "Sponsors de la Plataforma". */
export default function Catalogo() {
  const catalog = useStore((s) => s.getCatalog())
  const sponsors = useStore((s) => s.getSponsors())
  const [platform, setPlatform] = useState<string | null>(null)

  const platforms = useMemo(() => [...new Set(catalog.map((p) => p.platform))], [catalog])
  const groups = useMemo(
    () => platforms.map((pl) => ({ platform: pl, items: catalog.filter((p) => p.platform === pl) })).filter((g) => g.items.length > 0),
    [catalog, platforms],
  )
  const selected = platform ? catalog.filter((p) => p.platform === platform) : []

  return (
    <section className="mx-auto max-w-2xl pb-6 lg:max-w-6xl">
      {/* Filtros (chips scroll horizontal) */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 py-3">
        <Chip active={!platform} onClick={() => setPlatform(null)}>
          Todas
        </Chip>
        {platforms.map((pl) => (
          <Chip key={pl} active={platform === pl} onClick={() => setPlatform(pl)}>
            {pl}
          </Chip>
        ))}
      </div>

      <div className="px-5">
        <AdBanner slot="S2" />

        {platform ? (
          /* ── Catálogo por plataforma (designer-grid) ── */
          <>
            <SectionLabel>Catálogo de {platform}</SectionLabel>
            {selected.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
                {selected.map((p) => (
                  <DesignerCard key={p.id} profile={p} />
                ))}
              </div>
            ) : (
              <SectionEmpty
                icon="✨"
                title={`${platform} en camino`}
                sub="Pronto vas a ver a los participantes de esta plataforma."
              />
            )}

            {sponsors.length > 0 && (
              <>
                <SectionLabel>Sponsors de la Plataforma</SectionLabel>
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
                  {sponsors.slice(0, 4).map((sp) => (
                    <SponsorCuadrado key={sp.id} icon={<Sparkles size={16} />} name={sp.name} label={sp.level} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          /* ── Vista principal: agrupado por plataforma (participante-cards) ── */
          groups.map((g, gi) => (
            <section key={g.platform}>
              <SectionLabel>{g.platform}</SectionLabel>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                {g.items.map((p) => (
                  <ParticipanteCard key={p.id} profile={p} />
                ))}
              </div>
              {gi % 2 === 1 && <AdBanner slot="S2" index={gi} className="mt-4" />}
            </section>
          ))
        )}
      </div>
    </section>
  )
}
