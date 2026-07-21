import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '../lib/prisma.js'
import { getCampaigns } from './orderService.js'

/**
 * Al aire sale SOLO lo que está pago y vigente.
 *
 * El agujero (P1, encontrado auditando la superficie pública): `getCampaigns` hacía un
 * `findMany` sin `where`, así que devolvía TODAS las campañas — incluidas las que están en
 * `pendiente_pago`. Y `GET /api/v1/campaigns` es público.
 *
 * El circuito de cobro ya existía y estaba bien: `createCampaign` fuerza `pendiente_pago`, y
 * recién el webhook de Mercado Pago (`mpWebhookService.activar`) pone `activa` junto con
 * `startsAt`/`expiresAt`. Lo único que faltaba era que la lectura pública lo respetara.
 *
 * Consecuencia concreta mientras faltó: cualquier visitante hacía un POST y su aviso ocupaba al
 * instante el splash de apertura (S1), el feed (S2), la pre-descarga de foto (S3) o la pantalla
 * Mi QR (S6) — gratis, y desplazando al sponsor que sí pagó, porque el front se queda con la
 * última campaña del slot.
 *
 * El vencimiento entra en el mismo filtro y por la misma razón: una campaña que compró 24 h no
 * puede seguir al aire al tercer día. Se le cobró por 24.
 */

const SUF = `camp-test-${process.pid}`

async function crearCampania(id: string, status: 'pendiente_pago' | 'activa' | 'expirada' | 'rechazada', expiresAt?: Date | null) {
  return prisma.adCampaign.create({
    data: {
      id: `${SUF}-${id}`,
      slot: 'S2',
      brand: `Marca ${id}`,
      headline: 'Titular de prueba',
      hours: 24,
      total: 10000,
      status,
      ...(status === 'activa' ? { startsAt: new Date(Date.now() - 3600_000) } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    },
  })
}

const idsDevueltos = async () => (await getCampaigns()).map((c) => c.id)

beforeEach(async () => {
  await prisma.adCampaign.deleteMany({ where: { id: { startsWith: SUF } } })
})

afterEach(async () => {
  await prisma.adCampaign.deleteMany({ where: { id: { startsWith: SUF } } })
})

describe('getCampaigns — al aire solo lo pago y vigente', () => {
  it('NO devuelve una campaña pendiente de pago', async () => {
    await crearCampania('impaga', 'pendiente_pago')
    expect(
      await idsDevueltos(),
      'una campaña sin pagar salió al aire: cualquiera publica gratis en el splash',
    ).not.toContain(`${SUF}-impaga`)
  })

  it('devuelve una campaña activa y vigente', async () => {
    await crearCampania('vigente', 'activa', new Date(Date.now() + 3600_000))
    expect(await idsDevueltos(), 'se cayó del aire un sponsor que pagó').toContain(`${SUF}-vigente`)
  })

  it('NO devuelve una campaña activa pero ya vencida', async () => {
    await crearCampania('vencida', 'activa', new Date(Date.now() - 3600_000))
    expect(
      await idsDevueltos(),
      'una campaña vencida sigue al aire: se le regalan horas que no compró',
    ).not.toContain(`${SUF}-vencida`)
  })

  it('devuelve una activa SIN vencimiento (expiresAt null no es "ya venció")', async () => {
    await crearCampania('sinvto', 'activa', null)
    expect(await idsDevueltos()).toContain(`${SUF}-sinvto`)
  })

  it('NO devuelve las rechazadas ni las expiradas', async () => {
    await crearCampania('rech', 'rechazada')
    await crearCampania('exp', 'expirada')
    const ids = await idsDevueltos()
    expect(ids).not.toContain(`${SUF}-rech`)
    expect(ids).not.toContain(`${SUF}-exp`)
  })

  it('con una impaga y una activa a la vez, solo sale la activa', async () => {
    // El caso que más duele: el front se queda con la ÚLTIMA campaña del slot, así que una
    // impaga creada después le pisaba el espacio al sponsor que había pagado.
    await crearCampania('paga', 'activa', new Date(Date.now() + 3600_000))
    await crearCampania('colada', 'pendiente_pago')
    const ids = await idsDevueltos()
    expect(ids).toContain(`${SUF}-paga`)
    expect(ids, 'la impaga le robó el espacio al sponsor que pagó').not.toContain(`${SUF}-colada`)
  })
})
