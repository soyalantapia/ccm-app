import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middlewares/admin.js'
import * as admin from '../services/adminService.js'
import type { EventItem, EventBlock, ContentItem } from '@domain/types'

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
