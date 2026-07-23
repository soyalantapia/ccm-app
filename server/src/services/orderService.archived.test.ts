import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '../lib/prisma.js'
import { createOrder } from './orderService.js'

/**
 * Una entrada RETIRADA de la venta (archived) no toma órdenes nuevas. El selector ya la esconde,
 * pero apagar el botón es cosmético: POST /orders sigue abierto y con el id del plan —que no es
 * secreto, viaja en la ficha— se crearía una orden igual, y después un cobro. Es el mismo agujero
 * que el precio del evento y el candado de Socios venían a tapar en la inscripción.
 *
 * Test de DB real (como el resto de orderService): crea un evento + plan y ejercita createOrder.
 */

const SUF = `arch-order-${process.pid}-${Date.now()}`

async function crearPlan(archived: boolean) {
  const evento = await prisma.event.create({
    data: {
      id: `ev-${SUF}-${archived}`, slug: `ev-${SUF}-${archived}`, type: 'principal',
      title: 'Evento de prueba', dateLabel: 'x', startDate: new Date('2026-09-19'),
      venue: 'v', address: 'a', mapsUrl: 'https://maps.example', description: 'd', cover: 'c',
    },
  })
  return prisma.ticketPlan.create({
    data: {
      id: `plan-${SUF}-${archived}`, eventId: evento.id, name: 'Night VIP test',
      tagline: 'Desfile', price: 30000, serviceCharge: 3000, kind: 'vip', archived,
    },
  })
}

afterAll(async () => {
  await prisma.ticketOrder.deleteMany({ where: { planId: { startsWith: `plan-${SUF}` } } })
  await prisma.ticketPlan.deleteMany({ where: { id: { startsWith: `plan-${SUF}` } } })
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
})
