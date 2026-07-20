import { join } from 'node:path'
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
import { notasRouter } from './routes/notas.js'
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

  // helmet sin CSP/COEP: ahora este service también sirve la SPA (imágenes externas,
  // YouTube, fuentes) — el CSP estricto la rompería. Quedan HSTS, nosniff, frameguard, etc.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
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
  v1.use(notasRouter) // Notas/novedades (CMS prensa): /notas, /notas/:slug + /admin/notas
  v1.use(analyticsRouter) // Fase A: /analytics, /admin/analytics
  v1.use(eventsRouter) // Fase B: /events, /events/:slug, /events/:id/blocks, /blocks/:id/availability
  v1.use(registrationsRouter) // Fase B: /registrations
  v1.use(catalogRouter) // Fase E: /catalog, /galleries, /contents
  v1.use(photosRouter) // Fase E: /favorites, /downloads
  v1.use(adminRouter) // Fase G: CRUD admin de events|blocks|contents|sponsors|galleries|catalog|notas|banners|benefits|applications|plans
  // Pendiente real: /orders (Fase C, bloqueada por checkout MP) y CRUD admin de memberships.
  // (sponsors/galleries/catalog/applications CRUD YA están: los sirven catalogRouter + adminRouter.)
  app.use('/api/v1', v1)

  // Uploads: si UPLOAD_DIR está seteado, sirve los archivos subidos (Volume Railway).
  // Montado ANTES de la SPA para que /uploads/* no sea absorbido por el fallback a index.html.
  if (env.UPLOAD_DIR) {
    const uploadPrefix = env.UPLOAD_URL_PREFIX.replace(/\/$/, '')
    app.use(uploadPrefix, express.static(env.UPLOAD_DIR, { index: false }))
  }

  // SPA: si FRONT_DIST está seteada, este service también sirve el front buildeado.
  // Estáticos con cache larga (assets hasheados); el resto de las rutas → index.html
  // (fallback del router), EXCEPTO /api/* (que cae al notFoundHandler como 404 JSON).
  if (env.FRONT_DIST) {
    const dist = env.FRONT_DIST
    app.use(express.static(dist, { index: false }))
    // El fallback es para RUTAS del router, no para archivos. Antes cualquier path sin /api/
    // devolvía 200 + HTML, así que un asset inexistente (una imagen borrada, un chunk viejo
    // tras un deploy) era indistinguible de una ruta válida: el navegador recibía HTML donde
    // esperaba binario, y el Service Worker lo cacheaba con CacheFirst — el 200 mentiroso
    // quedaba pegado. Un path que parece archivo (tiene extensión) y no existe → 404 honesto.
    // Lista explícita en vez de "tiene un punto": los slugs pasan por slugify (solo a-z0-9-),
    // pero si alguna vez entrara uno sin slugificar, un punto en el nombre no debe dar 404.
    const EXT_DE_ASSET =
      /\.(js|mjs|css|map|json|webmanifest|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|pdf|txt|xml)$/i
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
      if (EXT_DE_ASSET.test(req.path)) return next() // → notFoundHandler (404 honesto)
      res.sendFile(join(dist, 'index.html'))
    })
  }

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
