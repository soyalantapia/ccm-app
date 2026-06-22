// Augment de Express.Request con la identidad del device (la setea el middleware deviceContext).
import 'express'

declare global {
  namespace Express {
    interface Request {
      /** Device.id interno (cuid) — null si no vino X-Device-Id. */
      deviceId?: string
      /** Device.publicId = el UUID que el front conoce (X-Device-Id). */
      devicePublicId?: string
    }
  }
}
