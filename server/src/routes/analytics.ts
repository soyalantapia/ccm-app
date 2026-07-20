import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middlewares/admin.js'
import * as analyticsService from '../services/analyticsService.js'
import * as statsService from '../services/statsService.js'

export const analyticsRouter = Router()

const eventSchema = z.object({
  event: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).optional(),
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
analyticsRouter.get('/admin/stats', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await statsService.getAdminStats())
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/admin/analytics — para el dashboard del organizador (Fase G: requireAdmin). */
analyticsRouter.get('/admin/analytics', requireAdmin, async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().positive().max(2000).optional().parse(req.query.limit)
    res.json(await analyticsService.list(limit))
  } catch (err) {
    next(err)
  }
})
