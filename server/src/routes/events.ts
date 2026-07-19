import { Router } from 'express'
import * as eventService from '../services/eventService.js'

export const eventsRouter = Router()

/** GET /api/v1/events — todos los eventos (con sponsorIds). Público. */
eventsRouter.get('/events', async (_req, res, next) => {
  try {
    res.json(await eventService.getEvents())
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
