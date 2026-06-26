import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middlewares/admin.js'
import * as notaService from '../services/notaService.js'
import type { Nota } from '@domain/types'

export const notasRouter = Router()

/** GET /api/v1/notas — notas publicadas. Público. */
notasRouter.get('/notas', async (_req, res, next) => {
  try {
    res.json(await notaService.getNotas())
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/notas/:slug — una nota publicada. */
notasRouter.get('/notas/:slug', async (req, res, next) => {
  try {
    res.json(await notaService.getNota(req.params.slug))
  } catch (err) {
    next(err)
  }
})

const hasId = z.object({ id: z.string().min(1) }).passthrough()

notasRouter.get('/admin/notas', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await notaService.getAllNotas())
  } catch (err) {
    next(err)
  }
})

notasRouter.post('/admin/notas', requireAdmin, (req, res, next) => {
  try {
    hasId.parse(req.body)
    notaService.createNota(req.body as Nota).then((n) => res.status(201).json(n)).catch(next)
  } catch (err) {
    next(err)
  }
})

notasRouter.patch('/admin/notas/:id', requireAdmin, async (req, res, next) => {
  try {
    res.json(await notaService.updateNota(req.params.id, req.body as Partial<Nota>))
  } catch (err) {
    next(err)
  }
})

notasRouter.delete('/admin/notas/:id', requireAdmin, async (req, res, next) => {
  try {
    await notaService.deleteNota(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
