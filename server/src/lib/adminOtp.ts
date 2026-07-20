import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * OTP del panel de organizador (canon: S1 de docs/SECURITY.md — reemplazo del ADMIN_TOKEN
 * de un solo rol). El login es SIEMPRE por código de un solo uso al email: no hay contraseñas
 * que setear, olvidar ni filtrar.
 *
 * El código se guarda HASHEADO (nunca en claro). Un código de 6 dígitos es corto por diseño
 * —tiene que poder tipearse desde el celular— y lo que lo hace seguro no es su longitud sino
 * el triple cerco: expira a los 10 minutos, admite 5 intentos, y sólo se pueden pedir 5 códigos
 * cada 15 minutos. Eso acota el espacio de búsqueda a 25 intentos por ventana sobre 10^6.
 *
 * Todo este módulo es PURO: no toca la base ni Express. La persistencia y la mutación de
 * `attempts`/`consumedAt` las hace quien lo llama, según el veredicto. Así se puede testear
 * el corazón de la seguridad sin levantar nada.
 */

export const OTP_TTL_MIN = 10
export const OTP_MAX_ATTEMPTS = 5
export const OTP_LENGTH = 6

/** Tope de códigos emitidos por usuario en la ventana: frena el email-bombing y acota el
 *  brute-force a OTP_MAX_PER_WINDOW × OTP_MAX_ATTEMPTS intentos. */
export const OTP_MAX_PER_WINDOW = 5
export const OTP_WINDOW_MIN = 15

/** Inicio de la ventana de rate-limit (para contar los códigos recientes en la base). */
export const otpWindowStart = (now: Date): Date => new Date(now.getTime() - OTP_WINDOW_MIN * 60_000)

/** ¿Se pasó del tope de emisiones en la ventana? (la cuenta la trae quien llama). */
export const isOtpThrottled = (recentCount: number): boolean => recentCount >= OTP_MAX_PER_WINDOW

/** Cuándo vence un código emitido ahora. */
export const otpExpiry = (now: Date): Date => new Date(now.getTime() + OTP_TTL_MIN * 60_000)

/** 6 dígitos criptográficamente aleatorios, con los ceros a la izquierda que correspondan.
 *  randomInt (CSPRNG) y no Math.random: un código adivinable no sirve de nada. */
export function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
}

/** HMAC-SHA256 del código, atado al usuario y a un pepper del server. Que incluya el userId
 *  hace que el mismo código para dos personas distintas dé hashes distintos; el pepper hace
 *  que una base filtrada no alcance para revertirlo con una tabla precalculada. */
export function hashOtp(code: string, userId: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${userId}:${code}`).digest('hex')
}

/** Comparación en tiempo constante de dos hashes hex (no filtra por timing cuánto acertaste). */
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export type OtpVerdict = 'ok' | 'expired' | 'consumed' | 'too_many_attempts' | 'mismatch'

export interface OtpRecord {
  codeHash: string
  expiresAt: string | Date
  attempts: number
  consumedAt: string | Date | null
}

/**
 * Verificación PURA del código contra un registro. No muta nada.
 * El orden de los chequeos importa: primero los estados terminales del registro (ya usado,
 * vencido, sin intentos) y recién al final la comparación del hash — así un código ya consumido
 * no gasta un intento ni abre una vía para medir tiempos.
 */
export function verifyOtp(
  record: OtpRecord,
  inputCode: string,
  ctx: { now: Date; userId: string; pepper: string },
): OtpVerdict {
  if (record.consumedAt) return 'consumed'
  if (new Date(record.expiresAt).getTime() <= ctx.now.getTime()) return 'expired'
  if (record.attempts >= OTP_MAX_ATTEMPTS) return 'too_many_attempts'
  const expected = hashOtp(inputCode.trim(), ctx.userId, ctx.pepper)
  return safeEqualHex(expected, record.codeHash) ? 'ok' : 'mismatch'
}
