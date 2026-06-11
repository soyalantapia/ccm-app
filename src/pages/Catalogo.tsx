import { useMemo, useState } from 'react'
import { Button, EmptyState, SectionTitle } from '../components/ui'
import { useStore } from '../data/store'
import { CatalogCard, CatalogFilters } from '../features/catalogo'

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export default function Catalogo() {
  const catalog = useStore((s) => s.getCatalog())
  const [platform, setPlatform] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const platforms = useMemo(
    () => [...new Set(catalog.map((p) => p.platform))],
    [catalog],
  )

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return catalog.filter(
      (p) =>
        (!platform || p.platform === platform) &&
        (!q || normalize(p.name).includes(q)),
    )
  }, [catalog, platform, query])

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <SectionTitle
        eyebrow="Quiénes hacen CCM"
        title={
          <>
            Catálogo <em className="italic text-accent">CCM</em>
          </>
        }
        lead="Diseñadores, artistas, influencers y marcas: las personas que hacen latir Córdoba Corazón de Moda. Tocá un perfil y mirá su trabajo de cerca."
      />

      <CatalogFilters
        platforms={platforms}
        platform={platform}
        onPlatformChange={setPlatform}
        query={query}
        onQueryChange={setQuery}
        count={filtered.length}
      />

      {filtered.length > 0 ? (
        <div className="mt-8 animate-rise columns-2 gap-4 md:columns-3 md:gap-6">
          {filtered.map((p, i) => (
            <CatalogCard key={p.id} profile={p} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nadie por acá"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPlatform(null)
                setQuery('')
              }}
            >
              Limpiar filtros
            </Button>
          }
        >
          Probá con otra plataforma u otro nombre.
        </EmptyState>
      )}
    </section>
  )
}
