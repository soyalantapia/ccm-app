import { Router } from 'express'
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

/** POST /api/v1/memberships — hacerse Socio CCM. El monto lo fija el server (pricing compartido). */
membershipsRouter.post('/memberships', requireDevice, async (req, res, next) => {
  try {
    res.status(201).json(await membershipService.becomeSocio(req.deviceId!))
  } catch (err) {
    next(err)
  }
})
