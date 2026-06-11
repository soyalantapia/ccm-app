import { bus } from './bus'

const PREFIX = 'ccm:'

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
  bus.emit(key)
}

export function removeKey(key: string): void {
  localStorage.removeItem(PREFIX + key)
  bus.emit(key)
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
