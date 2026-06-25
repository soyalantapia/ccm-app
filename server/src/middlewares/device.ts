import type { RequestHandler } from 'express'
import { unauthorized } from '../lib/errors.js'
import { verifyDeviceToken } from '../lib/deviceToken.js'

/**
 * Identidad por device (canon 6 / doc 06). La identidad la EMITE el server en POST /devices
 * (token HMAC firmado, ver lib/deviceToken.ts). El front lo manda en `X-Device-Token`.
 * Acá solo VERIFICAMOS la firma (constant-time, sin tocar la DB) y, si es válida, dejamos
 * en req el id interno + el publicId. Un header inventado/ajeno NO autentica nada: cierra la
 * suplantación que existía cuando se confiaba ciegamente en X-Device-Id.
 *
 * deviceContext: setea la identidad si el token es válido (no falla si falta — rutas públicas).
 * requireDevice: además exige identidad válida (401) — para /me y escrituras del device.
 */
export const deviceContext: RequestHandler = (req, _res, next) => {
  const token = req.header('x-device-token')?.trim()
  if (token) {
    const identity = verifyDeviceToken(token)
    if (identity) {
      req.deviceId = identity.deviceId
      req.devicePublicId = identity.publicId
    }
  }
  next()
}

export const requireDevice: RequestHandler = (req, _res, next) => {
  if (!req.deviceId) {
    next(unauthorized('DEVICE_REQUIRED', 'Falta un X-Device-Token válido (POST /devices para obtenerlo)'))
    return
  }
  next()
}
