import { Router } from 'express'
import { requirePermission } from '../middlewares/admin.js'
import * as oauth from '../services/mpOAuthService.js'

export const mpRouter = Router()

/** Estado de la conexión (sin tokens). */
mpRouter.get('/admin/mp/status', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    res.json(await oauth.getStatus())
  } catch (err) {
    next(err)
  }
})

/** Devuelve la URL de autorización; el panel abre esa URL. */
mpRouter.post('/admin/mp/connect', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    res.json({ url: await oauth.buildAuthUrl() })
  } catch (err) {
    next(err)
  }
})

mpRouter.post('/admin/mp/disconnect', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    await oauth.disconnect()
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/**
 * Vuelta de Mercado Pago. Es PÚBLICA porque la invoca el navegador volviendo de MP, no el panel:
 * la seguridad la da el state de un solo uso, no un token de admin. Siempre redirige al panel
 * (nunca devuelve JSON): del otro lado hay una persona mirando, no un fetch.
 */
mpRouter.get('/mp/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!code || !state) return res.redirect('/admin/configuracion?mp=error')
  try {
    await oauth.exchangeCode(code, state)
    res.redirect('/admin/configuracion?mp=ok')
  } catch (err) {
    // Esta ruta SIEMPRE redirige (nunca pasa por errorHandler), así que si no logueamos acá
    // el motivo del fallo se pierde para siempre: el organizador solo ve "no puedo conectar
    // Mercado Pago" y no queda ni una línea para saber si fue MP caído, state vencido o
    // credenciales mal. Mismo formato que middlewares/error.ts.
    console.error('[mp.callback]', err instanceof Error ? err.stack : err)
    res.redirect('/admin/configuracion?mp=error')
  }
})
