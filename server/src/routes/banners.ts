import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../middlewares/admin.js'
import * as bannerService from '../services/bannerService.js'
import type { Banner } from '@domain/types'

export const bannersRouter = Router()

/** GET /api/v1/banners — banners activos (la rotación la decide el front por slot). Público. */
bannersRouter.get('/banners', async (_req, res, next) => {
  try {
    res.json(await bannerService.getBanners())
  } catch (err) {
    next(err)
  }
})

const hasId = z.object({ id: z.string().min(1) }).passthrough()

bannersRouter.get('/admin/banners', requirePermission('content:write'), async (_req, res, next) => {
  try {
    res.json(await bannerService.getAllBanners())
  } catch (err) {
    next(err)
  }
})

bannersRouter.post('/admin/banners', requirePermission('content:write'), (req, res, next) => {
  try {
    hasId.parse(req.body)
    bannerService.createBanner(req.body as Banner).then((b) => res.status(201).json(b)).catch(next)
  } catch (err) {
    next(err)
  }
})

bannersRouter.patch('/admin/banners/:id', requirePermission('content:write'), async (req, res, next) => {
  try {
    res.json(await bannerService.updateBanner(req.params.id, req.body as Partial<Banner>))
  } catch (err) {
    next(err)
  }
})

bannersRouter.delete('/admin/banners/:id', requirePermission('content:write'), async (req, res, next) => {
  try {
    await bannerService.deleteBanner(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
