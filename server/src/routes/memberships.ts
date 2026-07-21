import { Router } from 'express'
import { requireDevice } from '../middlewares/device.js'
import * as membershipService from '../services/membershipService.js'
import { isConnected } from '../services/mpOAuthService.js'
import { ApiError } from '../lib/errors.js'

export const membershipsRouter = Router()

/** GET /api/v1/memberships/me — membresía del device (free si no hay). */
membershipsRouter.get('/memberships/me', requireDevice, async (req, res, next) => {
  try {
    res.json(await membershipService.getMembership(req.deviceId!))
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/v1/memberships — hacerse Socio CCM. El monto lo fija el server (pricing compartido).
 *
 * Con Mercado Pago conectado este camino queda CERRADO: activaba la membresía sin cobrar un peso,
 * y como POST /devices emite tokens sin pedir credenciales, cualquier visitante podía hacerse
 * socio salteándose el checkout entero. La activación real pasa por el webhook, que es el único
 * que puede afirmar que la plata entró.
 *
 * Sin MP conectado se deja pasar, que es el modo demo del proyecto: sin pasarela no hay forma de
 * cobrar y bloquearlo dejaría la función muerta. Mismo criterio condicional que assertProd.
 */
membershipsRouter.post('/memberships', requireDevice, async (req, res, next) => {
  try {
    if (await isConnected()) {
      throw new ApiError(
        409,
        'PAGO_REQUERIDO',
        'La membresía Socio se activa al acreditarse el pago. Generá el cobro desde Mercado Pago.',
      )
    }
    res.status(201).json(await membershipService.becomeSocio(req.deviceId!))
  } catch (err) {
    next(err)
  }
})
