import { readJSON, writeJSON } from './storage'
import type { DeviceProfile, ProfileFieldKey } from '../data/types'

/**
 * Identidad sin contraseñas (D22): el dispositivo ES la cuenta.
 * Se crea silenciosamente en la primera visita; los datos del perfil se
 * capturan justo a tiempo vía requireProfile() y nunca se vuelven a pedir.
 */

const KEY = 'profile'

/**
 * UUID robusto que NUNCA tira excepción.
 * crypto.randomUUID() solo existe en contexto seguro (https/localhost); si la
 * demo se abre por http/LAN/file:// lanza y deja pantalla blanca. Caemos a
 * getRandomValues y, en última instancia, a un id aleatorio simple.
 */
function uuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c?.randomUUID) {
    try {
      return c.randomUUID()
    } catch {
      // sigue al fallback
    }
  }
  if (c?.getRandomValues) {
    try {
      const bytes = c.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    } catch {
      // sigue al fallback
    }
  }
  // Último recurso: no es criptográfico, pero garantiza no romper la demo.
  const rnd = () => Math.random().toString(16).slice(2)
  return `${rnd()}${rnd()}-${Date.now().toString(16)}`
}

function blankProfile(): DeviceProfile {
  return {
    deviceId: `dev-${uuid().slice(0, 13)}`,
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

/* ─── Identidad server-side (auth de device endurecida) ───
 * El backend EMITE la identidad en POST /devices y devuelve un token firmado (HMAC).
 * El front lo guarda acá y lo manda en X-Device-Token (lib/api.ts). Antes la identidad
 * era el UUID auto-declarado en X-Device-Id, que cualquiera podía suplantar; ahora hace
 * falta el token firmado por el server. El deviceId local de arriba sigue valiendo solo
 * para el LocalDataStore (demo offline). */
const TOKEN_KEY = 'device-token'
const SERVER_ID_KEY = 'server-device-id'

/** Token de device emitido por el backend. null hasta que POST /devices responde. */
export function getDeviceToken(): string | null {
  return readJSON<string | null>(TOKEN_KEY, null)
}

/** Guarda { deviceId (publicId del server), token firmado } que devolvió POST /devices. */
export function setDeviceCredentials(deviceId: string, token: string): void {
  writeJSON(SERVER_ID_KEY, deviceId)
  writeJSON(TOKEN_KEY, token)
}

/** Purga el token+id del device. Se llama ante un 401 (token inválido/corrupto): así el próximo
 *  arranque hace POST /devices y re-emite una identidad fresca, en vez de quedar degradado para siempre. */
export function clearDeviceCredentials(): void {
  writeJSON(SERVER_ID_KEY, null)
  writeJSON(TOKEN_KEY, null)
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

/**
 * Fase A: fusiona el perfil traído del backend en el local. Conserva el deviceId
 * y createdAt locales (la clave del device no cambia); el server es la fuente de
 * verdad de los campos y consentimientos persistidos, así que pisan a los locales.
 */
export function hydrateFromRemote(remote: DeviceProfile): void {
  const local = getProfile()
  writeJSON(KEY, {
    ...local,
    fields: { ...local.fields, ...remote.fields },
    consents: { ...local.consents, ...remote.consents },
  })
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
