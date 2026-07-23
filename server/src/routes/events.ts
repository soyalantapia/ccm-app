import { Router } from 'express'
import * as eventService from '../services/eventService.js'
import * as catalogService from '../services/catalogService.js'
import { requirePermission } from '../middlewares/admin.js'

export const eventsRouter = Router()

/** GET /api/v1/admin/plans — TODOS los tipos de entrada, retiradas incluidas. La ruta pública
 *  /plans sólo devuelve las que están a la venta; el panel necesita ver una retirada para
 *  reactivarla, y /admin/ordenes para resolver el nombre de un plan ya vendido y luego retirado. */
eventsRouter.get('/admin/plans', requirePermission('events:write'), async (req, res, next) => {
  try {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined
    res.json(await catalogService.getAllPlans(eventId))
  } catch (err) {
    next(err)
  }
})

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

/** GET /api/v1/admin/events/:id/blocks — la agenda de CUALQUIER evento, borradores incluidos.
 *  Las rutas públicas de abajo devuelven 404 para un borrador (un evento sin publicar no existe
 *  para nadie fuera del panel); el organizador necesita ver y armar esa agenda igual. */
eventsRouter.get(
  '/admin/events/:id/blocks',
  requirePermission('events:write'),
  async (req, res, next) => {
    try {
      res.json(await eventService.getAllBlocks(req.params.id))
    } catch (err) {
      next(err)
    }
  },
)

/** GET /api/v1/admin/events/:id/blocks-availability — ídem, el cupo de un borrador. */
eventsRouter.get(
  '/admin/events/:id/blocks-availability',
  requirePermission('events:write'),
  async (req, res, next) => {
    try {
      res.json(await eventService.getAllEventAvailability(req.params.id))
    } catch (err) {
      next(err)
    }
  },
)

/** GET /api/v1/admin/events/:id/inscriptos — los inscriptos REALES del evento, de todos los
 *  dispositivos. Devuelve PII, así que va detrás de `people:read` (el permiso del CRM), no de
 *  `events:write`: quien arma la agenda no necesariamente puede ver datos personales. */
eventsRouter.get(
  '/admin/events/:id/inscriptos',
  requirePermission('people:read'),
  async (req, res, next) => {
    try {
      res.json(await eventService.getInscriptos(req.params.id))
    } catch (err) {
      next(err)
    }
  },
)

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
