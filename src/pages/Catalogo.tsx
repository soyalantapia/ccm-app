import { useMemo, useState, type ReactNode } from 'react'
import { LayoutGrid, Shirt, Palette, UtensilsCrossed, Sparkles, Leaf, Plane, Cpu, Tag, type LucideIcon } from 'lucide-react'
import { SectionTitle } from '../components/ui'
import { SponsorCarousel } from '../features/ads/SponsorCarousel'
import { useStore } from '../data/store'
import { ParticipanteCard } from '../features/catalogo/ParticipanteCard'
import { DesignerCard, SectionEmpty, SectionLabel, SponsorCuadrado } from '../features/app/mockup'

/** Normaliza nombre de plataforma a clave estable: minúsculas, sin acentos, trim. */
function platKey(p: string): string {
  return p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Los "siete mundos" → ícono lucide. Keyed por clave normalizada (sin acentos). */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  moda: Shirt,
  arte: Palette,
  gastronomia: UtensilsCrossed,
  belleza: Sparkles,
  sustentabilidad: Leaf,
  turismo: Plane,
  tecnologia: Cpu,
}

/** Ícono para una plataforma; DEFAULT Tag para plataformas nuevas/desconocidas. */
function categoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[platKey(name)] ?? Tag
}

/** Glifo de categoría para el SectionLabel: dorado, dos tamaños togglados (mobile 13 / desktop 16),
 *  porque no se puede lg: un prop size (convención crítica). */
function CategoryGlyph({ name }: { name: string }) {
  const I = categoryIcon(name)
  return (
    <>
      <I size={13} strokeWidth={2} className="shrink-0 text-accent lg:hidden" aria-hidden />
      <I size={16} strokeWidth={1.75} className="hidden shrink-0 text-accent lg:block" aria-hidden />
    </>
  )
}

/** filtro-btn de los mockups: pill; inactivo crema apagado, activo oscuro + dorado. */
function Chip({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: LucideIcon; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[20px] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em] transition-colors lg:gap-2 lg:rounded-[24px] lg:px-5 lg:py-2.5 lg:text-[13px] ${
        active ? 'bg-ink text-accent' : 'bg-cream-muted text-ink'
      }`}
    >
      <Icon size={14} strokeWidth={2} className="shrink-0 lg:hidden" aria-hidden />
      <Icon size={17} strokeWidth={1.75} className="hidden shrink-0 lg:block" aria-hidden />
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
      {/* Cabecera editorial — solo desktop (estándar de página del sitio) */}
      <div className="hidden lg:block lg:px-8 lg:pt-14">
        <SectionTitle
          eyebrow="El ecosistema · Siete mundos"
          title="Participantes"
          lead="Diseñadores, marcas e influencers verificados del catálogo CCM, curados por plataforma."
        />
      </div>

      {/* Filtros (chips scroll horizontal) */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 py-3 lg:flex-wrap lg:gap-2.5 lg:overflow-x-visible lg:px-8 lg:py-4 lg:pt-8">
        <Chip active={!platform} onClick={() => setPlatform(null)} icon={LayoutGrid}>
          Todas
        </Chip>
        {platforms.map((pl) => (
          <Chip key={pl} active={platform === pl} onClick={() => setPlatform(pl)} icon={categoryIcon(pl)}>
            {pl}
          </Chip>
        ))}
      </div>

      <div className="px-5 lg:px-8">
        <SponsorCarousel />

        {platform ? (
          /* ── Catálogo por plataforma (designer-grid) ── */
          <>
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <CategoryGlyph name={platform} />
                Catálogo de {platform}
              </span>
            </SectionLabel>
            {selected.length > 0 ? (
              <div
                className={`grid grid-cols-2 gap-2.5 lg:gap-4 ${
                  // Las columnas se ajustan a la cantidad: una plataforma con 1-2 fichas ya no
                  // deja 3 columnas vacías al costado (Tecnología/Turismo suelen ser chicas).
                  selected.length >= 4 ? 'lg:grid-cols-4' : selected.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
                }`}
              >
                {selected.map((p) => (
                  <DesignerCard key={p.id} profile={p} />
                ))}
              </div>
            ) : (
              <SectionEmpty
                icon={<Sparkles className="mx-auto text-accent/60" size={44} strokeWidth={1.25} aria-hidden />}
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
          groups.map((g) => (
            <section key={g.platform}>
              <SectionLabel>
                <span className="inline-flex items-center gap-1.5">
                  <CategoryGlyph name={g.platform} />
                  {g.platform}
                </span>
              </SectionLabel>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                {g.items.map((p) => (
                  <ParticipanteCard key={p.id} profile={p} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  )
}
