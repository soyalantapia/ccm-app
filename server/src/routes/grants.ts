import { Router } from 'express'
import { requireDevice } from '../middlewares/device.js'
import { badRequest } from '../lib/errors.js'
import * as grantService from '../services/grantService.js'

/**
 * Rutas PÚBLICAS de una entrada regalada — el lado del invitado, no del organizador.
 *
 * El link del mail es /i/<grantId>.<token>. El front separa las dos partes y llama acá:
 *  - GET  /grants/:id/preview?token=…  → qué es el regalo, sin activarlo (no exige device)
 *  - POST /grants/:id/claim            → lo activa (exige X-Device-Token: el teléfono del invitado)
 */
export const grantsRouter = Router()

grantsRouter.get('/grants/:id/preview', async (req, res, next) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : ''
    if (!token) {
      next(badRequest('GRANT_TOKEN_FALTA', 'Falta el token del link.'))
      return
    }
    res.json(await grantService.previewGrant(req.params.id, token))
  } catch (err) {
    next(err)
  }
})

grantsRouter.post('/grants/:id/claim', requireDevice, async (req, res, next) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token : ''
    if (!token) {
      next(badRequest('GRANT_TOKEN_FALTA', 'Falta el token del link.'))
      return
    }
    res.json(await grantService.reclamarGrant(req.params.id, token, req.deviceId!))
  } catch (err) {
    next(err)
  }
})
