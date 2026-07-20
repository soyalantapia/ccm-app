import { env, assertProd } from './lib/env.js'
import { createApp } from './app.js'
import { prisma } from './lib/prisma.js'
import { bootstrapFirstOwner } from './lib/adminBootstrap.js'
import { mailerKind } from './mail/mailer.js'

// Aborta si falta config crítica en producción (CORS abierto / sin ADMIN_TOKEN).
assertProd()

const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(`[ccm-server] escuchando en :${env.PORT} (${env.NODE_ENV}) — GET /api/v1/health`)
  // Por dónde salen los emails: en producción hay que poder verlo de un vistazo, porque
  // "console" significa que los códigos de acceso NO le llegan a nadie.
  const kind = mailerKind()
  console.log(`[ccm-server] emails: ${kind}${kind === 'console' ? ' ⚠️ (no se envían de verdad)' : ''}`)
  // Sin un primer OWNER nadie puede entrar por el login nuevo ni invitar a nadie.
  void bootstrapFirstOwner().catch((err) => console.error('[admin] bootstrap falló:', err))
})

// Apagado prolijo (Railway manda SIGTERM en deploy/restart).
async function shutdown(signal: string) {
  console.log(`[ccm-server] ${signal} — cerrando…`)
  server.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
