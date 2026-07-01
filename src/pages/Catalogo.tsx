import { useMemo, useState, type ReactNode } from 'react'
import { AdBanner } from '../components/ui'
import { useStore } from '../data/store'
import { ParticipanteCard } from '../features/catalogo/ParticipanteCard'
import { SectionLabel, SectionEmpty } from '../features/app/mockup'

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

/** Participantes (mockup): chips por plataforma → banner global → secciones por
 *  plataforma (section-label + participante-cards) con sponsor-banners intercalados. */
export default function Catalogo() {
  const catalog = useStore((s) => s.getCatalog())
  const [platform, setPlatform] = useState<string | null>(null)

  const platforms = useMemo(() => [...new Set(catalog.map((p) => p.platform))], [catalog])
  const groups = useMemo(
    () =>
      platforms
        .filter((pl) => !platform || pl === platform)
        .map((pl) => ({ platform: pl, items: catalog.filter((p) => p.platform === pl) }))
        .filter((g) => g.items.length > 0),
    [catalog, platforms, platform],
  )

  return (
    <section className="mx-auto max-w-2xl pb-6">
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
        {/* Sponsor global de participantes */}
        <AdBanner slot="S2" />

        {groups.length === 0 ? (
          <div className="mt-4">
            <SectionEmpty
              icon="✨"
              title="Nadie por acá todavía"
              sub="Pronto vas a ver a los participantes de esta plataforma."
            />
          </div>
        ) : (
          groups.map((g, gi) => (
            <section key={g.platform}>
              <SectionLabel>{g.platform}</SectionLabel>
              <div className="flex flex-col gap-2.5">
                {g.items.map((p) => (
                  <ParticipanteCard key={p.id} profile={p} />
                ))}
              </div>
              {/* Sponsor-banner intercalado cada 2 plataformas (cadencia del mockup) */}
              {gi % 2 === 1 && <AdBanner slot="S2" index={gi} className="mt-4" />}
            </section>
          ))
        )}
      </div>
    </section>
  )
}
