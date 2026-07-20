// Augment de Express.Request con la identidad del device (la setea el middleware deviceContext).
import 'express'
import type { AdminRole } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      /** Device.id interno (cuid) — null si no vino X-Device-Id. */
      deviceId?: string
      /** Device.publicId = el UUID que el front conoce (X-Device-Id). */
      devicePublicId?: string
      /** Organizador autenticado — lo setea requireAdmin. El rol sale SIEMPRE de la base
       *  (no del token), así que un cambio de permisos pega en el request siguiente. */
      admin?: {
        /** AdminUser.id. Ausente cuando se entró con el token compartido viejo. */
        userId?: string
        role: AdminRole
        /** Por dónde entró: la sesión nueva, o el ADMIN_TOKEN compartido de la etapa anterior. */
        via: 'session' | 'legacy-token'
        sessionId?: string
      }
    }
  }
}
