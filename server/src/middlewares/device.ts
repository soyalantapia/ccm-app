import type { RequestHandler } from 'express'
import { prisma } from '../lib/prisma.js'
import { unauthorized } from '../lib/errors.js'

/**
 * Identidad por device (canon 6 / doc 06). El front manda su UUID en el header
 * `X-Device-Id` (lib/identity.ts). En el primer contacto hacemos UPSERT del Device
 * (publicId = ese UUID) y dejamos en req el id interno + el publicId.
 *
 * deviceContext: upsert si vino el header (no falla si falta — para rutas públicas).
 * requireDevice: además exige el header (400 si falta) — para /me y escrituras del device.
 */
export const deviceContext: RequestHandler = async (req, _res, next) => {
  try {
    const publicId = req.header('x-device-id')?.trim()
    if (publicId) {
      const device = await prisma.device.upsert({
        where: { publicId },
        create: { publicId },
        update: {},
        select: { id: true, publicId: true },
      })
      req.deviceId = device.id
      req.devicePublicId = device.publicId
    }
    next()
  } catch (err) {
    next(err)
  }
}

export const requireDevice: RequestHandler = (req, _res, next) => {
  if (!req.deviceId) {
    next(unauthorized('DEVICE_REQUIRED', 'Falta el header X-Device-Id'))
    return
  }
  next()
}
