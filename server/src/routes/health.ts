import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const healthRouter = Router()

/**
 * GET /api/v1/health → 200 si el server vive y la DB responde.
 * Es el primer endpoint y el que usa Railway para el healthcheck.
 */
healthRouter.get('/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ ok: true, version: '0.1.0', db: 'up' })
  } catch (err) {
    // DB caída: el server vive pero reporta degradado (503).
    next(err)
  }
})
