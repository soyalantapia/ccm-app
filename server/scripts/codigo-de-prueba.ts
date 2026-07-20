/**
 * Emite un código OTP conocido para un email, saltando el envío por mail.
 *
 * Sirve para ejercitar el canje real (POST /auth/admin/verify-otp) desde la línea de comandos
 * cuando el envío por SMTP está activo y el código ya no sale por el log. No es una puerta
 * trasera: corre localmente con acceso directo a la base y al pepper, un nivel de acceso mayor
 * que cualquier sesión.
 *
 *   npx tsx scripts/codigo-de-prueba.ts alguien@ejemplo.com
 */
import { prisma } from '../src/lib/prisma.js'
import { env } from '../src/lib/env.js'
import { hashOtp, otpExpiry } from '../src/lib/adminOtp.js'

async function main() {
  const email = process.argv[2]?.toLowerCase()
  if (!email || !env.OTP_PEPPER) {
    console.error('Uso: npx tsx scripts/codigo-de-prueba.ts <email>  (y OTP_PEPPER seteado)')
    process.exit(1)
  }
  const user = await prisma.adminUser.findUnique({ where: { email } })
  if (!user) {
    console.error(`No existe ${email}`)
    process.exit(1)
  }
  const code = '424242' // fijo y reconocible: esto es una herramienta de prueba
  await prisma.adminLoginCode.create({
    data: { userId: user.id, codeHash: hashOtp(code, user.id, env.OTP_PEPPER), expiresAt: otpExpiry(new Date()) },
  })
  console.log(code)
  await prisma.$disconnect()
}

void main()
