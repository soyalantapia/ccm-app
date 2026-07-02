import { readJSON, writeJSON } from './storage'
import { bus } from './bus'

/**
 * Theming por tokens (D23). Los overrides viven en localStorage (`ccm:theme`)
 * y se aplican como CSS variables sobre :root. El bus + el evento `storage`
 * hacen que un cambio en el admin retematice TODAS las pestañas al instante.
 */

export const TOKEN_KEYS = [
  'bg',
  'surface',
  'ink',
  'ink-soft',
  'line',
  'accent',
  'accent-ink',
  'night',
  'night-soft',
  'night-ink',
  'radius-sm',
  'radius-md',
  'radius-lg',
] as const

export type TokenKey = (typeof TOKEN_KEYS)[number]
export type ThemeOverrides = Partial<Record<TokenKey, string>>

// Paleta del sistema visual CCM 2026 (mockups aprobados). DEBE reflejar los mismos
// valores que :root en index.css: el pre-paint (index.html) y este DEFAULT_THEME son
// el baseline; si difieren, el editor/pre-paint reintroduce colores viejos.
export const DEFAULT_THEME: Record<TokenKey, string> = {
  bg: '#f5f0e8',
  surface: '#ffffff',
  ink: '#33261d',
  'ink-soft': '#666666',
  line: '#e1ddd5',
  accent: '#b8860b',
  'accent-ink': '#ffffff',
  night: '#33261d',
  'night-soft': '#4c392b',
  'night-ink': '#f5f0e8',
  'radius-sm': '8px',
  'radius-md': '12px',
  'radius-lg': '14px',
}

export interface ThemePreset {
  id: string
  label: string
  overrides: ThemeOverrides
}

// Dirección visual única aprobada (mockups CCM 2026). Los presets legacy
// (noche/bordeaux/esmeralda) se quitaron: reinyectaban azules/paleta vieja por
// encima de la marca. Si en el futuro hay branding por tenant, agregá variantes
// ON-brand (que no toquen la relación crema/tinta/dorado del sistema).
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'editorial', label: 'Editorial CCM', overrides: {} },
]

export function getTheme(): ThemeOverrides {
  return readJSON<ThemeOverrides>('theme', {})
}

export function applyTheme(overrides: ThemeOverrides): void {
  const root = document.documentElement
  for (const key of TOKEN_KEYS) {
    const value = overrides[key]
    if (value) root.style.setProperty(`--t-${key}`, value)
    else root.style.removeProperty(`--t-${key}`)
  }
}

export function setTheme(overrides: ThemeOverrides): void {
  writeJSON('theme', overrides) // el bus dispara applyTheme acá y en otras pestañas
}

export function initTheme(): void {
  applyTheme(getTheme())
  bus.on((key) => {
    if (key === 'theme') applyTheme(getTheme())
  })
}
