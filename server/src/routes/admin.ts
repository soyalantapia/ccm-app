import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middlewares/admin.js'
import * as admin from '../services/adminService.js'
import * as applicationService from '../services/applicationService.js'
import * as catalogService from '../services/catalogService.js'
import type { EventItem, EventBlock, ContentItem, Sponsor, Gallery, CatalogProfile, PlanId, Convocatoria } from '@domain/types'

export const adminRouter = Router()

// Todo /admin/* exige token de organizador (Fase G temporal).
adminRouter.use('/admin', requireAdmin)

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
adminRouter.post('/admin/events', (req, res, next) => {
  try {
    hasId.parse(req.body)
    admin.createEvent(req.body as EventItem).then((e) => res.status(201).json(e)).catch(next)
  } catch (err) {
    next(err)
  }
})
adminRouter.patch('/admin/events/:id', route<Partial<EventItem>>((b, id) => admin.updateEvent(id, b)))
adminRouter.delete('/admin/events/:id', async (req, res, next) => {
  try {
    await admin.deleteEvent(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/* ─── Bloques ─── */
adminRouter.post('/admin/blocks', (req, res, next) => {
  try {
    hasId.parse(req.body)
    admin.createBlock(req.body as EventBlock).then((b) => res.status(201).json(b)).catch(next)
  } catch (err) {
    next(err)
  }
})
adminRouter.patch('/admin/blocks/:id', route<Partial<EventBlock>>((b, id) => admin.updateBlock(id, b)))
adminRouter.delete('/admin/blocks/:id', async (req, res, next) => {
  try {
    await admin.deleteBlock(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/* ─── Contenido ─── */
adminRouter.post('/admin/contents', (req, res, next) => {
  try {
    hasId.parse(req.body)
    admin.createContent(req.body as ContentItem).then((c) => res.status(201).json(c)).catch(next)
  } catch (err) {
    next(err)
  }
})
adminRouter.patch('/admin/contents/:id', route<Partial<ContentItem>>((b, id) => admin.updateContent(id, b)))
adminRouter.delete('/admin/contents/:id', async (req, res, next) => {
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
adminRouter.post('/admin/sponsors', create<Sponsor>((b) => admin.createSponsor(b)))
adminRouter.patch('/admin/sponsors/:id', route<Partial<Sponsor>>((b, id) => admin.updateSponsor(id, b)))
adminRouter.delete('/admin/sponsors/:id', del((id) => admin.deleteSponsor(id)))

/* ─── Galerías ─── */
adminRouter.post('/admin/galleries', create<Gallery>((b) => admin.createGallery(b)))
adminRouter.patch('/admin/galleries/:id', route<Partial<Gallery>>((b, id) => admin.updateGallery(id, b)))
adminRouter.delete('/admin/galleries/:id', del((id) => admin.deleteGallery(id)))

/* ─── Catálogo ─── */
adminRouter.post('/admin/catalog', create<CatalogProfile>((b) => admin.createCatalogProfile(b)))
adminRouter.patch('/admin/catalog/:id', route<Partial<CatalogProfile>>((b, id) => admin.updateCatalogProfile(id, b)))
adminRouter.delete('/admin/catalog/:id', del((id) => admin.deleteCatalogProfile(id)))

/* ─── Convocatorias ─── */
adminRouter.get('/admin/convocatorias', async (_req, res, next) => {
  try {
    res.json(await catalogService.getConvocatorias())
  } catch (err) {
    next(err)
  }
})
adminRouter.post('/admin/convocatorias', create<Convocatoria>((b) => admin.createConvocatoria(b)))
adminRouter.patch('/admin/convocatorias/:id', route<Partial<Convocatoria>>((b, id) => admin.updateConvocatoria(id, b)))
adminRouter.delete('/admin/convocatorias/:id', del((id) => admin.deleteConvocatoria(id)))

/* ─── Planes (precio / mpLink) ─── */
adminRouter.patch('/admin/plans/:id', async (req, res, next) => {
  try {
    await admin.updatePlan(req.params.id as PlanId, req.body)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/* ─── Postulaciones ─── */
adminRouter.get('/admin/applications', async (_req, res, next) => {
  try {
    res.json(await applicationService.getApplications())
  } catch (err) {
    next(err)
  }
})
const decideSchema = z.object({ status: z.enum(['aceptada', 'rechazada']) })
adminRouter.patch('/admin/applications/:id', async (req, res, next) => {
  try {
    const { status } = decideSchema.parse(req.body)
    await applicationService.decideApplication(req.params.id, status)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
