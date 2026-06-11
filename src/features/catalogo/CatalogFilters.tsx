import { Search } from 'lucide-react'
import { Input } from '../../components/ui'

interface ChipProps {
  active: boolean
  onClick: () => void
  children: string
}

function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`eyebrow shrink-0 rounded-sm border px-3.5 py-2 text-[10px] transition-colors duration-200 ${
        active
          ? 'border-ink bg-ink text-bg'
          : 'border-line text-ink-soft hover:border-ink/50 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

interface CatalogFiltersProps {
  platforms: string[]
  platform: string | null
  onPlatformChange: (platform: string | null) => void
  query: string
  onQueryChange: (query: string) => void
  count: number
}

/** Chips por plataforma (derivadas de los datos) + búsqueda por nombre. */
export function CatalogFilters({
  platforms,
  platform,
  onPlatformChange,
  query,
  onQueryChange,
  count,
}: CatalogFiltersProps) {
  return (
    <div className="mt-10 border-t border-line pt-6 md:mt-14">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
          <Chip active={platform === null} onClick={() => onPlatformChange(null)}>
            Todas
          </Chip>
          {platforms.map((p) => (
            <Chip key={p} active={platform === p} onClick={() => onPlatformChange(p)}>
              {p}
            </Chip>
          ))}
        </div>
        <div className="relative md:w-64 md:shrink-0">
          <Search
            size={15}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft/60"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar por nombre"
            className="pl-10"
          />
        </div>
      </div>
      <p className="eyebrow mt-5 text-[10px] text-ink-soft/70">
        {count} {count === 1 ? 'perfil' : 'perfiles'}
      </p>
    </div>
  )
}
