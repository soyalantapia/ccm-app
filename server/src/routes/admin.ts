import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../middlewares/admin.js'
import * as admin from '../services/adminService.js'
import * as applicationService from '../services/applicationService.js'
import * as catalogService from '../services/catalogService.js'
import { handleUpload } from '../services/uploadService.js'
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

/* ─── Planes (precio / mpLink) ─── */
adminRouter.patch('/admin/plans/:id', requirePermission('sponsors:write'), async (req, res, next) => {
  try {
    await admin.updatePlan(req.params.id as PlanId, req.body)
    res.status(204).end()
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
adminRouter.get('/admin/applications', requirePermission('applications:read'), async (_req, res, next) => {
  try {
    res.json(await applicationService.getApplications())
  } catch (err) {
    next(err)
  }
})
const decideSchema = z.object({ status: z.enum(['aceptada', 'rechazada']) })
adminRouter.patch('/admin/applications/:id', requirePermission('applications:decide'), async (req, res, next) => {
  try {
    const { status } = decideSchema.parse(req.body)
    await applicationService.decideApplication(req.params.id, status)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
