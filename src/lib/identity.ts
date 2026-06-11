import { readJSON, writeJSON } from './storage'
import type { DeviceProfile, ProfileFieldKey } from '../data/types'

/**
 * Identidad sin contraseñas (D22): el dispositivo ES la cuenta.
 * Se crea silenciosamente en la primera visita; los datos del perfil se
 * capturan justo a tiempo vía requireProfile() y nunca se vuelven a pedir.
 */

const KEY = 'profile'

function blankProfile(): DeviceProfile {
  return {
    deviceId: `dev-${crypto.randomUUID().slice(0, 13)}`,
    createdAt: new Date().toISOString(),
    fields: {},
    consents: {},
  }
}

export function ensureDevice(): DeviceProfile {
  const existing = readJSON<DeviceProfile | null>(KEY, null)
  if (existing) return existing
  const profile = blankProfile()
  writeJSON(KEY, profile)
  // track() importa identity — evitamos el ciclo registrando user_created acá.
  import('./track').then(({ track }) => track('user_created', { deviceId: profile.deviceId }))
  return profile
}

export function getProfile(): DeviceProfile {
  return readJSON<DeviceProfile | null>(KEY, null) ?? ensureDevice()
}

export function getDeviceId(): string {
  return getProfile().deviceId
}

export function saveProfileFields(
  values: Partial<Record<ProfileFieldKey, string>>,
  source: string,
): DeviceProfile {
  const profile = getProfile()
  const ts = new Date().toISOString()
  for (const [key, value] of Object.entries(values)) {
    if (!value || !value.trim()) continue
    profile.fields[key as ProfileFieldKey] = { value: value.trim(), capturedAt: ts, source }
  }
  writeJSON(KEY, profile)
  return profile
}

export function saveConsents(consents: { terms?: boolean; news?: boolean; sponsors?: boolean }): void {
  const profile = getProfile()
  const ts = new Date().toISOString()
  if (consents.terms) profile.consents.terms = ts
  if (consents.news) profile.consents.news = ts
  if (consents.sponsors) profile.consents.sponsors = ts
  writeJSON(KEY, profile)
}

export function fieldValue(key: ProfileFieldKey): string | undefined {
  return getProfile().fields[key]?.value
}

export function missingFields(fields: ProfileFieldKey[]): ProfileFieldKey[] {
  const profile = getProfile()
  return fields.filter((f) => !profile.fields[f]?.value)
}

export function displayName(): string {
  const p = getProfile()
  const first = p.fields.firstName?.value
  const last = p.fields.lastName?.value
  return [first, last].filter(Boolean).join(' ')
}

/** QR de acreditación personal: estable por dispositivo, verificable offline. */
export function qrToken(): string {
  const id = getDeviceId()
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return `CCM26-${id.replace('dev-', '').toUpperCase()}-${hash.toString(36).toUpperCase()}`
}
