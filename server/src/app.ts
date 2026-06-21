import express from 'express'
import cors from 'cors'
import { corsOrigins } from './lib/env.js'
import { healthRouter } from './routes/health.js'
import { errorHandler, notFoundHandler } from './middlewares/error.js'

/** Arma la app Express. Todo cuelga de /api/v1 (canon 1). */
export function createApp() {
  const app = express()

  app.use(cors({ origin: corsOrigins, credentials: false }))
  app.use(express.json({ limit: '1mb' }))

  // Router base versionado: /api/v1/...
  const v1 = express.Router()
  v1.use(healthRouter)
  // TODO(fases A→H): montar acá los routers de cada dominio (me, events, orders, ...).
  app.use('/api/v1', v1)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
