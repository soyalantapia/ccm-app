import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middlewares/admin.js'
import * as benefitService from '../services/benefitService.js'
import type { Benefit } from '@domain/types'

export const benefitsRouter = Router()

/** GET /api/v1/benefits — beneficios activos. El código viaja solo si el device está registrado. */
benefitsRouter.get('/benefits', async (req, res, next) => {
  try {
    res.json(await benefitService.getBenefits(req.deviceId))
  } catch (err) {
    next(err)
  }
})

/* ─── Admin (marketing) ─── */
const hasId = z.object({ id: z.string().min(1) }).passthrough()

benefitsRouter.get('/admin/benefits', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await benefitService.getAllBenefits())
  } catch (err) {
    next(err)
  }
})

benefitsRouter.post('/admin/benefits', requireAdmin, (req, res, next) => {
  try {
    hasId.parse(req.body)
    benefitService.createBenefit(req.body as Benefit).then((b) => res.status(201).json(b)).catch(next)
  } catch (err) {
    next(err)
  }
})

benefitsRouter.patch('/admin/benefits/:id', requireAdmin, async (req, res, next) => {
  try {
    res.json(await benefitService.updateBenefit(req.params.id, req.body as Partial<Benefit>))
  } catch (err) {
    next(err)
  }
})

benefitsRouter.delete('/admin/benefits/:id', requireAdmin, async (req, res, next) => {
  try {
    await benefitService.deleteBenefit(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
