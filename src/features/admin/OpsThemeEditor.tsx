import { Eyebrow, Button, toast } from '../../components/ui'
import { useDataVersion } from '../../data/store'
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  TOKEN_KEYS,
  getTheme,
  setTheme,
  type TokenKey,
} from '../../lib/theme'

const COLOR_LABELS: Partial<Record<TokenKey, string>> = {
  bg: 'Fondo',
  surface: 'Superficie',
  ink: 'Tinta',
  'ink-soft': 'Tinta suave',
  line: 'Líneas',
  accent: 'Acento',
  'accent-ink': 'Tinta sobre acento',
  night: 'Noche',
  'night-soft': 'Noche suave',
  'night-ink': 'Tinta sobre noche',
}

const RADIUS_SLIDERS: { key: TokenKey; label: string; max: number }[] = [
  { key: 'radius-sm', label: 'Radio chico · botones y badges', max: 8 },
  { key: 'radius-md', label: 'Radio medio · cards', max: 24 },
  { key: 'radius-lg', label: 'Radio grande · sheets y modales', max: 32 },
]

const COLOR_KEYS = TOKEN_KEYS.filter((k) => !k.startsWith('radius'))

/** Swatch de muestra de un preset. */
const SWATCH_KEYS: TokenKey[] = ['bg', 'accent', 'night', 'ink']

/**
 * Editor de tema (D23 — branding por tenant, PRD §10.16). Cada cambio escribe
 * `ccm:theme` → bus + storage event → la app entera se retematiza al instante,
 * también en las otras pestañas abiertas.
 */
export function OpsThemeEditor() {
  useDataVersion() // re-render en vivo ante cualquier escritura (incl. theme de otra pestaña)
  const theme = getTheme()

  const resolve = (key: TokenKey) => theme[key] ?? DEFAULT_THEME[key]
  const merge = (key: TokenKey, value: string) => setTheme({ ...getTheme(), [key]: value })

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Branding por tenant</Eyebrow>
          <h2 className="type-serif mt-3 text-2xl text-ink">Editor de tema</h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-soft">
            Cambiá un token y toda la app se retematiza al instante — también en las otras pestañas
            abiertas.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setTheme({})
            toast('✓ Tema restaurado a Editorial CCM')
          }}
        >
          Restaurar Editorial CCM
        </Button>
      </div>

      {/* Presets */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {THEME_PRESETS.map((preset) => {
          const merged = { ...DEFAULT_THEME, ...preset.overrides }
          const active = TOKEN_KEYS.every((k) => (theme[k] ?? '') === (preset.overrides[k] ?? ''))
          return (
            <button
              key={preset.id}
              onClick={() => {
                setTheme(preset.overrides)
                toast(`✓ Tema «${preset.label}» aplicado`)
              }}
              className={`rounded-md border p-4 text-left transition-all duration-200 ${
                active
                  ? 'border-accent bg-accent/5'
                  : 'border-line bg-surface hover:-translate-y-0.5 hover:border-ink/40'
              }`}
            >
              <div className="flex gap-1.5">
                {SWATCH_KEYS.map((k) => (
                  <span
                    key={k}
                    aria-hidden
                    className="h-5 w-5 rounded-sm border border-ink/10"
                    style={{ background: merged[k] }}
                  />
                ))}
              </div>
              <div className={`eyebrow mt-3 text-[10px] ${active ? 'text-accent' : 'text-ink'}`}>
                {preset.label}
              </div>
            </button>
          )
        })}
      </div>

      {/* Avanzado: token por token */}
      <div className="mt-8">
        <div className="eyebrow text-[10px] text-ink-soft">Avanzado · token por token</div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_KEYS.map((key) => {
            const value = resolve(key)
            return (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-sm border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-ink/40"
              >
                <div className="min-w-0">
                  <div className="text-[13px] text-ink">{COLOR_LABELS[key]}</div>
                  <div className="eyebrow mt-0.5 text-[9px] text-ink-soft">{value}</div>
                </div>
                <input
                  type="color"
                  value={value}
                  onChange={(e) => merge(key, e.target.value)}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-sm border border-line bg-bg p-1"
                  aria-label={`Color ${COLOR_LABELS[key]}`}
                />
              </label>
            )
          })}
        </div>
      </div>

      {/* Radios */}
      <div className="mt-8">
        <div className="eyebrow text-[10px] text-ink-soft">Radios de borde</div>
        <div className="mt-3 grid gap-2.5 md:grid-cols-3">
          {RADIUS_SLIDERS.map(({ key, label, max }) => {
            const px = parseInt(resolve(key), 10) || 0
            return (
              <label key={key} className="block rounded-sm border border-line bg-surface px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-ink">{label}</span>
                  <span className="eyebrow text-[9px] text-ink-soft">{px}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={max}
                  value={px}
                  onChange={(e) => merge(key, `${e.target.value}px`)}
                  className="mt-2.5 w-full"
                  style={{ accentColor: 'var(--t-accent)' }}
                />
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}
