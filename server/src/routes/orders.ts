import { Router } from 'express'
import { z } from 'zod'
import { requireDevice } from '../middlewares/device.js'
import * as orderService from '../services/orderService.js'

export const ordersRouter = Router()

/**
 * El id lo genera el CLIENTE, a propósito: la compra se pinta al instante y después se reconcilia,
 * así que el front necesita conocerlo antes de la respuesta. Lo que no puede es ser cualquier cosa.
 * `z.string().min(1)` aceptaba literalmente todo, y por ahí entraron a producción filas como
 * `ord_probe_265`, `verif_ord_1` y `ord_adv_verif_*` —hasta $66.000 con compradores @example.com—
 * que después hubo que identificar a ojo entre las ventas reales.
 *
 * Ahora se exige la forma que produce newId('ord') en src/lib/storage.ts:
 *   ord-<timestamp base36>-<5 chars base36>
 * No autentica a nadie (el endpoint sigue abierto a cualquier device: no hay login, es el diseño),
 * pero corta los ids escritos a mano y hace que cualquier fila rara salte a la vista.
 */
const ORDER_ID = /^ord-[0-9a-z]{6,12}-[0-9a-z]{5}$/

const createOrderSchema = z.object({
  id: z.string().regex(ORDER_ID, 'Formato de id de orden inválido'),
  planId: z.string().min(1),
  qty: z.number().int().positive().max(50).default(1),
  buyerName: z.string().max(120).optional(),
  buyerEmail: z.string().email().max(160).optional(),
  // El total lo calcula el server con el precio vigente: si viniera del cliente, se podría
  // comprar una entrada VIP a $1 editando el request.
})

/** GET /api/v1/orders — órdenes del device ("Mis entradas"). */
ordersRouter.get('/orders', requireDevice, async (req, res, next) => {
  try {
    res.json(await orderService.getOrders(req.deviceId!))
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/orders — inicia una compra de entradas. */
ordersRouter.post('/orders', requireDevice, async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body)
    res.status(201).json(await orderService.createOrder(body, req.deviceId!))
  } catch (err) {
    next(err)
  }
})

/** PATCH /api/v1/orders/:id/redirected — el usuario salió hacia el checkout de Mercado Pago.
 *  Solo puede marcar SU propia orden y solo a este estado: confirmar/cancelar es del organizador. */
ordersRouter.patch('/orders/:id/redirected', requireDevice, async (req, res, next) => {
  try {
    res.json(await orderService.setOrderStatus(req.params.id, 'redirigida_mp', { deviceId: req.deviceId! }))
  } catch (err) {
    next(err)
  }
})

/* ─── Campañas de publicidad autogestionada ─── */

const createCampaignSchema = z.object({
  id: z.string().min(1),
  slot: z.enum(['S1', 'S2', 'S3', 'S4', 'S6']),
  brand: z.string().min(1).max(80),
  headline: z.string().min(1).max(160),
  cta: z.string().max(80).optional(),
  tagline: z.string().max(160).optional(),
  hours: z.number().int().positive().max(24 * 90),
  total: z.number().int().nonnegative(),
})

/** GET /api/v1/campaigns — campañas compradas (alimentan la rotación de espacios). */
ordersRouter.get('/campaigns', async (_req, res, next) => {
  try {
    res.json(await orderService.getCampaigns())
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/campaigns — una marca compra un espacio. Queda pendiente_pago. */
ordersRouter.post('/campaigns', requireDevice, async (req, res, next) => {
  try {
    const body = createCampaignSchema.parse(req.body)
    res.status(201).json(await orderService.createCampaign(body))
  } catch (err) {
    next(err)
  }
})
