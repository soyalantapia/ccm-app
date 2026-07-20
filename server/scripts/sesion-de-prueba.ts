/**
 * Abre una sesión para un email dado y escupe el token, sin pasar por el email.
 *
 * Existe sólo para poder ejercitar la API desde la línea de comandos cuando el envío real
 * está activo y el código ya no sale por el log. No es una puerta trasera: corre localmente
 * con acceso directo a la base, que es un nivel de acceso mayor que cualquier sesión.
 *
 *   npx tsx scripts/sesion-de-prueba.ts alguien@ejemplo.com
 */
import { prisma } from '../src/lib/prisma.js'
import { signSessionToken, sessionExpiry } from '../src/lib/adminSession.js'

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Falta el email. Uso: npx tsx scripts/sesion-de-prueba.ts alguien@ejemplo.com')
    process.exit(1)
  }
  const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) {
    console.error(`No existe ${email} en el equipo.`)
    process.exit(1)
  }
  const expiresAt = sessionExpiry(new Date())
  const session = await prisma.adminSession.create({ data: { userId: user.id, expiresAt } })
  console.log(signSessionToken(session.id, expiresAt))
  await prisma.$disconnect()
}

void main()
