/**
 * Manda los dos emails del panel por el proveedor que esté configurado y muestra el resultado.
 *
 * Sin credenciales sale por consola y se leen acá mismo: así se verifica el circuito de
 * invitación y de código sin depender de que haya un proveedor contratado.
 * Con RESEND_API_KEY o SMTP_HOST seteados, manda de verdad — pasando el destinatario:
 *
 *   npx tsx scripts/probar-mails.ts                 → consola
 *   npx tsx scripts/probar-mails.ts vos@gmail.com   → a esa casilla, si hay proveedor
 */
import { getMailer, mailerKind, getDevOutbox } from '../src/mail/mailer.js'
import { otpEmail, accessGrantedEmail } from '../src/mail/templates.js'

async function main() {
  const to = process.argv[2] ?? 'destinatario@ejemplo.com'
  const mailer = getMailer()
  const kind = mailerKind()

  console.log(`\n─── proveedor: ${kind}${kind === 'console' ? ' (sin credenciales: sale por acá)' : ''}`)
  console.log(`─── destinatario: ${to}\n`)

  const invitacion = await mailer.send(
    to,
    accessGrantedEmail({
      name: 'Ana Pérez',
      role: 'CONTENT',
      loginUrl: 'http://localhost:5183/admin/login',
      invitedBy: 'Gastón',
    }),
  )
  const codigo = await mailer.send(to, otpEmail({ name: 'Ana Pérez', code: '048372', ttlMin: 10 }))

  console.log(`\n─── resultado`)
  console.log(`  invitación: ${invitacion.delivered ? 'ENTREGADA' : 'no entregada (consola)'} · id ${invitacion.id}`)
  console.log(`  código:     ${codigo.delivered ? 'ENTREGADO' : 'no entregado (consola)'} · id ${codigo.id}`)
  if (kind === 'console') {
    console.log(`\n─── bandeja de dev: ${getDevOutbox().length} mails`)
    for (const m of getDevOutbox()) console.log(`  → ${m.to} · ${m.msg.subject}`)
  }
}

void main()
