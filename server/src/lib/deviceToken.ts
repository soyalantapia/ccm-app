import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env.js'

/**
 * Token de identidad del device (canon 6/10). HMAC-SHA256 sobre un payload que liga el
 * id interno del Device, firmado con DEVICE_TOKEN_SECRET. El SERVER es el único que lo
 * emite (POST /devices); el front lo guarda y lo manda en `X-Device-Token`. Sin token
 * verificado NO hay identidad → cierra la suplantación por header (antes alcanzaba con
 * mandar el publicId ajeno). Formato compacto: `<base64url(payload)>.<base64url(hmac)>`.
 *
 * No es un JWT completo a propósito (sin libs): un device-token es un secreto portador
 * de larga vida; la rotación/expiración real llega con el login OTP (doc 06).
 */
interface DevicePayload {
  d: string // Device.id interno (cuid)
  p: string // Device.publicId
  iat: number
}

function secret(): string {
  if (!env.DEVICE_TOKEN_SECRET) throw new Error('DEVICE_TOKEN_SECRET no configurado')
  return env.DEVICE_TOKEN_SECRET
}

function hmac(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url')
}

export function signDeviceToken(deviceId: string, publicId: string): string {
  const body = Buffer.from(JSON.stringify({ d: deviceId, p: publicId, iat: Date.now() } satisfies DevicePayload)).toString('base64url')
  return `${body}.${hmac(body)}`
}

/** Verifica firma (constant-time) y devuelve la identidad, o null si el token no es válido. */
export function verifyDeviceToken(token: string): { deviceId: string; publicId: string } | null {
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = hmac(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as DevicePayload
    if (typeof payload.d !== 'string' || typeof payload.p !== 'string' || !payload.d || !payload.p) return null
    return { deviceId: payload.d, publicId: payload.p }
  } catch {
    return null
  }
}
