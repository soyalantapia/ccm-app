import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '../lib/prisma.js'
import { createOrder, getOrders } from './orderService.js'

/**
 * Una entrada RETIRADA de la venta (archived) no toma órdenes nuevas. El selector ya la esconde,
 * pero apagar el botón es cosmético: POST /orders sigue abierto y con el id del plan —que no es
 * secreto, viaja en la ficha— se crearía una orden igual, y después un cobro. Es el mismo agujero
 * que el precio del evento y el candado de Socios venían a tapar en la inscripción.
 *
 * Test de DB real (como el resto de orderService): crea un evento + plan y ejercita createOrder.
 */

const SUF = `arch-order-${process.pid}-${Date.now()}`

let n = 0
async function crearPlan(archived: boolean) {
  const tag = `${SUF}-${n++}` // único por llamada: dos crearPlan(false) colisionaban en el id
  const evento = await prisma.event.create({
    data: {
      id: `ev-${tag}`, slug: `ev-${tag}`, type: 'principal',
      title: 'Evento de prueba', dateLabel: 'x', startDate: new Date('2026-09-19'),
      venue: 'v', address: 'a', mapsUrl: 'https://maps.example', description: 'd', cover: 'c',
    },
  })
  return prisma.ticketPlan.create({
    data: {
      id: `plan-${tag}`, eventId: evento.id, name: 'Night VIP test',
      tagline: 'Desfile', price: 30000, serviceCharge: 3000, kind: 'vip', archived,
    },
  })
}

afterAll(async () => {
  await prisma.ticketOrder.deleteMany({ where: { planId: { startsWith: `plan-${SUF}` } } })
  await prisma.ticketPlan.deleteMany({ where: { id: { startsWith: `plan-${SUF}` } } })
  await prisma.device.deleteMany({ where: { publicId: { startsWith: `dev-${SUF}` } } })
  await prisma.event.deleteMany({ where: { id: { startsWith: `ev-${SUF}` } } })
})

describe('createOrder — no se compra una entrada retirada', () => {
  it('una entrada archived rechaza la orden con 409 PLAN_ARCHIVED', async () => {
    const plan = await crearPlan(true)
    await expect(
      createOrder({ id: `ord-${SUF}-1`, planId: plan.id, qty: 1 }),
    ).rejects.toMatchObject({ status: 409, code: 'PLAN_ARCHIVED' })
    // Y no dejó ninguna orden fantasma.
    const count = await prisma.ticketOrder.count({ where: { id: `ord-${SUF}-1` } })
    expect(count).toBe(0)
  })

  it('una entrada a la venta se compra normal', async () => {
    const plan = await crearPlan(false)
    const orden = await createOrder({ id: `ord-${SUF}-2`, planId: plan.id, qty: 2 })
    expect(orden.total).toBe((30000 + 3000) * 2)
  })

  it('la orden viaja con el nombre y el tipo aunque la entrada se retire despues', async () => {
    // El caso del comprador: compra con la entrada a la venta, y despues el organizador la retira.
    // El comprador no ve /admin/plans, y /plans ya no trae la retirada, asi que sin el nombre en
    // la orden veria el id crudo y su credencial VIP bajaria a "Entrada general".
    const plan = await crearPlan(false)
    const device = await prisma.device.create({ data: { publicId: `dev-${SUF}` } })
    await createOrder({ id: `ord-${SUF}-3`, planId: plan.id, qty: 1 }, device.id)
    // Ahora se retira la entrada.
    await prisma.ticketPlan.update({ where: { id: plan.id }, data: { archived: true } })

    const ordenes = await getOrders(device.id)
    const mia = ordenes.find((o) => o.id === `ord-${SUF}-3`)
    expect(mia?.planName).toBe('Night VIP test')
    expect(mia?.planKind).toBe('vip')
  })
})
