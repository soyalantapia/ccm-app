import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../middlewares/admin.js'
import { requireDevice } from '../middlewares/device.js'
import * as oauth from '../services/mpOAuthService.js'
import { createCheckout } from '../services/mpCheckoutService.js'
import { handleNotification, verificarFirma } from '../services/mpWebhookService.js'

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

const checkoutSchema = z.object({
  kind: z.enum(['ticket_order', 'membership', 'ad_campaign']),
  resourceId: z.string().min(1),
  // El monto NO se acepta: lo calcula el server.
})

/**
 * POST /api/v1/payments/preference — devuelve el link de pago de esta compra.
 * Device-scoped (la usa el comprador, no el panel): requireDevice, no requirePermission.
 */
mpRouter.post('/payments/preference', requireDevice, async (req, res, next) => {
  try {
    const { kind, resourceId } = checkoutSchema.parse(req.body)
    res.status(201).json(await createCheckout(kind, resourceId, req.deviceId!))
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/v1/mp/webhook — aviso de pago de Mercado Pago.
 * Responde 200 SIEMPRE y rápido: MP reintenta si tarda o si contesta error, y no queremos que
 * un reintento en loop dependa de nuestra lógica. La validación real ocurre adentro.
 */
mpRouter.post('/mp/webhook', async (req, res) => {
  const dataId = String((req.body as { data?: { id?: string } })?.data?.id ?? req.query['data.id'] ?? '')
  // Un aviso sin id no se puede procesar ni reintentando: 200 y listo.
  if (!dataId) {
    res.status(200).end()
    return
  }
  const headers = req.headers as Record<string, string | undefined>
  const firmaValida = verificarFirma(headers, dataId)
  if (!firmaValida) {
    // Defecto D: antes esto no dejaba NINGÚN rastro. Sin este log, un ataque (alguien probando
    // dataIds con una firma trucha) y una configuración rota (MP_WEBHOOK_SECRET mal seteado, o
    // el problema del proxy del defecto A) se ven EXACTAMENTE igual: nada. Mismo formato que
    // /mp/callback más abajo.
    console.error('[mp.webhook] firma inválida', { dataId })
    // 401 en vez de 200: la causa más probable de que la firma no valide en masa NO es un
    // atacante, es una configuración rota (MP_WEBHOOK_SECRET ausente o mal seteado). Con un 200
    // esos avisos se descartaban de a uno y para siempre; con un error MP reintenta durante
    // horas, así que arreglar la variable recupera solo los cobros de esa ventana. Un atacante
    // que mande firmas truchas no gana nada con esto: MP reintenta contra su propio webhook.
    res.status(401).end()
    return
  }
  try {
    await handleNotification(dataId, firmaValida)
    res.status(200).end()
  } catch (err) {
    console.error('[mp.webhook]', err instanceof Error ? err.stack : err)
    // Antes acá se respondía 200 (de hecho ya había salido antes de procesar) y eso volvía
    // decorativa toda la red de seguridad del servicio: handleNotification suelta el claim
    // "para que MP pueda reintentar", pero MP sólo reintenta si le contestamos con un error.
    // Con un 200, un fallo de activación quedaba en plata cobrada, recurso jamás entregado y
    // nadie volviendo a intentarlo nunca. El 500 es lo que hace que ese reintento exista.
    // Es seguro: handleNotification es idempotente (claim atómico por mpPaymentId).
    res.status(500).end()
  }
})
