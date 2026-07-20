import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { env } from '../lib/env.js'
import { ApiError, forbidden, unauthorized } from '../lib/errors.js'
import { verifySessionToken, validateSession } from '../lib/adminSession.js'
import { loadAdminSession } from '../db/adminAuth.js'
import { can, type Permission } from '../domain/adminRoles.js'

/** Compara dos strings en tiempo constante (no filtra el largo del prefijo correcto por timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // timingSafeEqual exige mismo largo; el chequeo de largo NO es constant-time pero solo revela
  // el LARGO del token, no su contenido — igual que verifyDeviceToken (lib/deviceToken.ts).
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function bearerOf(req: { header(name: string): string | undefined }): string {
  const header = req.header('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/**
 * Autenticación del organizador. Durante la migración conviven DOS vías, en este orden:
 *
 *  1. Sesión personal (login por código al email). Es la buena: cada quien tiene su usuario,
 *     su rol y una sesión revocable. El rol se lee de la BASE en cada request, no del token,
 *     así que bajarle permisos a alguien o darlo de baja pega en el request siguiente y no
 *     dentro de una semana.
 *
 *  2. ADMIN_TOKEN, el secreto compartido de la etapa anterior. Vale como OWNER.
 *
 * La vía 2 sigue viva a propósito: mientras no esté confirmado que los emails llegan de verdad,
 * cortarla dejaría a todos afuera del panel sin forma de entrar. Se saca en un commit propio y
 * reversible una vez verificada la entrega — es el último paso de la migración.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  const token = bearerOf(req)
  if (!token) {
    next(unauthorized('ADMIN_REQUIRED', 'Falta iniciar sesión'))
    return
  }

  // Vía 1: ¿es un token de sesión firmado por nosotros?
  const parsed = verifySessionToken(token)
  if (parsed) {
    void loadAdminSession(parsed.sessionId)
      .then((rec) => {
        const verdict = validateSession(parsed.sessionId, rec, new Date())
        if (verdict !== 'ok' || !rec) {
          next(
            unauthorized(
              verdict === 'user_disabled' ? 'ADMIN_DISABLED' : 'ADMIN_SESSION_INVALID',
              verdict === 'user_disabled'
                ? 'Tu acceso fue dado de baja.'
                : 'Tu sesión venció o fue cerrada. Volvé a entrar.',
            ),
          )
          return
        }
        req.admin = { userId: rec.userId, role: rec.role, via: 'session', sessionId: parsed.sessionId }
        next()
      })
      .catch(next)
    return
  }

  // Vía 2: el secreto compartido de la etapa anterior.
  if (!env.ADMIN_TOKEN) {
    next(new ApiError(503, 'ADMIN_AUTH_DISABLED', 'Auth de admin no configurada (falta ADMIN_TOKEN)'))
    return
  }
  if (!safeEqual(token, env.ADMIN_TOKEN)) {
    next(forbidden('ADMIN_FORBIDDEN', 'Token de organizador inválido'))
    return
  }
  req.admin = { role: 'OWNER', via: 'legacy-token' }
  next()
}

/**
 * Exige una capacidad concreta. Autentica primero (delegando en requireAdmin) y recién después
 * mira el permiso: así el 401 y el 403 significan cosas distintas y ninguno filtra de más.
 *
 * El guard va en CADA ruta y no una sola vez sobre el prefijo `/admin`: así agregar una ruta
 * obliga a decidir explícitamente quién puede usarla. Hay un test que recorre las rutas montadas
 * y falla si alguna quedó sin protección.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    requireAdmin(req, res, (err?: unknown) => {
      if (err) {
        next(err)
        return
      }
      const role = req.admin?.role
      if (!role || !can(role, permission)) {
        next(forbidden('ADMIN_FORBIDDEN', 'No tenés permiso para esta acción.'))
        return
      }
      next()
    })
  }
}
