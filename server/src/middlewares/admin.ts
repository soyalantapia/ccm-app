import type { RequestHandler } from 'express'
import { env } from '../lib/env.js'
import { ApiError, forbidden, unauthorized } from '../lib/errors.js'

/**
 * Auth del organizador (Fase G, temporal). Exige Authorization: Bearer <ADMIN_TOKEN>.
 * 🔶 Reemplazar por login passwordless OTP por email (doc 06) + roles AdminRole
 * cuando esté RESEND_API_KEY. Por ahora: shared secret de un solo rol (OWNER).
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!env.ADMIN_TOKEN) {
    next(new ApiError(503, 'ADMIN_AUTH_DISABLED', 'Auth de admin no configurada (falta ADMIN_TOKEN)'))
    return
  }
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    next(unauthorized('ADMIN_REQUIRED', 'Falta el token de organizador'))
    return
  }
  if (token !== env.ADMIN_TOKEN) {
    next(forbidden('ADMIN_FORBIDDEN', 'Token de organizador inválido'))
    return
  }
  next()
}
