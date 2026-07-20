import { prisma } from './prisma.js'
import { env } from './env.js'
import { mailerKind } from '../mail/mailer.js'

/**
 * Crea el primer OWNER si todavía no hay ninguno.
 *
 * Sin esto el sistema no arranca nunca: para invitar gente hay que ser OWNER, y para ser OWNER
 * hay que haber sido invitado. Alguien tiene que entrar primero.
 *
 * Corre en cada arranque pero sólo hace algo si NO existe ningún OWNER. Deliberadamente mira
 * "hay algún owner" y no "existe este email": si mirara el email, cambiar la variable de entorno
 * agregaría owners silenciosamente en cada deploy, que es una puerta trasera cómoda de olvidar.
 * Una vez que hay uno, esta función no vuelve a tocar nada aunque la variable siga puesta.
 */
export async function bootstrapFirstOwner(): Promise<void> {
  const yaHayOwner = await prisma.adminUser.count({ where: { role: 'OWNER' } })
  if (yaHayOwner > 0) return

  const email = env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  if (!email) {
    console.warn(
      '[admin] No hay ningún OWNER y ADMIN_BOOTSTRAP_EMAIL no está seteada.\n' +
        '        Nadie puede entrar al panel con el login por código todavía.\n' +
        '        Seteá ADMIN_BOOTSTRAP_EMAIL con el mail de quien deba ser dueño y reiniciá.',
    )
    return
  }

  // Puede existir con otro rol (por ejemplo si lo invitaron como EDITOR antes de que hubiera
  // un OWNER). En ese caso se lo promueve en lugar de fallar por el email único.
  const existente = await prisma.adminUser.findUnique({ where: { email } })
  if (existente) {
    await prisma.adminUser.update({ where: { email }, data: { role: 'OWNER', status: 'active' } })
    console.log(`[admin] ${email} promovido a OWNER (no había ninguno).`)
    return
  }

  await prisma.adminUser.create({
    data: { email, name: 'Dueño', role: 'OWNER', status: 'invited', invitedBy: 'bootstrap' },
  })
  console.log(
    `[admin] Primer OWNER creado: ${email}\n` +
      `        Entrá a /admin/login y pedí tu código. El mail sale por: ${mailerKind()}.`,
  )
}
