import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../middlewares/admin.js'
import * as analyticsService from '../services/analyticsService.js'
import * as statsService from '../services/statsService.js'

export const analyticsRouter = Router()

// Ingesta PÚBLICA (sin requireDevice por diseño: se trackea antes de tener token). Por eso
// las cotas: sin ellas, el nombre del evento era texto libre y el payload un record ilimitado,
// así que se podía sembrar basura arbitrariamente grande en la MISMA tabla que alimenta el
// panel del organizador y el reporte que se le vende al sponsor.
const eventSchema = z.object({
  // snake_case acotado: no cierra la taxonomía (un evento nuevo no se pierde en silencio),
  // pero descarta nombres basura y payloads de texto disfrazados de nombre.
  event: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/, 'Nombre de evento inválido'),
  payload: z.record(z.string().max(60), z.unknown()).refine((p) => Object.keys(p).length <= 25, {
    message: 'Payload con demasiadas claves',
  }).optional(),
  ts: z.string().datetime().optional(),
})
// Acepta un evento suelto o un batch (el front bufferea y manda array).
const ingestSchema = z.union([eventSchema, z.array(eventSchema).max(500)])

/**
 * POST /api/v1/analytics — ingesta del event bus (doc 08). Fire-and-forget: responde
 * 202 sin bloquear. deviceId sale del token firmado X-Device-Token (deviceContext, en app.ts).
 */
analyticsRouter.post('/analytics', async (req, res, next) => {
  try {
    const parsed = ingestSchema.parse(req.body)
    const events = Array.isArray(parsed) ? parsed : [parsed]
    const count = await analyticsService.ingest(req.deviceId, events)
    res.status(202).json({ ok: true, ingested: count })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/v1/admin/stats — métricas del Dashboard, calculadas sobre las TABLAS de negocio.
 *
 * Existe porque /admin/analytics devuelve telemetría truncada a 500 filas y el front contaba
 * sobre esa lista: los KPIs quedaban amputados, y los eventos que nunca llegan al backend
 * (user_created, registration_created) hacían que métricas con datos reales mostraran 0.
 */
analyticsRouter.get('/admin/stats', requirePermission('analytics:read'), async (_req, res, next) => {
  try {
    res.json(await statsService.getAdminStats())
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/admin/analytics — para el dashboard del organizador (Fase G: requireAdmin). */
analyticsRouter.get('/admin/analytics', requirePermission('analytics:read'), async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().positive().max(2000).optional().parse(req.query.limit)
    res.json(await analyticsService.list(limit))
  } catch (err) {
    next(err)
  }
})
