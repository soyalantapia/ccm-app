import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import type { AdminRole } from '@prisma/client'

// El módulo de sesión firma con ADMIN_TOKEN_SECRET vía lib/env: hay que tenerlo seteado ANTES
// de que se importe (transitivamente, desde createApp) por primera vez. Un `import` estático
// se hoistea al tope del archivo sin importar dónde esté escrito, así que asignar acá y recién
// después importar con un `import()` dinámico (que sí corre en el orden en que aparece) es lo
// que hace que esto funcione — mismo patrón que `lib/adminSession.test.ts`.
process.env.ADMIN_TOKEN_SECRET ??= 'secreto-de-test-admin-con-largo-suficiente'
process.env.DEVICE_TOKEN_SECRET ??= 'secreto-de-test-device-con-largo-suficiente'

const { createApp } = await import('../app.js')
const { prisma } = await import('../lib/prisma.js')
const { signSessionToken, sessionExpiry } = await import('../lib/adminSession.js')

/**
 * Prueba de aceptación de `people:read`: hasta acá `adminGuards.test.ts` sólo comprueba —por
 * texto— que la ruta DECLARA algún `requirePermission`. Este test ejercita la API real con una
 * sesión de verdad (AdminUser + AdminSession en la base, token firmado) para confirmar que el
 * permiso EFECTIVAMENTE bloquea: un rol sin `people:read` (CONTENT, prensa/marketing) tiene que
 * recibir 403 en el CRM de usuarios, y uno con el permiso (EDITOR) tiene que poder entrar.
 */

const app = createApp()

/** Crea un AdminUser activo + su AdminSession en la base, y devuelve el token firmado que
 *  el front mandaría en el header Authorization. Registra el userId para limpiarlo después
 *  (AdminSession cae en cascada al borrar el AdminUser). */
const usuariosCreados: string[] = []
async function tokenPara(role: AdminRole): Promise<string> {
  const user = await prisma.adminUser.create({
    data: { email: `people-test-${role}-${Date.now()}-${Math.random()}@ccm.test`, role, status: 'active' },
  })
  usuariosCreados.push(user.id)
  const expiresAt = sessionExpiry(new Date())
  const session = await prisma.adminSession.create({ data: { userId: user.id, expiresAt } })
  return signSessionToken(session.id, expiresAt)
}

afterAll(async () => {
  // AdminSession cae en cascada al borrar AdminUser.
  await prisma.adminUser.deleteMany({ where: { id: { in: usuariosCreados } } })
})

describe('GET /admin/people — guard de people:read con sesión real', () => {
  it('CONTENT (prensa/marketing) recibe 403: no ve el CRM de usuarios', async () => {
    const token = await tokenPara('CONTENT')
    const res = await request(app).get('/api/v1/admin/people').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body?.error?.code).toBe('ADMIN_FORBIDDEN')
  })

  it('EDITOR sí puede: tiene people:read', async () => {
    const token = await tokenPara('EDITOR')
    const res = await request(app).get('/api/v1/admin/people').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('items')
  })

  it('la ficha (GET /admin/people/:id) tiene el mismo guard', async () => {
    const token = await tokenPara('CONTENT')
    const res = await request(app).get('/api/v1/admin/people/no-importa').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })
})
