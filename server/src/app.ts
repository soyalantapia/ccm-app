import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { corsOrigins, env } from './lib/env.js'
import { healthRouter } from './routes/health.js'
import { devicesRouter } from './routes/devices.js'
import { meRouter } from './routes/me.js'
import { membershipsRouter } from './routes/memberships.js'
import { benefitsRouter } from './routes/benefits.js'
import { bannersRouter } from './routes/banners.js'
import { analyticsRouter } from './routes/analytics.js'
import { eventsRouter } from './routes/events.js'
import { registrationsRouter } from './routes/registrations.js'
import { catalogRouter } from './routes/catalog.js'
import { photosRouter } from './routes/photos.js'
import { adminRouter } from './routes/admin.js'
import { deviceContext } from './middlewares/device.js'
import { errorHandler, notFoundHandler } from './middlewares/error.js'

/** Arma la app Express. Todo cuelga de /api/v1 (canon 1). */
export function createApp() {
  const app = express()

  // Detrás del proxy de Railway (1 hop): habilita req.ip real para el rate-limit por IP.
  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({ origin: corsOrigins, credentials: false }))
  app.use(express.json({ limit: '1mb' }))

  // Rate limiting por IP (canon 16: 1 instancia → store en memoria OK). Dos cubetas:
  //  - writeLimiter: mutaciones reales (POST/PATCH/PUT/DELETE) excepto /analytics. Throttlear
  //    una escritura legítima SÍ molesta, por eso el límite es holgado y NO toca GETs (el
  //    grueso del tráfico del venue, donde todos comparten la IP de la WiFi).
  //  - analyticsLimiter: ingesta de analytics (alto volumen). Throttlearla solo pierde
  //    telemetría (fire-and-forget), no rompe UX, así que su cubeta es aparte y más alta.
  const rlBase = {
    windowMs: 60_000,
    standardHeaders: 'draft-7' as const,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes; probá de nuevo en un momento.' } },
  }
  const writeLimiter = rateLimit({
    ...rlBase,
    limit: env.RATE_LIMIT_WRITES,
    skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.path === '/analytics',
  })
  const analyticsLimiter = rateLimit({
    ...rlBase,
    limit: env.RATE_LIMIT_ANALYTICS,
    skip: (req) => req.path !== '/analytics',
  })

  // Router base versionado: /api/v1/...
  const v1 = express.Router()
  v1.use(healthRouter)
  v1.use(writeLimiter)
  v1.use(analyticsLimiter)
  v1.use(devicesRouter) // POST /devices: alta de identidad (emite el token de device)
  // Identidad por device (verifica X-Device-Token firmado) para todo lo de abajo.
  v1.use(deviceContext)
  v1.use(meRouter) // Fase A: /me, /me/fields, /me/consents
  v1.use(membershipsRouter) // Fase D (parcial): /memberships/me, POST /memberships
  v1.use(benefitsRouter) // Beneficios: /benefits (códigos gated) + /admin/benefits
  v1.use(bannersRouter) // Banners gestionados: /banners + /admin/banners
  v1.use(analyticsRouter) // Fase A: /analytics, /admin/analytics
  v1.use(eventsRouter) // Fase B: /events, /events/:slug, /events/:id/blocks, /blocks/:id/availability
  v1.use(registrationsRouter) // Fase B: /registrations
  v1.use(catalogRouter) // Fase E: /catalog, /galleries, /contents
  v1.use(photosRouter) // Fase E: /favorites, /downloads
  v1.use(adminRouter) // Fase G: /admin/events|blocks|contents (CRUD, requireAdmin)
  // TODO(fases C/D/F + resto G): orders, memberships, sponsors/galleries/catalog CRUD, applications ...
  app.use('/api/v1', v1)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
