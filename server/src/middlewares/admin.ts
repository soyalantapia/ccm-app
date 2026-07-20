import type { RequestHandler } from 'express'
import { forbidden, unauthorized } from '../lib/errors.js'
import { verifySessionToken, validateSession } from '../lib/adminSession.js'
import { loadAdminSession } from '../db/adminAuth.js'
import { can, type Permission } from '../domain/adminRoles.js'

function bearerOf(req: { header(name: string): string | undefined }): string {
  const header = req.header('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/**
 * Autenticación del organizador: sesión personal, emitida por el login por código al email.
 *
 * Cada persona tiene su usuario, su rol y una sesión revocable. El rol se lee de la BASE en cada
 * request, no del token, así que bajarle permisos a alguien o darlo de baja pega en el request
 * siguiente y no dentro de una semana.
 *
 * Hasta acá convivía una segunda vía: ADMIN_TOKEN, un único secreto compartido por todo el equipo
 * que valía como OWNER. Se mantuvo mientras no estuviera confirmado que los emails llegaban —
 * cortarla antes habría dejado a todos afuera sin forma de entrar. Confirmada la entrega en
 * producción, se retiró: un secreto compartido no se puede revocar por persona, no deja rastro de
 * quién hizo qué, y no caduca.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  const token = bearerOf(req)
  if (!token) {
    next(unauthorized('ADMIN_REQUIRED', 'Falta iniciar sesión'))
    return
  }

  const parsed = verifySessionToken(token)
  if (!parsed) {
    next(unauthorized('ADMIN_SESSION_INVALID', 'Tu sesión venció o fue cerrada. Volvé a entrar.'))
    return
  }

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
