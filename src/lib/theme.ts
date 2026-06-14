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

export const DEFAULT_THEME: Record<TokenKey, string> = {
  bg: '#f4efe3',
  surface: '#fbf8ef',
  ink: '#181410',
  'ink-soft': '#6b6353',
  line: '#ddd3bd',
  accent: '#a87d22',
  'accent-ink': '#1c1503',
  night: '#131c2e',
  'night-soft': '#1d2a42',
  'night-ink': '#f0e8d5',
  'radius-sm': '2px',
  'radius-md': '8px',
  'radius-lg': '18px',
}

export interface ThemePreset {
  id: string
  label: string
  overrides: ThemeOverrides
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'editorial', label: 'Editorial CCM', overrides: {} },
  {
    id: 'noche',
    label: 'Noche de gala',
    overrides: {
      bg: '#121a2b',
      surface: '#1a2438',
      ink: '#f1e9d6',
      'ink-soft': '#a99f88',
      line: '#2c3a55',
      accent: '#d4af4f',
      'accent-ink': '#171204',
      night: '#0a0f1c',
      'night-soft': '#141d31',
      'night-ink': '#f1e9d6',
    },
  },
  {
    id: 'bordeaux',
    label: 'Bordeaux',
    overrides: {
      accent: '#8e2f3c',
      'accent-ink': '#fdf3ec',
      night: '#2a1218',
      'night-soft': '#3b1a22',
      'night-ink': '#f4e6da',
    },
  },
  {
    id: 'esmeralda',
    label: 'Esmeralda',
    overrides: {
      accent: '#1f6f50',
      'accent-ink': '#f0f7ef',
      night: '#0e2419',
      'night-soft': '#173626',
      'night-ink': '#e8f0e2',
    },
  },
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
