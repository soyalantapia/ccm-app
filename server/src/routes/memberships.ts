import { Router } from 'express'
import { z } from 'zod'
import { requireDevice } from '../middlewares/device.js'
import * as membershipService from '../services/membershipService.js'

export const membershipsRouter = Router()

/** GET /api/v1/memberships/me — membresía del device (free si no hay). */
membershipsRouter.get('/memberships/me', requireDevice, async (req, res, next) => {
  try {
    res.json(await membershipService.getMembership(req.deviceId!))
  } catch (err) {
    next(err)
  }
})

// .max acota al rango de int4 de Postgres: sin esto un paid enorme (vector público) desbordaba
// la columna Int y tiraba 500 en vez de un 400 de validación.
const becomeSchema = z.object({ paid: z.number().int().nonnegative().max(2_147_483_647).default(0) })

/** POST /api/v1/memberships — hacerse Socio CCM (persiste server-side). */
membershipsRouter.post('/memberships', requireDevice, async (req, res, next) => {
  try {
    const { paid } = becomeSchema.parse(req.body)
    res.status(201).json(await membershipService.becomeSocio(req.deviceId!, paid))
  } catch (err) {
    next(err)
  }
})
