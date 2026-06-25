import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { signDeviceToken } from '../lib/deviceToken.js'

export const devicesRouter = Router()

/**
 * POST /api/v1/devices — alta de identidad del dispositivo (sin contraseña).
 * El SERVER genera el publicId (no lo manda el cliente) y devuelve un token firmado.
 * El front guarda { deviceId, token } y manda el token en X-Device-Token de ahí en más.
 * Cubierto por el writeLimiter (anti-abuso de creación masiva de devices).
 */
devicesRouter.post('/devices', async (_req, res, next) => {
  try {
    const publicId = randomUUID()
    const device = await prisma.device.create({ data: { publicId } })
    const token = signDeviceToken(device.id, publicId)
    res.status(201).json({ deviceId: publicId, token })
  } catch (err) {
    next(err)
  }
})
