import { Router } from 'express'
import * as eventService from '../services/eventService.js'
import { requirePermission } from '../middlewares/admin.js'

export const eventsRouter = Router()

/** GET /api/v1/events — todos los eventos (con sponsorIds). Público. */
eventsRouter.get('/events', async (_req, res, next) => {
  try {
    res.json(await eventService.getEvents())
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/admin/events — TODOS los eventos, borradores incluidos. El panel necesita ver
 *  lo que todavía no publicó; la ruta pública /events sólo devuelve lo publicado. */
eventsRouter.get('/admin/events', requirePermission('events:write'), async (_req, res, next) => {
  try {
    res.json(await eventService.getAllEvents())
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/events/with-blocks — eventos con bloques embebidos (1 query vs 1+N).
 *  DEBE ir antes de /events/:slug para que Express no capture "with-blocks" como slug. */
eventsRouter.get('/events/with-blocks', async (_req, res, next) => {
  try {
    res.json(await eventService.getEventsWithBlocks())
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/events/:id/blocks-availability — cupo de TODOS los bloques + generales
 *  de un evento en 3 queries (vs N+1 individuales). Público. */
eventsRouter.get('/events/:id/blocks-availability', async (req, res, next) => {
  try {
    res.json(await eventService.getEventAvailability(req.params.id))
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/events/:slug — ficha de un evento. */
eventsRouter.get('/events/:slug', async (req, res, next) => {
  try {
    res.json(await eventService.getEvent(req.params.slug))
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/events/:id/blocks — bloques de un evento. */
eventsRouter.get('/events/:id/blocks', async (req, res, next) => {
  try {
    res.json(await eventService.getBlocks(req.params.id))
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/blocks/:id/availability — cupo en vivo (lo calcula el server). */
eventsRouter.get('/blocks/:id/availability', async (req, res, next) => {
  try {
    res.json(await eventService.blockAvailability(req.params.id))
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/events/:id/general-count — inscripciones generales (sin bloque) confirmadas,
 *  server-wide. Público como availability (solo un conteo, sin PII). */
eventsRouter.get('/events/:id/general-count', async (req, res, next) => {
  try {
    res.json({ general: await eventService.generalRegistrationCount(req.params.id) })
  } catch (err) {
    next(err)
  }
})
