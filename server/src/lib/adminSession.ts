import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env.js'
import type { AdminRole } from '@prisma/client'

/**
 * Sesión del panel de organizador. Dos piezas que se necesitan mutuamente:
 *
 *  1. Un token firmado que el navegador guarda y devuelve en cada request. Sigue el MISMO
 *     patrón que `deviceToken.ts` (HMAC-SHA256 sobre un payload base64url) en vez de sumar
 *     una librería de JWT: el formato ya está probado en esta base y no hace falta nada más.
 *     Se firma con ADMIN_TOKEN_SECRET, distinto del DEVICE_TOKEN_SECRET — así un token de
 *     asistente jamás puede hacerse pasar por uno de organizador aunque compartan formato.
 *
 *  2. Una fila `AdminSession` en la base, que es la AUTORIDAD. El token por sí solo no alcanza:
 *     si la fila no está, la sesión no vale. Eso es lo que hace que cerrar sesión revoque de
 *     verdad y que desactivar a alguien lo saque al instante, sin esperar a que expire nada.
 *
 * `validateSession` es PURA a propósito: recibe el registro ya cargado y decide. Así se puede
 * testear toda la lógica de expiración y revocación sin base de datos.
 */

export interface AdminSessionPayload {
  s: string // AdminSession.id
  exp: number // vencimiento en ms epoch (defensa en profundidad; la fila manda igual)
}

/** Duración de la sesión. Una semana: cómodo para el organizador, corto para un token robado. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const SESSION_COOKIE = 'ccm_admin_session'

function secret(): string {
  if (!env.ADMIN_TOKEN_SECRET) throw new Error('ADMIN_TOKEN_SECRET no configurado')
  return env.ADMIN_TOKEN_SECRET
}

function hmac(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url')
}

export function signSessionToken(sessionId: string, expiresAt: Date): string {
  const payload: AdminSessionPayload = { s: sessionId, exp: expiresAt.getTime() }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${hmac(body)}`
}

/** Verifica la firma en tiempo constante y devuelve el id de sesión, o null si no sirve.
 *  Que devuelva un id NO significa que la sesión valga: eso lo decide `validateSession`
 *  contra la fila de la base. */
export function verifySessionToken(token: string): { sessionId: string } | null {
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const a = Buffer.from(sig)
  const b = Buffer.from(hmac(body))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as AdminSessionPayload
    if (typeof payload.s !== 'string' || !payload.s) return null
    if (typeof payload.exp !== 'number' || Number.isNaN(payload.exp)) return null
    return { sessionId: payload.s }
  } catch {
    return null
  }
}

export interface AdminSessionRecord {
  expiresAt: Date
  userId: string
  role: AdminRole
  userStatus: string
}

export type SessionVerdict = 'ok' | 'no_token' | 'revoked' | 'expired' | 'user_disabled'

/**
 * PURA. La sesión vale sólo si: vino un id, la fila existe (cerrar sesión la borra → revocación),
 * no venció, y la persona no está desactivada.
 */
export function validateSession(
  sessionId: string | undefined,
  rec: AdminSessionRecord | null,
  now: Date,
): SessionVerdict {
  if (!sessionId) return 'no_token'
  if (!rec) return 'revoked'
  if (rec.expiresAt.getTime() <= now.getTime()) return 'expired'
  if (rec.userStatus === 'disabled') return 'user_disabled'
  return 'ok'
}

export const sessionExpiry = (now: Date): Date => new Date(now.getTime() + SESSION_TTL_MS)
