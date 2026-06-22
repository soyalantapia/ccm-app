import express from 'express'
import cors from 'cors'
import { corsOrigins } from './lib/env.js'
import { healthRouter } from './routes/health.js'
import { meRouter } from './routes/me.js'
import { analyticsRouter } from './routes/analytics.js'
import { deviceContext } from './middlewares/device.js'
import { errorHandler, notFoundHandler } from './middlewares/error.js'

/** Arma la app Express. Todo cuelga de /api/v1 (canon 1). */
export function createApp() {
  const app = express()

  app.use(cors({ origin: corsOrigins, credentials: false }))
  app.use(express.json({ limit: '1mb' }))

  // Router base versionado: /api/v1/...
  const v1 = express.Router()
  v1.use(healthRouter)
  // Identidad por device (upsert por X-Device-Id) para todo lo de abajo.
  v1.use(deviceContext)
  v1.use(meRouter) // Fase A: /me, /me/fields, /me/consents
  v1.use(analyticsRouter) // Fase A: /analytics, /admin/analytics
  // TODO(fases B→H): events, registrations, orders, memberships, ...
  app.use('/api/v1', v1)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
