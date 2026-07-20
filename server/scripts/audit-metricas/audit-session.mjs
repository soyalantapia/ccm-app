/**
 * Crea un usuario OWNER + una sesión válida en la base de auditoría, e imprime el token.
 *
 * Sirve para verificar el panel localmente sin pasar por el OTP por email. SOLO para la
 * base ccm_audit: aborta si DATABASE_URL apunta a cualquier otra cosa, para que no se
 * pueda crear un owner por accidente en una base real.
 */
import { PrismaClient } from '@prisma/client'
import { signSessionToken } from '../../dist/server/src/lib/adminSession.js'

const url = process.env.DATABASE_URL ?? ''
if (!url.includes('ccm_audit')) {
  console.error('ABORTA: este script sólo corre contra ccm_audit. DATABASE_URL apunta a otra base.')
  process.exit(1)
}

const prisma = new PrismaClient()
const EMAIL = 'auditoria@local.test'

const user = await prisma.adminUser.upsert({
  where: { email: EMAIL },
  create: { email: EMAIL, name: 'Auditoría local', role: 'OWNER', status: 'active' },
  update: { role: 'OWNER', status: 'active' },
})

const expiresAt = new Date(Date.now() + 8 * 3600_000)
const session = await prisma.adminSession.create({ data: { userId: user.id, expiresAt } })
const token = signSessionToken(session.id, expiresAt)

console.log(JSON.stringify({ email: EMAIL, role: user.role, expiresAt: expiresAt.toISOString(), token }, null, 1))
await prisma.$disconnect()
