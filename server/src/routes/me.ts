import { Router } from 'express'
import { z } from 'zod'
import { requireDevice } from '../middlewares/device.js'
import * as deviceService from '../services/deviceService.js'

export const meRouter = Router()

const PROFILE_KEYS = [
  'firstName',
  'lastName',
  'email',
  'profession',
  'phone',
  'dni',
  'city',
  'instagram',
] as const

const fieldsSchema = z.object({
  values: z
    .object(Object.fromEntries(PROFILE_KEYS.map((k) => [k, z.string()])) as Record<
      (typeof PROFILE_KEYS)[number],
      z.ZodString
    >)
    .partial(),
  source: z.string().min(1),
})

const consentsSchema = z.object({
  terms: z.boolean().optional(),
  news: z.boolean().optional(),
  sponsors: z.boolean().optional(),
})

/** GET /api/v1/me — perfil del device (shape DeviceProfile). */
meRouter.get('/me', requireDevice, async (req, res, next) => {
  try {
    res.json(await deviceService.getProfile(req.deviceId!))
  } catch (err) {
    next(err)
  }
})

/** PATCH /api/v1/me/fields — captura progresiva de datos. */
meRouter.patch('/me/fields', requireDevice, async (req, res, next) => {
  try {
    const { values, source } = fieldsSchema.parse(req.body)
    res.json(await deviceService.saveFields(req.deviceId!, values, source))
  } catch (err) {
    next(err)
  }
})

/** PATCH /api/v1/me/consents — consentimientos (términos / novedades / sponsors). */
meRouter.patch('/me/consents', requireDevice, async (req, res, next) => {
  try {
    const consents = consentsSchema.parse(req.body)
    res.json(await deviceService.saveConsents(req.deviceId!, consents))
  } catch (err) {
    next(err)
  }
})
