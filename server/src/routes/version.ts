import { Router } from 'express'
import { env } from '../lib/env.js'
import { mailerKind } from '../mail/mailer.js'
import { requireAdmin } from '../middlewares/admin.js'

export const versionRouter = Router()

/**
 * Qué está desplegado, en un GET.
 *
 * El deploy es MANUAL (`railway up`) desde el directorio donde se lo corre, sobre un repo
 * con varios worktrees, y sin CI. Hasta ahora la única forma de saber qué versión servía
 * producción era rebuildear el front y diffear el index.html contra el bundle servido:
 * cada duda costaba un build completo. Con eso, un deploy hecho desde el worktree
 * equivocado hacía RETROCEDER prod sin que nada lo delatara.
 *
 * BUILD_SHA y BUILT_AT los inyecta el Dockerfile. Si faltan (dev, o un deploy viejo),
 * responde 'desconocido' en vez de mentir con un valor por defecto.
 */
const SHA = process.env.BUILD_SHA?.trim() || 'desconocido'
const BUILT_AT = process.env.BUILT_AT?.trim() || 'desconocido'

/** Público: sólo identifica el artefacto. No dice nada de la configuración. */
versionRouter.get('/version', (_req, res) => {
  res.json({ commit: SHA, builtAt: BUILT_AT, version: '0.1.0' })
})

/**
 * Admin: las dos fallas SILENCIOSAS del proyecto, visibles de una.
 *
 * 1. Correo — `assertProd` no exige ninguna variable de mail y el mailer cae a consola
 *    sin romper nada (mail/mailer.ts). El server arranca 200 OK con el login del panel
 *    muerto, y la única señal es una línea del log de arranque. El OTP por mail es el
 *    ÚNICO login del panel: no hay contraseña de respaldo.
 * 2. Mercado Pago — el código del cobro puede estar desplegado sin una sola credencial,
 *    y entonces el conector tira 503 recién cuando alguien intenta pagar.
 *
 * Devuelve estados, nunca valores: acá no sale ni un secreto ni un host.
 */
versionRouter.get('/admin/diagnostics', requireAdmin, (_req, res) => {
  const kind = mailerKind()
  const mpConfigurado = !!(env.MP_CLIENT_ID || env.MP_CLIENT_SECRET || env.MP_ACCESS_TOKEN)
  res.json({
    commit: SHA,
    builtAt: BUILT_AT,
    correo: {
      proveedor: kind,
      // 'console' significa que NADIE puede entrar al panel: el código de acceso se
      // escribe en el log del server en vez de enviarse.
      operativo: kind !== 'console',
    },
    mercadoPago: {
      configurado: mpConfigurado,
      // Con MP configurado pero sin estas dos, se cobra y no se entrega: la firma del
      // aviso nunca valida y el aviso apunta a localhost.
      webhookSecret: !!env.MP_WEBHOOK_SECRET,
      publicBaseUrl: !!env.PUBLIC_BASE_URL,
    },
    corsAbierto: env.CORS_ORIGINS === '*',
  })
})
