import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import {
  createGrant,
  claimByToken,
  claimAllByEmail,
  revokeGrant,
  grantsPendientesDe,
  getGrantsByEmail,
  normalizeEmail,
} from './grantService.js'

/**
 * Tests contra base de VERDAD (misma DATABASE_URL que el resto de la suite). Lo que se prueba
 * acá no es que Prisma sepa insertar: es que una cortesía **no se pueda cobrar dos veces, no se
 * pueda robar y no ensucie las métricas de plata**. Cada test se corresponde con un caso límite
 * del spec 2026-07-21-asignar-entradas-design.md.
 *
 * Los ids llevan sufijo aleatorio a propósito: la base de test la comparten varias sesiones
 * trabajando en paralelo sobre este repo, y un id fijo hace fallar la suite por datos ajenos.
 */

const SUF = randomUUID().slice(0, 8)
const PLAN = `plan-test-${SUF}`
const EVENTO = `ev-test-${SUF}`
const ADMIN = `admin-test-${SUF}`

async function nuevoDevice(tag: string) {
  return prisma.device.create({ data: { publicId: `grant-${tag}-${SUF}-${randomUUID().slice(0, 6)}` } })
}

beforeEach(async () => {
  await prisma.ticketGrant.deleteMany({ where: { grantedById: ADMIN } })
  await prisma.ticketOrder.deleteMany({ where: { grantedById: ADMIN } })
  await prisma.ticketPlan.upsert({
    where: { id: PLAN },
    create: {
      id: PLAN,
      name: 'Combo VIP de prueba',
      tagline: 'test',
      price: 30000,
      serviceCharge: 3000,
      perks: [],
      day: 'combo',
      kind: 'vip',
    },
    update: {},
  })
  await prisma.event.upsert({
    where: { id: EVENTO },
    create: {
      id: EVENTO,
      slug: `ev-test-${SUF}`,
      type: 'principal',
      title: 'Evento de prueba',
      subtitle: '',
      dateLabel: '19/09',
      startDate: new Date(),
      timeLabel: '10 a 18',
      venue: 'Test',
      address: 'Test',
      mapsUrl: '',
      description: '',
      cover: '',
      published: true,
    },
    update: {},
  })
})

afterAll(async () => {
  await prisma.ticketGrant.deleteMany({ where: { grantedById: ADMIN } })
  await prisma.ticketOrder.deleteMany({ where: { grantedById: ADMIN } })
  await prisma.registration.deleteMany({ where: { eventId: EVENTO } })
  await prisma.event.deleteMany({ where: { id: EVENTO } })
  await prisma.ticketPlan.deleteMany({ where: { id: PLAN } })
})

describe('normalizeEmail', () => {
  it('es la clave del reclamo por código: mayúsculas y espacios no pueden dejar afuera a nadie', () => {
    expect(normalizeEmail('  Ana@Ejemplo.COM ')).toBe('ana@ejemplo.com')
  })
})

describe('createGrant', () => {
  it('guarda el email normalizado y genera un token único', async () => {
    const a = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: '  ANA@x.com ' }, ADMIN)
    const b = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'otro@x.com' }, ADMIN)
    expect(a.email).toBe('ana@x.com')
    expect(a.claimToken).not.toBe(b.claimToken)
    expect(a.claimToken.length).toBeGreaterThan(30)
  })

  it('rechaza un recurso inexistente en vez de dejar una invitación que revienta al reclamarse', async () => {
    await expect(createGrant({ kind: 'ticket_plan', resourceId: 'no-existe', email: 'a@x.com' }, ADMIN)).rejects.toMatchObject(
      { code: 'PLAN_NOT_FOUND' },
    )
    await expect(createGrant({ kind: 'event', resourceId: 'no-existe', email: 'a@x.com' }, ADMIN)).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    })
  })

  it('rechaza un email sin arroba', async () => {
    await expect(createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'no-es-un-mail' }, ADMIN)).rejects.toMatchObject(
      { code: 'EMAIL_INVALIDO' },
    )
  })

  it('NO materializa nada al crear: la entrada nace sin dueño', async () => {
    const g = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'sin@dueno.com' }, ADMIN)
    expect(g.claimedAt).toBeNull()
    expect(g.orderId).toBeNull()
    expect(await prisma.ticketOrder.count({ where: { grantedById: ADMIN } })).toBe(0)
  })
})

describe('claimByToken — el camino del link', () => {
  it('materializa una orden confirmada de total 0, marcada como regalo', async () => {
    const g = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'ana@x.com', qty: 2 }, ADMIN)
    const dev = await nuevoDevice('link')
    const claimed = await claimByToken(g.claimToken, dev.id)

    expect(claimed.claimedVia).toBe('link')
    expect(claimed.claimedByDeviceId).toBe(dev.id)
    const orden = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: claimed.orderId! } })
    expect(orden.status).toBe('confirmada')
    expect(orden.total).toBe(0)
    expect(orden.qty).toBe(2)
    expect(orden.deviceId).toBe(dev.id)
    expect(orden.buyerEmail).toBe('ana@x.com')
    // La marca que distingue el regalo de una venta. Sin esto el Dashboard cuenta las
    // cortesías de Gastón como ingresos.
    expect(orden.grantedById).toBe(ADMIN)
  })

  it('es idempotente para el mismo dispositivo: reabrir el link del propio mail no es un error', async () => {
    const g = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'ana@x.com' }, ADMIN)
    const dev = await nuevoDevice('idem')
    const uno = await claimByToken(g.claimToken, dev.id)
    const dos = await claimByToken(g.claimToken, dev.id)
    expect(dos.orderId).toBe(uno.orderId)
    expect(await prisma.ticketOrder.count({ where: { grantedById: ADMIN } })).toBe(1)
  })

  it('dos personas con el mismo link: gana la primera, la segunda ve un mensaje claro', async () => {
    const g = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'ana@x.com' }, ADMIN)
    const d1 = await nuevoDevice('p1')
    const d2 = await nuevoDevice('p2')
    await claimByToken(g.claimToken, d1.id)
    await expect(claimByToken(g.claimToken, d2.id)).rejects.toMatchObject({ code: 'GRANT_ALREADY_CLAIMED' })
    expect(await prisma.ticketOrder.count({ where: { grantedById: ADMIN } })).toBe(1)
  })

  it('un token revocado no entrega nada', async () => {
    const g = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'ana@x.com' }, ADMIN)
    await revokeGrant(g.id, 'me equivoqué de mail')
    const dev = await nuevoDevice('revocado')
    await expect(claimByToken(g.claimToken, dev.id)).rejects.toMatchObject({ code: 'GRANT_REVOKED' })
  })

  it('un token inventado no confirma ni desmiente que exista', async () => {
    const dev = await nuevoDevice('inventado')
    await expect(claimByToken('token-que-no-existe', dev.id)).rejects.toMatchObject({ code: 'GRANT_NOT_FOUND' })
  })

  it('regalar un EVENTO crea inscripción y NINGUNA orden', async () => {
    const g = await createGrant({ kind: 'event', resourceId: EVENTO, email: 'ana@x.com' }, ADMIN)
    const dev = await nuevoDevice('evento')
    const claimed = await claimByToken(g.claimToken, dev.id)
    expect(claimed.orderId).toBeNull()
    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: claimed.registrationId! } })
    expect(reg.status).toBe('confirmada')
    expect(reg.eventId).toBe(EVENTO)
    expect(await prisma.ticketOrder.count({ where: { grantedById: ADMIN } })).toBe(0)
  })

  it('regalar un evento a quien YA está inscripto reusa su inscripción en vez de reventar', async () => {
    const dev = await nuevoDevice('yainscripto')
    const previa = await prisma.registration.create({
      data: { id: `reg_${randomUUID()}`, deviceId: dev.id, eventId: EVENTO, status: 'confirmada' },
    })
    const g = await createGrant({ kind: 'event', resourceId: EVENTO, email: 'ana@x.com' }, ADMIN)
    const claimed = await claimByToken(g.claimToken, dev.id)
    expect(claimed.registrationId).toBe(previa.id)
  })
})

describe('claimAllByEmail — el camino de entrar a la app', () => {
  it('materializa TODAS las invitaciones vivas de ese email de una sola vez', async () => {
    await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'multi@x.com' }, ADMIN)
    await createGrant({ kind: 'event', resourceId: EVENTO, email: 'MULTI@x.com' }, ADMIN)
    const dev = await nuevoDevice('multi')

    const { reclamados, fallidos } = await claimAllByEmail('multi@x.com', dev.id)
    expect(fallidos).toEqual([])
    expect(reclamados).toHaveLength(2)
    expect(reclamados.every((g) => g.claimedVia === 'code')).toBe(true)
    expect(await prisma.ticketOrder.count({ where: { grantedById: ADMIN, deviceId: dev.id } })).toBe(1)
  })

  it('no toca las revocadas ni las ya reclamadas', async () => {
    const viva = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'mix@x.com' }, ADMIN)
    const muerta = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'mix@x.com' }, ADMIN)
    await revokeGrant(muerta.id, 'duplicada')

    expect(await grantsPendientesDe('mix@x.com')).toHaveLength(1)
    const dev = await nuevoDevice('mix')
    const { reclamados } = await claimAllByEmail('mix@x.com', dev.id)
    expect(reclamados.map((g) => g.id)).toEqual([viva.id])
  })

  it('un email sin invitaciones no explota: devuelve vacío', async () => {
    const dev = await nuevoDevice('vacio')
    const { reclamados, fallidos } = await claimAllByEmail('nadie@x.com', dev.id)
    expect(reclamados).toEqual([])
    expect(fallidos).toEqual([])
  })
})

describe('revokeGrant', () => {
  it('revocar algo YA reclamado cancela también la orden generada', async () => {
    const g = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'ana@x.com' }, ADMIN)
    const dev = await nuevoDevice('revoco')
    const claimed = await claimByToken(g.claimToken, dev.id)

    await revokeGrant(g.id, 'se lo di a la persona equivocada')

    const orden = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: claimed.orderId! } })
    expect(orden.status).toBe('cancelada')
  })

  it('revocar un evento reclamado cancela la inscripción', async () => {
    const g = await createGrant({ kind: 'event', resourceId: EVENTO, email: 'ana@x.com' }, ADMIN)
    const dev = await nuevoDevice('revocoev')
    const claimed = await claimByToken(g.claimToken, dev.id)
    await revokeGrant(g.id, 'ya no viene')
    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: claimed.registrationId! } })
    expect(reg.status).toBe('cancelada')
  })

  it('revocar dos veces no es un error', async () => {
    const g = await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'ana@x.com' }, ADMIN)
    await revokeGrant(g.id, 'primera')
    const segunda = await revokeGrant(g.id, 'segunda')
    expect(segunda.revokedReason).toBe('primera')
  })
})

describe('la ficha del CRM', () => {
  it('ve las invitaciones SIN reclamar, que no tienen dispositivo y por eso no salen por las órdenes', async () => {
    await createGrant({ kind: 'ticket_plan', resourceId: PLAN, email: 'ficha@x.com' }, ADMIN)
    const lista = await getGrantsByEmail('FICHA@x.com')
    expect(lista).toHaveLength(1)
    expect(lista[0].claimedAt).toBeNull()
  })
})
