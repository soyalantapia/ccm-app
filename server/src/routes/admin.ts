import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../middlewares/admin.js'
import { badRequest, notFound } from '../lib/errors.js'
import * as admin from '../services/adminService.js'
import * as applicationService from '../services/applicationService.js'
import * as personService from '../services/personService.js'
import * as grantService from '../services/grantService.js'
import * as catalogService from '../services/catalogService.js'
import { handleUpload } from '../services/uploadService.js'
import * as orderService from '../services/orderService.js'
import type { EventItem, EventBlock, ContentItem, Sponsor, Gallery, CatalogProfile, PlanId, Convocatoria } from '@domain/types'

export const adminRouter = Router()

// Cada ruta declara QUÉ permiso exige (no hay un guard único sobre el prefijo): así agregar
// una ruta obliga a decidir quién puede usarla, y admin.routes.test.ts falla si alguna quedó
// sin protección.

// El front manda el objeto completo con id/slug ya generados (cliente).
const hasId = z.object({ id: z.string().min(1) }).passthrough()

const route = <T>(handler: (body: T, id: string) => Promise<unknown>, status = 200) =>
  async (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    try {
      res.status(status).json(await handler(req.body as T, req.params.id))
    } catch (err) {
      next(err)
    }
  }

/* ─── Eventos ─── */
adminRouter.post('/admin/events', requirePermission('events:write'), (req, res, next) => {
  try {
    hasId.parse(req.body)
    admin.createEvent(req.body as EventItem).then((e) => res.status(201).json(e)).catch(next)
  } catch (err) {
    next(err)
  }
})
adminRouter.patch('/admin/events/:id', requirePermission('events:write'), route<Partial<EventItem>>((b, id) => admin.updateEvent(id, b)))
adminRouter.delete('/admin/events/:id', requirePermission('events:write'), async (req, res, next) => {
  try {
    await admin.deleteEvent(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/* ─── Bloques ─── */
adminRouter.post('/admin/blocks', requirePermission('events:write'), (req, res, next) => {
  try {
    hasId.parse(req.body)
    admin.createBlock(req.body as EventBlock).then((b) => res.status(201).json(b)).catch(next)
  } catch (err) {
    next(err)
  }
})
adminRouter.patch('/admin/blocks/:id', requirePermission('events:write'), route<Partial<EventBlock>>((b, id) => admin.updateBlock(id, b)))
adminRouter.delete('/admin/blocks/:id', requirePermission('events:write'), async (req, res, next) => {
  try {
    await admin.deleteBlock(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/* ─── Contenido ─── */
adminRouter.post('/admin/contents', requirePermission('content:write'), (req, res, next) => {
  try {
    hasId.parse(req.body)
    admin.createContent(req.body as ContentItem).then((c) => res.status(201).json(c)).catch(next)
  } catch (err) {
    next(err)
  }
})
adminRouter.patch('/admin/contents/:id', requirePermission('content:write'), route<Partial<ContentItem>>((b, id) => admin.updateContent(id, b)))
adminRouter.delete('/admin/contents/:id', requirePermission('content:write'), async (req, res, next) => {
  try {
    await admin.deleteContent(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/* ─── Helpers compactos para el resto del CRUD ─── */
type Handler = import('express').RequestHandler
const create = <T>(fn: (b: T) => Promise<unknown>): Handler => (req, res, next) => {
  try {
    hasId.parse(req.body)
    fn(req.body as T).then((x) => res.status(201).json(x)).catch(next)
  } catch (err) {
    next(err)
  }
}
const del = (fn: (id: string) => Promise<void>): Handler => async (req, res, next) => {
  try {
    await fn(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

/* ─── Sponsors ─── */
adminRouter.post('/admin/sponsors', requirePermission('sponsors:write'), create<Sponsor>((b) => admin.createSponsor(b)))
adminRouter.patch('/admin/sponsors/:id', requirePermission('sponsors:write'), route<Partial<Sponsor>>((b, id) => admin.updateSponsor(id, b)))
adminRouter.delete('/admin/sponsors/:id', requirePermission('sponsors:write'), del((id) => admin.deleteSponsor(id)))

/* ─── Galerías ─── */
adminRouter.post('/admin/galleries', requirePermission('content:write'), create<Gallery>((b) => admin.createGallery(b)))
adminRouter.patch('/admin/galleries/:id', requirePermission('content:write'), route<Partial<Gallery>>((b, id) => admin.updateGallery(id, b)))
adminRouter.delete('/admin/galleries/:id', requirePermission('content:write'), del((id) => admin.deleteGallery(id)))

/* ─── Catálogo ─── */
adminRouter.post('/admin/catalog', requirePermission('catalog:write'), create<CatalogProfile>((b) => admin.createCatalogProfile(b)))
adminRouter.patch('/admin/catalog/:id', requirePermission('catalog:write'), route<Partial<CatalogProfile>>((b, id) => admin.updateCatalogProfile(id, b)))
adminRouter.delete('/admin/catalog/:id', requirePermission('catalog:write'), del((id) => admin.deleteCatalogProfile(id)))

/* ─── Convocatorias ─── */
adminRouter.get('/admin/convocatorias', requirePermission('convocatorias:write'), async (_req, res, next) => {
  try {
    res.json(await catalogService.getConvocatorias())
  } catch (err) {
    next(err)
  }
})
adminRouter.post('/admin/convocatorias', requirePermission('convocatorias:write'), create<Convocatoria>((b) => admin.createConvocatoria(b)))
adminRouter.patch('/admin/convocatorias/:id', requirePermission('convocatorias:write'), route<Partial<Convocatoria>>((b, id) => admin.updateConvocatoria(id, b)))
adminRouter.delete('/admin/convocatorias/:id', requirePermission('convocatorias:write'), del((id) => admin.deleteConvocatoria(id)))

/* ─── Tipos de entrada de un evento ─── */
// Permiso `events:write`, no `sponsors:write`. Antes mutar un plan pedía el permiso de sponsors
// —una incoherencia que no molestaba mientras el editor vivía en una pantalla suelta, pero que
// deja sin sentido a la ficha del evento: quien arma el evento no podría ponerle precio.

/** Alta de un tipo de entrada DENTRO de un evento. El eventId sale de la ruta, nunca del body:
 *  si viniera del cuerpo se podrían mover entradas de un evento a otro por request. */
adminRouter.post('/admin/events/:id/plans', requirePermission('events:write'), async (req, res, next) => {
  try {
    res.status(201).json(await admin.createPlan(req.params.id, req.body))
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/admin/plans/:id', requirePermission('events:write'), async (req, res, next) => {
  try {
    await admin.updatePlan(req.params.id as PlanId, req.body)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/** Baja. Responde 409 si ya tiene compras, en vez del P2003 crudo de Prisma. */
adminRouter.delete('/admin/plans/:id', requirePermission('events:write'), async (req, res, next) => {
  try {
    await admin.deletePlan(req.params.id as PlanId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/* ─── Órdenes de entradas (vista y decisión del organizador) ─── */
adminRouter.get('/admin/orders', requirePermission('orders:read'), async (_req, res, next) => {
  try {
    res.json(await orderService.getAllOrders())
  } catch (err) {
    next(err)
  }
})

const orderStatusSchema = z.object({ status: z.enum(['iniciada', 'redirigida_mp', 'confirmada', 'cancelada']) })
/** El organizador confirma o cancela una orden a mano. Lo cobrado por Mercado Pago ya se concilia
 *  solo (mpWebhookService.ts:159); esto queda para lo que se cobró por fuera del checkout. */
adminRouter.patch('/admin/orders/:id', requirePermission('sponsors:write'), async (req, res, next) => {
  try {
    const { status } = orderStatusSchema.parse(req.body)
    res.json(await orderService.setOrderStatus(req.params.id, status))
  } catch (err) {
    next(err)
  }
})

/* ─── Contenido (vista del panel, sin gate de socio) ─── */
adminRouter.get('/admin/contents', requirePermission('content:write'), async (_req, res, next) => {
  try {
    res.json(await catalogService.getAdminContents())
  } catch (err) {
    next(err)
  }
})

/* ─── Upload de archivos (Volume Railway) ─── */
// POST /admin/upload  Content-Type: multipart/form-data  campo: "file" (imagen ≤5 MB)
// Devuelve { url } que el front pega en el campo de imagen.
adminRouter.post('/admin/upload', requirePermission('upload'), async (req, res, next) => {
  try {
    const result = await handleUpload(req)
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
})

/* ─── Postulaciones ─── */
const listAppsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})
adminRouter.get('/admin/applications', requirePermission('applications:read'), async (req, res, next) => {
  try {
    const q = listAppsSchema.parse(req.query)
    res.json(await applicationService.getApplications(q))
  } catch (err) {
    next(err)
  }
})
const decideSchema = z.object({
  status: z.enum(['aceptada', 'rechazada', 'preinscripta']),
  note: z.string().max(2000).optional(),
  skipEmail: z.boolean().optional(),
})
adminRouter.patch('/admin/applications/:id', requirePermission('applications:decide'), async (req, res, next) => {
  try {
    const { status, note, skipEmail } = decideSchema.parse(req.body)
    await applicationService.decideApplication(req.params.id, status, {
      adminUserId: req.admin!.userId,
      ...(note ? { note } : {}),
      ...(skipEmail ? { skipEmail } : {}),
    })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/* ─── Personas (CRM) ─── */
adminRouter.get('/admin/people', requirePermission('people:read'), async (req, res, next) => {
  try {
    res.json(
      await personService.listPeople({
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      }),
    )
  } catch (err) {
    next(err)
  }
})
adminRouter.get('/admin/people/:id', requirePermission('people:read'), async (req, res, next) => {
  try {
    const ficha = await personService.getPerson(req.params.id)
    if (!ficha) {
      next(notFound('PERSON_NOT_FOUND', 'No encontramos a esa persona'))
      return
    }
    res.json(ficha)
  } catch (err) {
    next(err)
  }
})

/* ─── Entradas regaladas (cortesías) ─── */

// Regalar N entradas de un evento a una persona. Devuelve el grant con su link para copiar.
adminRouter.post('/admin/grants', requirePermission('grants:write'), async (req, res, next) => {
  try {
    const b = req.body as { personId?: string; eventId?: string; qty?: number; note?: string }
    if (!b.personId || !b.eventId) {
      next(badRequest('GRANT_INCOMPLETO', 'Falta la persona o el evento.'))
      return
    }
    const grant = await grantService.crearGrant({
      personId: b.personId,
      eventId: b.eventId,
      qty: typeof b.qty === 'number' ? b.qty : 1,
      note: typeof b.note === 'string' ? b.note : undefined,
      grantedById: req.admin!.userId,
    })
    res.status(201).json(grant)
  } catch (err) {
    next(err)
  }
})

// Las cortesías de una persona, para la ficha.
adminRouter.get('/admin/people/:id/grants', requirePermission('grants:write'), async (req, res, next) => {
  try {
    res.json(await grantService.grantsDePersona(req.params.id))
  } catch (err) {
    next(err)
  }
})

// Revocar una cortesía (si estaba reclamada, también cancela la inscripción que creó).
adminRouter.delete('/admin/grants/:id', requirePermission('grants:write'), async (req, res, next) => {
  try {
    await grantService.revocarGrant(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
