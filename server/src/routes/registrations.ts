import { Router } from 'express'
import { z } from 'zod'
import { requireDevice } from '../middlewares/device.js'
import * as registrationService from '../services/registrationService.js'

export const registrationsRouter = Router()

const createSchema = z.object({
  eventId: z.string().min(1),
  blockId: z.string().min(1).optional(),
})

/** GET /api/v1/registrations — inscripciones confirmadas del device. */
registrationsRouter.get('/registrations', requireDevice, async (req, res, next) => {
  try {
    res.json(await registrationService.getRegistrations(req.deviceId!))
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/registrations — inscribirse (cupo validado server-side). */
registrationsRouter.post('/registrations', requireDevice, async (req, res, next) => {
  try {
    const { eventId, blockId } = createSchema.parse(req.body)
    const reg = await registrationService.register(req.deviceId!, eventId, blockId)
    res.status(201).json(reg)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/v1/registrations/:id — cancelar (libera cupo). */
registrationsRouter.delete('/registrations/:id', requireDevice, async (req, res, next) => {
  try {
    await registrationService.cancelRegistration(req.deviceId!, req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
