import { env, assertProd } from './lib/env.js'
import { createApp } from './app.js'
import { prisma } from './lib/prisma.js'

// Aborta si falta config crítica en producción (CORS abierto / sin ADMIN_TOKEN).
assertProd()

const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(`[ccm-server] escuchando en :${env.PORT} (${env.NODE_ENV}) — GET /api/v1/health`)
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
