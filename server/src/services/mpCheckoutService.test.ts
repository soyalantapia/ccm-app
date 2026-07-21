import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/prisma.js', () => {
  const prisma = {
    ticketOrder: { findUnique: vi.fn() },
    adCampaign: { findUnique: vi.fn() },
    membership: { findUnique: vi.fn() },
    payment: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    paymentItem: { findMany: vi.fn(), updateMany: vi.fn() },
    // `$transaction` con callback: le pasa el MISMO cliente mockeado, que es lo más parecido a
    // lo que hace Prisma de verdad (un tx expone la misma superficie). No simula rollback: los
    // tests que necesitan verificar atomicidad lo hacen mirando el resultado final.
    $transaction: vi.fn(),
  }
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (c: unknown) => unknown)(prisma),
  )
  return { prisma }
})
vi.mock('./mpOAuthService.js', () => ({ getValidToken: vi.fn() }))
vi.mock('../lib/mpApi.js', () => ({ createPreference: vi.fn(), searchPaymentsByExternalReference: vi.fn() }))

import { prisma } from '../lib/prisma.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { env } from '../lib/env.js'
import {
  createCheckout,
  FALLOS_CONSECUTIVOS_PARA_ALERTAR,
  saludDeLaConsultaAMp,
  TIMEOUT_CONSULTA_VENCIMIENTO_MS,
  TOPE_CANDIDATOS_POR_CHECKOUT,
} from './mpCheckoutService.js'

/* ────────────────────────────────────────────────────────────────────────────
 *  Store en memoria de Payment + PaymentItem
 *
 *  No alcanza con `mockResolvedValueOnce`: lo que hay que demostrar acá es que la BASE es la que
 *  impide el doble cobro, y eso solo se ve con un store con estado real que haga cumplir el
 *  índice único parcial de la migración 9_ticket_multi_order_payment:
 *
 *      PaymentItem(kind, resourceId) WHERE "closedAt" IS NULL
 *
 *  `payment.create` con líneas anidadas revienta con P2002 si alguna línea toca un recurso que ya
 *  tiene una línea VIVA — igual que Postgres, y sin dejar el Payment a medio armar. Eso es lo
 *  único que permite reproducir de verdad dos requests concurrentes con `Promise.all`, y la
 *  carrera entre dos carritos que se solapan.
 * ──────────────────────────────────────────────────────────────────────────── */

interface FilaPayment {
  id: string
  deviceId: string | null
  amount: number
  status: string
  mpPreferenceId: string | null
  initPoint: string | null
  mpPaymentId: string | null
  createdAt: Date
  seq: number
}
interface FilaItem {
  id: string
  paymentId: string
  kind: string
  resourceId: string
  amount: number
  titulo: string
  closedAt: Date | null
  deliveredAt: Date | null
}

function crearStore() {
  let seq = 0
  const payments: FilaPayment[] = []
  const items: FilaItem[] = []

  /** Compara un valor de fila contra un filtro de Prisma (escalar, {not}, {notIn}, {in}, {lt}, {gte}). */
  function cumpleFiltro(valor: unknown, cond: unknown): boolean {
    if (cond === null) return valor === null
    if (cond instanceof Date) return valor instanceof Date && valor.getTime() === cond.getTime()
    if (typeof cond === 'object') {
      const c = cond as Record<string, unknown>
      if ('not' in c) {
        if (typeof c.not === 'object' && c.not !== null) return !cumpleFiltro(valor, c.not)
        return valor !== c.not
      }
      if ('notIn' in c) return !(c.notIn as unknown[]).includes(valor)
      if ('in' in c) return (c.in as unknown[]).includes(valor)
      if ('lt' in c && valor instanceof Date) return valor.getTime() < (c.lt as Date).getTime()
      if ('gte' in c && valor instanceof Date) return valor.getTime() >= (c.gte as Date).getTime()
      return false
    }
    return valor === cond
  }

  function itemCumple(it: FilaItem, where: Record<string, unknown>): boolean {
    for (const [k, cond] of Object.entries(where)) {
      if (k === 'OR') {
        if (!(cond as Record<string, unknown>[]).some((sub) => itemCumple(it, sub))) return false
        continue
      }
      if (k === 'payment') {
        const p = payments.find((x) => x.id === it.paymentId)
        if (!p || !paymentCumple(p, cond as Record<string, unknown>)) return false
        continue
      }
      if (!cumpleFiltro((it as unknown as Record<string, unknown>)[k], cond)) return false
    }
    return true
  }

  function paymentCumple(p: FilaPayment, where: Record<string, unknown>): boolean {
    for (const [k, cond] of Object.entries(where)) {
      if (k === 'items') {
        const some = (cond as { some: Record<string, unknown> }).some
        if (!items.some((it) => it.paymentId === p.id && itemCumple(it, some))) return false
        continue
      }
      if (!cumpleFiltro((p as unknown as Record<string, unknown>)[k], cond)) return false
    }
    return true
  }

  return {
    /** Siembra un cobro completo sin pasar por el chequeo de unicidad — para armar el escenario
     *  de partida de un test (un cobro que ya existía antes de la request bajo prueba). */
    sembrar(
      pago: Partial<FilaPayment>,
      lineas: { kind: string; resourceId: string; amount?: number; closedAt?: Date | null }[],
    ): string {
      seq += 1
      const id = pago.id ?? `pay_s${seq}`
      payments.push({
        deviceId: null,
        amount: 1000,
        status: 'pending',
        mpPreferenceId: null,
        initPoint: null,
        mpPaymentId: null,
        createdAt: new Date(),
        seq,
        ...pago,
        id,
      })
      for (const l of lineas) {
        seq += 1
        items.push({
          id: `it_s${seq}`,
          paymentId: id,
          kind: l.kind,
          resourceId: l.resourceId,
          amount: l.amount ?? 1000,
          titulo: 'sembrado',
          closedAt: l.closedAt ?? null,
          deliveredAt: null,
        })
      }
      return id
    },
    /** Todas las líneas VIVAS de un recurso. Si alguna vez hay más de una, el índice se rompió. */
    vivasDe: (kind: string, resourceId: string) =>
      items.filter((i) => i.kind === kind && i.resourceId === resourceId && i.closedAt === null),
    itemsDe: (paymentId: string) => items.filter((i) => i.paymentId === paymentId),
    pagos: () => payments,

    payment: {
      async create({ data }: { data: Record<string, unknown> }) {
        const nuevas = ((data.items as { create: Record<string, unknown>[] })?.create ?? []) as Record<string, unknown>[]
        // EL índice único parcial. Se chequea ANTES de insertar nada: si una línea choca, no
        // queda ni el Payment ni las otras líneas (transacción implícita del create anidado).
        for (const l of nuevas) {
          if (items.some((i) => i.kind === l.kind && i.resourceId === l.resourceId && i.closedAt === null)) {
            throw Object.assign(new Error('Unique constraint failed on the fields: (`kind`,`resourceId`)'), {
              code: 'P2002',
            })
          }
        }
        seq += 1
        const fila: FilaPayment = {
          id: `pay_${seq}`,
          deviceId: (data.deviceId as string | null) ?? null,
          amount: data.amount as number,
          status: (data.status as string) ?? 'pending',
          mpPreferenceId: null,
          initPoint: null,
          mpPaymentId: null,
          createdAt: new Date(),
          seq,
        }
        payments.push(fila)
        for (const l of nuevas) {
          seq += 1
          items.push({
            id: `it_${seq}`,
            paymentId: fila.id,
            kind: l.kind as string,
            resourceId: l.resourceId as string,
            amount: l.amount as number,
            titulo: l.titulo as string,
            closedAt: null,
            deliveredAt: null,
          })
        }
        return { ...fila }
      },
      async findMany({
        where,
        include,
        select,
        orderBy,
        take,
      }: {
        where: Record<string, unknown>
        include?: { items?: boolean }
        select?: Record<string, boolean>
        orderBy?: { createdAt?: 'asc' | 'desc' }
        take?: number
      }) {
        const encontradas = payments.filter((p) => paymentCumple(p, where ?? {}))
        // `seq` desempata de forma estable y respeta el orden de creación (el vencimiento pide
        // `createdAt: 'asc'` para atacar primero lo más viejo; el resto de la suite, `desc`).
        const asc = orderBy?.createdAt === 'asc'
        encontradas.sort((a, b) => (asc ? a.seq - b.seq : b.seq - a.seq))
        // `take` NO es decorativo: es el tope de candidatos que el vencimiento consulta contra MP.
        const recortadas = typeof take === 'number' ? encontradas.slice(0, take) : encontradas
        return recortadas.map((p) => {
          if (select) {
            const out: Record<string, unknown> = {}
            for (const k of Object.keys(select)) out[k] = (p as unknown as Record<string, unknown>)[k]
            return out
          }
          const base: Record<string, unknown> = { ...p }
          if (include?.items) base.items = items.filter((i) => i.paymentId === p.id).map((i) => ({ ...i }))
          return base
        })
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const fila = payments.find((p) => p.id === where.id)
        if (!fila) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' })
        Object.assign(fila, data)
        return { ...fila }
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        let count = 0
        for (const p of payments) {
          if (paymentCumple(p, where ?? {})) {
            Object.assign(p, data)
            count += 1
          }
        }
        return { count }
      },
    },

    paymentItem: {
      async findMany({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) {
        return items
          .filter((i) => itemCumple(i, where ?? {}))
          .map((i) => {
            if (!select) return { ...i }
            const out: Record<string, unknown> = {}
            for (const k of Object.keys(select)) out[k] = (i as unknown as Record<string, unknown>)[k]
            return out
          })
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        let count = 0
        for (const i of items) {
          if (itemCumple(i, where ?? {})) {
            Object.assign(i, data)
            count += 1
          }
        }
        return { count }
      },
    },
  }
}

type Store = ReturnType<typeof crearStore>

/** Enchufa un store con estado real al mock de prisma. Lo usa toda la suite. */
function enchufar(): Store {
  const store = crearStore()
  vi.mocked(prisma.payment.create).mockImplementation(store.payment.create as never)
  vi.mocked(prisma.payment.findMany).mockImplementation(store.payment.findMany as never)
  vi.mocked(prisma.payment.update).mockImplementation(store.payment.update as never)
  vi.mocked(prisma.payment.updateMany).mockImplementation(store.payment.updateMany as never)
  vi.mocked(prisma.paymentItem.findMany).mockImplementation(store.paymentItem.findMany as never)
  vi.mocked(prisma.paymentItem.updateMany).mockImplementation(store.paymentItem.updateMany as never)
  return store
}

/** Deja N órdenes listas para cobrar, con su total. Sin argumentos: ninguna orden existe. */
function ordenes(...defs: { id: string; total: number; qty?: number; deviceId?: string; status?: string }[]) {
  vi.mocked(prisma.ticketOrder.findUnique).mockImplementation((async ({ where }: { where: { id: string } }) => {
    const o = defs.find((d) => d.id === where.id)
    return o
      ? { id: o.id, total: o.total, qty: o.qty ?? 1, planId: 'p', status: o.status ?? 'iniciada', deviceId: o.deviceId ?? 'dev_1' }
      : null
  }) as never)
}

let store: Store

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidToken).mockResolvedValue('ACCESS-1')
  vi.mocked(prisma.membership.findUnique).mockResolvedValue(null as never)
  // Por default MP no conoce ningún pago para nuestros cobros: lo viejo está abandonado de
  // verdad. Los tests del cupón de efectivo pisan esto.
  vi.mocked(mpApi.searchPaymentsByExternalReference).mockResolvedValue([])
  vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_1', init_point: 'https://mp/checkout/pref_1' })
  ordenes()
  store = enchufar()
})

/** Lee el total que se le mandó a MP en la preferencia (suma de sus líneas). */
function montoEnviadoAMp(llamada = 0): number {
  const body = vi.mocked(mpApi.createPreference).mock.calls[llamada][1] as {
    items: { unit_price: number; quantity: number }[]
  }
  return body.items.reduce((acc, i) => acc + i.unit_price * i.quantity, 0)
}
function itemsEnviadosAMp(llamada = 0) {
  return (vi.mocked(mpApi.createPreference).mock.calls[llamada][1] as { items: { title: string; unit_price: number }[] })
    .items
}

describe('mpCheckoutService — el monto sale de la base', () => {
  it('una orden de entradas cobra su total congelado', async () => {
    ordenes({ id: 'ord_1', total: 66000, qty: 2 })
    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')
    expect(montoEnviadoAMp()).toBe(66000)
    expect(r.amount).toBe(66000)
    expect(r.initPoint).toBe('https://mp/checkout/pref_1')
  })

  it('la membresía cobra SOCIO_PRICE, no lo que diga nadie', async () => {
    await createCheckout([{ kind: 'membership', resourceId: 'dev_1' }], 'dev_1')
    expect(montoEnviadoAMp()).toBe(9900)
  })

  it('la campaña se recalcula por slot y horas', async () => {
    vi.mocked(prisma.adCampaign.findUnique).mockResolvedValue({ id: 'camp_1', slot: 'S2', hours: 5, total: 1 } as never)
    await createCheckout([{ kind: 'ad_campaign', resourceId: 'camp_1' }], 'dev_1')
    expect(montoEnviadoAMp()).toBe(30000)
  })

  it('la preferencia lleva external_reference con el id del Payment (es lo que reconcilia)', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')
    const body = vi.mocked(mpApi.createPreference).mock.calls[0][1] as { external_reference: string }
    expect(body.external_reference).toBe(r.paymentId)
  })

  it('notification_url y back_urls usan el host limpio de PUBLIC_BASE_URL', async () => {
    await createCheckout([{ kind: 'membership', resourceId: 'dev_1' }], 'dev_1')
    const body = vi.mocked(mpApi.createPreference).mock.calls[0][1] as {
      notification_url: string
      back_urls: { success: string; pending: string; failure: string }
    }
    expect(body.notification_url).toBe('http://localhost:4000/api/v1/mp/webhook')
    expect(body.back_urls.success).toBe('http://localhost:4000/entradas?pago=ok')
    expect(body.back_urls.pending).toBe('http://localhost:4000/entradas?pago=pendiente')
    expect(body.back_urls.failure).toBe('http://localhost:4000/entradas?pago=error')
  })
})

/**
 * (a) del pedido: el bug que motivó todo esto. El comprador elegía dos planes VIP, el front creaba
 * DOS órdenes y mandaba a MP el link de UNA — pagaba una y se llevaba las dos. Ahora un cobro
 * cubre las N órdenes: una preferencia, el total sumado, y las N líneas adentro.
 */
describe('mpCheckoutService — un cobro cubre N órdenes y cobra la SUMA', () => {
  it('carrito de 2 planes → 1 Payment, 2 PaymentItem, amount = suma, UNA sola preferencia con 2 líneas', async () => {
    ordenes({ id: 'ord_a', total: 30000, qty: 1 }, { id: 'ord_b', total: 45000, qty: 2 })

    const r = await createCheckout(
      [
        { kind: 'ticket_order', resourceId: 'ord_a' },
        { kind: 'ticket_order', resourceId: 'ord_b' },
      ],
      'dev_1',
    )

    // Una sola preferencia, con el total sumado repartido en dos líneas visibles para el comprador.
    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
    expect(montoEnviadoAMp()).toBe(75000)
    expect(itemsEnviadosAMp()).toHaveLength(2)
    expect(itemsEnviadosAMp().map((i) => i.unit_price).sort((a, b) => a - b)).toEqual([30000, 45000])

    // Y en la base: un solo cobro con dos líneas, cuya suma es el amount de la cabecera.
    expect(r.amount).toBe(75000)
    expect(r.items).toHaveLength(2)
    expect(store.pagos()).toHaveLength(1)
    expect(store.pagos()[0].amount).toBe(75000)
    const lineas = store.itemsDe(r.paymentId)
    expect(lineas).toHaveLength(2)
    expect(lineas.reduce((a, l) => a + l.amount, 0)).toBe(75000)
    expect(lineas.map((l) => l.resourceId).sort()).toEqual(['ord_a', 'ord_b'])
  })

  it('el orden de las líneas en el pedido no cambia nada: se normaliza ASC (es lo que evita deadlocks)', async () => {
    ordenes({ id: 'ord_a', total: 100 }, { id: 'ord_b', total: 200 })
    const r = await createCheckout(
      [
        { kind: 'ticket_order', resourceId: 'ord_b' },
        { kind: 'ticket_order', resourceId: 'ord_a' },
      ],
      'dev_1',
    )
    expect(r.items.map((l) => l.resourceId)).toEqual(['ord_a', 'ord_b'])
    expect(r.amount).toBe(300)
  })

  it('si una sola línea del carrito no es válida, NO se cobra nada (ni se crea el Payment)', async () => {
    ordenes({ id: 'ord_a', total: 100 }, { id: 'ord_b', total: 200, status: 'confirmada' })
    await expect(
      createCheckout(
        [
          { kind: 'ticket_order', resourceId: 'ord_a' },
          { kind: 'ticket_order', resourceId: 'ord_b' },
        ],
        'dev_1',
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_PAID' })
    expect(mpApi.createPreference).not.toHaveBeenCalled()
    expect(store.pagos()).toHaveLength(0)
  })
})

describe('mpCheckoutService — validación del carrito', () => {
  it('el mismo recurso repetido en el pedido es 400, no se deduplica en silencio', async () => {
    ordenes({ id: 'ord_a', total: 100 })
    await expect(
      createCheckout(
        [
          { kind: 'ticket_order', resourceId: 'ord_a' },
          { kind: 'ticket_order', resourceId: 'ord_a' },
        ],
        'dev_1',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('un carrito vacío es 400', async () => {
    await expect(createCheckout([], 'dev_1')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('más de 10 líneas es 400', async () => {
    const muchas = Array.from({ length: 11 }, (_, i) => ({ kind: 'ticket_order' as const, resourceId: `ord_${i}` }))
    await expect(createCheckout(muchas, 'dev_1')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('un espacio publicitario NO puede entrar en un carrito multi-línea (AdCampaign no tiene dueño en el modelo)', async () => {
    ordenes({ id: 'ord_a', total: 100 })
    await expect(
      createCheckout(
        [
          { kind: 'ticket_order', resourceId: 'ord_a' },
          { kind: 'ad_campaign', resourceId: 'camp_ajena' },
        ],
        'dev_1',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(mpApi.createPreference).not.toHaveBeenCalled()
  })
})

describe('mpCheckoutService — casos que no deben cobrar', () => {
  it('sin conexión responde 503 y no crea preferencia', async () => {
    vi.mocked(getValidToken).mockRejectedValue(Object.assign(new Error('x'), { status: 503, code: 'MP_NOT_CONNECTED' }))
    await expect(createCheckout([{ kind: 'membership', resourceId: 'dev_1' }], 'dev_1')).rejects.toMatchObject({
      code: 'MP_NOT_CONNECTED',
    })
    expect(mpApi.createPreference).not.toHaveBeenCalled()
  })

  it('una orden inexistente no crea cobro', async () => {
    await expect(createCheckout([{ kind: 'ticket_order', resourceId: 'ord_fantasma' }], 'dev_1')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    })
  })

  it('una orden ya confirmada no se vuelve a cobrar', async () => {
    ordenes({ id: 'ord_1', total: 1000, status: 'confirmada' })
    await expect(createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')).rejects.toMatchObject({
      code: 'ALREADY_PAID',
    })
  })

  it('un socio activo no puede volver a pagar la membresía', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ deviceId: 'dev_1', tier: 'socio' } as never)
    await expect(createCheckout([{ kind: 'membership', resourceId: 'dev_1' }], 'dev_1')).rejects.toMatchObject({
      code: 'ALREADY_PAID',
    })
    expect(mpApi.createPreference).not.toHaveBeenCalled()
  })

  it('una orden de total 0 no se manda a MP (un unit_price 0 lo rechaza con un 400 sin explicación)', async () => {
    ordenes({ id: 'ord_0', total: 0 })
    await expect(createCheckout([{ kind: 'ticket_order', resourceId: 'ord_0' }], 'dev_1')).rejects.toMatchObject({
      code: 'MP_API_ERROR',
    })
    expect(mpApi.createPreference).not.toHaveBeenCalled()
  })
})

describe('mpCheckoutService — verifica de quién es el recurso (defecto crítico 2)', () => {
  it('un device que no es dueño de la orden no puede generar el cobro (misma respuesta que "no existe")', async () => {
    ordenes({ id: 'ord_1', total: 1000, deviceId: 'dev_dueño' })

    await expect(createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_intruso')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      message: 'La orden no existe',
    })
    expect(mpApi.createPreference).not.toHaveBeenCalled()

    // Misma respuesta exacta que si la orden directamente no existiera: no hay que darle a un
    // atacante ninguna pista de que "no es tuya" es distinto de "no existe" — si no, podría
    // enumerar órdenes ajenas por diferencia de respuesta.
    ordenes()
    await expect(
      createCheckout([{ kind: 'ticket_order', resourceId: 'ord_fantasma' }], 'dev_intruso'),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', message: 'La orden no existe' })
  })
})

describe('mpCheckoutService — no permite doble cobro (defecto crítico 1)', () => {
  it('pedir el MISMO carrito dos veces reusa la preferencia: MP se llama una sola vez', async () => {
    ordenes({ id: 'ord_a', total: 1000 }, { id: 'ord_b', total: 2000 })
    const carrito = [
      { kind: 'ticket_order' as const, resourceId: 'ord_a' },
      { kind: 'ticket_order' as const, resourceId: 'ord_b' },
    ]

    const r1 = await createCheckout(carrito, 'dev_1')
    const r2 = await createCheckout(carrito, 'dev_1')

    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
    expect(r2.initPoint).toBe(r1.initPoint)
    expect(r2.paymentId).toBe(r1.paymentId)
  })
})

/**
 * (b) del pedido. Con un cobro por recurso esto lo resolvía el índice de Payment; ahora que un
 * cobro cubre N recursos, la pregunta se vuelve "¿alguna de estas órdenes YA está adentro de un
 * cobro vivo?" — incluso si el carrito nuevo es distinto. Nunca puede haber dos líneas vivas
 * sobre la misma orden, y NUNCA se le devuelve al carrito nuevo el link del cobro viejo (ese link
 * cobra otro monto: es exactamente el bug que estamos cerrando).
 */
describe('mpCheckoutService — una orden ya incluida en un cobro pendiente no puede entrar en un segundo cobro', () => {
  it('carrito {a,b} vivo → pedir {b,c} da COBRO_SOLAPADO con el link del cobro en curso, y no crea nada', async () => {
    ordenes({ id: 'ord_a', total: 1000 }, { id: 'ord_b', total: 2000 }, { id: 'ord_c', total: 3000 })

    const primero = await createCheckout(
      [
        { kind: 'ticket_order', resourceId: 'ord_a' },
        { kind: 'ticket_order', resourceId: 'ord_b' },
      ],
      'dev_1',
    )

    await expect(
      createCheckout(
        [
          { kind: 'ticket_order', resourceId: 'ord_b' },
          { kind: 'ticket_order', resourceId: 'ord_c' },
        ],
        'dev_1',
      ),
    ).rejects.toMatchObject({
      code: 'COBRO_SOLAPADO',
      status: 409,
      // El front necesita el link para ofrecer "retomar el pago en curso" en vez de dejar al
      // comprador en un callejón sin salida de 30 minutos.
      details: { paymentId: primero.paymentId, initPoint: primero.initPoint },
    })

    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
    expect(store.pagos()).toHaveLength(1)
    // Y lo importante: ord_b nunca queda con dos cobros vivos encima.
    expect(store.vivasDe('ticket_order', 'ord_b')).toHaveLength(1)
  })

  it('una orden ya incluida en un cobro de 2: pedirla SOLA también da COBRO_SOLAPADO', async () => {
    ordenes({ id: 'ord_a', total: 1000 }, { id: 'ord_b', total: 2000 })

    await createCheckout(
      [
        { kind: 'ticket_order', resourceId: 'ord_a' },
        { kind: 'ticket_order', resourceId: 'ord_b' },
      ],
      'dev_1',
    )

    await expect(createCheckout([{ kind: 'ticket_order', resourceId: 'ord_a' }], 'dev_1')).rejects.toMatchObject({
      code: 'COBRO_SOLAPADO',
    })
    expect(store.vivasDe('ticket_order', 'ord_a')).toHaveLength(1)
    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
  })

  it('cuando el cobro viejo se cierra (rechazado), las órdenes quedan libres y se puede armar otro carrito', async () => {
    ordenes({ id: 'ord_a', total: 1000 }, { id: 'ord_b', total: 2000 })
    // Cobro anterior YA cerrado: cabecera rejected y líneas selladas (así lo deja `cerrarPago`).
    store.sembrar({ status: 'rejected' }, [
      { kind: 'ticket_order', resourceId: 'ord_a', closedAt: new Date() },
      { kind: 'ticket_order', resourceId: 'ord_b', closedAt: new Date() },
    ])

    const r = await createCheckout(
      [
        { kind: 'ticket_order', resourceId: 'ord_a' },
        { kind: 'ticket_order', resourceId: 'ord_b' },
      ],
      'dev_1',
    )
    expect(r.amount).toBe(3000)
  })
})

describe('mpCheckoutService — atomicidad real ante concurrencia (defecto crítico A)', () => {
  /** createPreference con latencia real: es la ventana en la que cae un doble clic de verdad. */
  function preferenciaLenta() {
    let llamadas = 0
    vi.mocked(mpApi.createPreference).mockImplementation(async () => {
      llamadas += 1
      const n = llamadas
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { id: `pref_${n}`, init_point: `https://mp/checkout/pref_${n}` }
    })
  }

  it('dos createCheckout concurrentes con el MISMO carrito: MP se llama UNA sola vez y las dos reciben el mismo link', async () => {
    ordenes({ id: 'ord_a', total: 1000 }, { id: 'ord_b', total: 2000 })
    preferenciaLenta()
    const carrito = [
      { kind: 'ticket_order' as const, resourceId: 'ord_a' },
      { kind: 'ticket_order' as const, resourceId: 'ord_b' },
    ]

    const [r1, r2] = await Promise.all([createCheckout(carrito, 'dev_1'), createCheckout(carrito, 'dev_1')])

    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
    expect(r1.initPoint).toBe(r2.initPoint)
  }, 10_000)

  it('dos carritos SOLAPADOS concurrentes ({a,b} y {b,c}): uno crea, el otro se rechaza, y nunca hay dos cobros vivos sobre b', async () => {
    ordenes({ id: 'ord_a', total: 1000 }, { id: 'ord_b', total: 2000 }, { id: 'ord_c', total: 3000 })
    preferenciaLenta()

    const resultados = await Promise.allSettled([
      createCheckout(
        [
          { kind: 'ticket_order', resourceId: 'ord_a' },
          { kind: 'ticket_order', resourceId: 'ord_b' },
        ],
        'dev_1',
      ),
      createCheckout(
        [
          { kind: 'ticket_order', resourceId: 'ord_b' },
          { kind: 'ticket_order', resourceId: 'ord_c' },
        ],
        'dev_1',
      ),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rechazada = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(['COBRO_SOLAPADO', 'CHECKOUT_EN_CURSO']).toContain(rechazada.reason.code)
    // Lo que jamás puede pasar: dos cobros vivos tocando la misma orden.
    expect(store.vivasDe('ticket_order', 'ord_b')).toHaveLength(1)
    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
  }, 10_000)
})

/**
 * (c) del pedido. El comentario viejo afirmaba que filtrar por `mpPaymentId: null` alcanzaba para
 * no vencer nunca un pago en efectivo en curso. Era FALSO: `mpPaymentId` se puebla recién cuando
 * el webhook procesa el aviso, y entre que el comprador imprime el cupón de Rapipago y que ese
 * aviso llega (segundos, HORAS si el webhook falla, nunca si el secreto está mal configurado) la
 * fila sigue en null. A los 30 minutos se vencía, se liberaba el índice, el comprador generaba un
 * segundo cobro, y cuando MP acreditaba el efectivo había plata cobrada contra un Payment muerto.
 */
describe('mpCheckoutService — vencimiento perezoso de pendings abandonados', () => {
  const HACE_31_MIN = () => new Date(Date.now() - 31 * 60_000)

  it('un pending viejo que MP no conoce se vence solo y libera la orden', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    const viejo = store.sembrar(
      { mpPreferenceId: 'pref_viejo', initPoint: 'https://mp/checkout/pref_viejo', createdAt: HACE_31_MIN() },
      [{ kind: 'ticket_order', resourceId: 'ord_1' }],
    )
    vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_nuevo', init_point: 'https://mp/checkout/pref_nuevo' })

    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')

    expect(r.initPoint).toBe('https://mp/checkout/pref_nuevo')
    // El viejo quedó cerrado ENTERO: cabecera expired y línea sellada (si no, el índice seguiría
    // trabado y esto no habría podido crear nada).
    expect(store.pagos().find((p) => p.id === viejo)!.status).toBe('expired')
    expect(store.itemsDe(viejo)[0].closedAt).not.toBeNull()
    expect(store.vivasDe('ticket_order', 'ord_1')).toHaveLength(1)
  })

  it('⚠️ un CUPÓN DE EFECTIVO recién generado NO se vence, aunque el aviso de MP todavía no haya llegado', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    // El escenario exacto del bug: el comprador generó el cupón de Rapipago hace más de 30
    // minutos y el webhook nunca llegó (o está en pleno backoff de reintentos), así que acá
    // seguimos con mpPaymentId en null. Mirando SOLO la base, esta fila es indistinguible de un
    // abandono. Lo único que las distingue es MP.
    const conCupon = store.sembrar(
      {
        mpPreferenceId: 'pref_efectivo',
        initPoint: 'https://mp/checkout/pref_efectivo',
        mpPaymentId: null,
        createdAt: HACE_31_MIN(),
      },
      [{ kind: 'ticket_order', resourceId: 'ord_1' }],
    )
    vi.mocked(mpApi.searchPaymentsByExternalReference).mockResolvedValue([{ id: 987654, status: 'pending' } as never])

    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')

    // No se venció, no se creó una segunda preferencia, y el comprador recibe el MISMO link.
    expect(store.pagos().find((p) => p.id === conCupon)!.status).toBe('pending')
    expect(store.itemsDe(conCupon)[0].closedAt).toBeNull()
    expect(mpApi.createPreference).not.toHaveBeenCalled()
    expect(r.initPoint).toBe('https://mp/checkout/pref_efectivo')
    // Además se anota el payment_id que nos faltaba, para no tener que volver a preguntarle a MP.
    expect(store.pagos().find((p) => p.id === conCupon)!.mpPaymentId).toBe('987654')
  })

  it('si la consulta a MP falla, NO se vence (fail-closed: trabar un rato es recuperable, cobrar dos veces no)', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    const viejo = store.sembrar(
      { mpPreferenceId: 'pref_x', initPoint: 'https://mp/checkout/pref_x', createdAt: HACE_31_MIN() },
      [{ kind: 'ticket_order', resourceId: 'ord_1' }],
    )
    vi.mocked(mpApi.searchPaymentsByExternalReference).mockRejectedValue(new Error('MP no responde'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')

    expect(store.pagos().find((p) => p.id === viejo)!.status).toBe('pending')
    expect(r.initPoint).toBe('https://mp/checkout/pref_x')
    expect(mpApi.createPreference).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('un pago RECHAZADO en MP no bloquea el vencimiento (si no, una tarjeta rebotada trabaría la orden para siempre)', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    const viejo = store.sembrar(
      { mpPreferenceId: 'pref_y', initPoint: 'https://mp/checkout/pref_y', createdAt: HACE_31_MIN() },
      [{ kind: 'ticket_order', resourceId: 'ord_1' }],
    )
    vi.mocked(mpApi.searchPaymentsByExternalReference).mockResolvedValue([{ id: 1, status: 'rejected' } as never])
    vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_nuevo', init_point: 'https://mp/checkout/pref_nuevo' })

    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')

    expect(store.pagos().find((p) => p.id === viejo)!.status).toBe('expired')
    expect(r.initPoint).toBe('https://mp/checkout/pref_nuevo')
  })

  it('un pending viejo CON mpPaymentId ni siquiera se consulta: ya se sabe que hay un pago concreto', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    store.sembrar(
      {
        mpPreferenceId: 'pref_e',
        initPoint: 'https://mp/checkout/pref_e',
        mpPaymentId: 'mp_123456',
        createdAt: new Date(Date.now() - 10 * 24 * 3600_000),
      },
      [{ kind: 'ticket_order', resourceId: 'ord_1' }],
    )

    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')

    expect(mpApi.searchPaymentsByExternalReference).not.toHaveBeenCalled()
    expect(mpApi.createPreference).not.toHaveBeenCalled()
    expect(r.initPoint).toBe('https://mp/checkout/pref_e')
  })

  it('un pending RECIENTE sigue trabando: se reusa su initPoint, no se pregunta ni se crea otra preferencia', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    store.sembrar(
      { mpPreferenceId: 'pref_reciente', initPoint: 'https://mp/checkout/pref_reciente', createdAt: new Date(Date.now() - 5 * 60_000) },
      [{ kind: 'ticket_order', resourceId: 'ord_1' }],
    )

    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')

    expect(mpApi.searchPaymentsByExternalReference).not.toHaveBeenCalled()
    expect(mpApi.createPreference).not.toHaveBeenCalled()
    expect(r.initPoint).toBe('https://mp/checkout/pref_reciente')
  })

  /**
   * El costo de este barrido está EN EL CAMINO CALIENTE: el comprador está esperando su link de
   * pago mientras corre. Antes se consultaba a MP candidato por candidato, SECUENCIALMENTE, con el
   * timeout general de 10 s: con MP lento eso son 10 s POR CANDIDATO antes de que el comprador vea
   * nada. Y el fail-closed (correcto: ante un error de consulta no se vence) deja el recurso
   * trabado mientras la consulta siga fallando, con un `console.error` por incidente como único
   * rastro — invisible si el que falla es MP de forma sostenida.
   */
  describe('el barrido no puede costarle 10 s × N al comprador', () => {
    beforeEach(() => {
      saludDeLaConsultaAMp.fallosConsecutivos = 0
      saludDeLaConsultaAMp.desde = null
    })

    /** Siembra `n` pendings viejos, uno por orden, y devuelve el carrito que los toca a todos. */
    function sembrarViejos(n: number) {
      const defs = Array.from({ length: n }, (_, i) => ({ id: `ord_v${i}`, total: 1000 }))
      ordenes(...defs)
      for (const d of defs) {
        store.sembrar(
          { mpPreferenceId: `pref_${d.id}`, initPoint: `https://mp/checkout/${d.id}`, createdAt: HACE_31_MIN() },
          [{ kind: 'ticket_order', resourceId: d.id }],
        )
      }
      return defs.map((d) => ({ kind: 'ticket_order' as const, resourceId: d.id }))
    }

    it(`consulta como mucho ${TOPE_CANDIDATOS_POR_CHECKOUT} candidatos: el resto lo barre el próximo checkout`, async () => {
      const carrito = sembrarViejos(TOPE_CANDIDATOS_POR_CHECKOUT + 3)

      await createCheckout(carrito, 'dev_1').catch(() => {})

      expect(vi.mocked(mpApi.searchPaymentsByExternalReference).mock.calls.length).toBeLessThanOrEqual(
        TOPE_CANDIDATOS_POR_CHECKOUT,
      )
    })

    it('las consultas van EN PARALELO, no una atrás de otra', async () => {
      const carrito = sembrarViejos(3)
      let enVuelo = 0
      let maxEnVuelo = 0
      vi.mocked(mpApi.searchPaymentsByExternalReference).mockImplementation(async () => {
        enVuelo += 1
        maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
        await new Promise((r) => setTimeout(r, 20))
        enVuelo -= 1
        return []
      })

      await createCheckout(carrito, 'dev_1').catch(() => {})

      // Secuencial daría 1: nunca hay dos consultas abiertas a la vez.
      expect(maxEnVuelo).toBeGreaterThan(1)
    })

    it('usa un timeout PROPIO y más corto que el general de 10 s (el comprador está esperando)', async () => {
      const carrito = sembrarViejos(1)

      await createCheckout(carrito, 'dev_1').catch(() => {})

      expect(mpApi.searchPaymentsByExternalReference).toHaveBeenCalledWith(
        'ACCESS-1',
        expect.any(String),
        TIMEOUT_CONSULTA_VENCIMIENTO_MS,
      )
      expect(TIMEOUT_CONSULTA_VENCIMIENTO_MS).toBeLessThan(10_000)
    })

    it('el fail-closed se mantiene: si la consulta falla, no se vence nada', async () => {
      const carrito = sembrarViejos(1)
      vi.mocked(mpApi.searchPaymentsByExternalReference).mockRejectedValue(new Error('MP no responde'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await createCheckout(carrito, 'dev_1').catch(() => {})

      expect(store.pagos().every((p) => p.status === 'pending')).toBe(true)
      errSpy.mockRestore()
    })

    it('un fallo AISLADO no dispara alerta: sería ruido de fondo', async () => {
      const carrito = sembrarViejos(1)
      vi.mocked(mpApi.searchPaymentsByExternalReference).mockRejectedValue(new Error('blip'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await createCheckout(carrito, 'dev_1').catch(() => {})

      expect(errSpy.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('ALERTA'))).toHaveLength(0)
      errSpy.mockRestore()
    })

    it('un fail-closed SOSTENIDO es una condición de alerta, no un log perdido', async () => {
      vi.mocked(mpApi.searchPaymentsByExternalReference).mockRejectedValue(new Error('MP caído'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Cada checkout falla su consulta; a partir del umbral tiene que gritar.
      for (let i = 0; i < FALLOS_CONSECUTIVOS_PARA_ALERTAR; i++) {
        ordenes({ id: `ord_al${i}`, total: 1000 })
        store.sembrar(
          { mpPreferenceId: `pref_al${i}`, initPoint: `https://mp/al${i}`, createdAt: HACE_31_MIN() },
          [{ kind: 'ticket_order', resourceId: `ord_al${i}` }],
        )
        await createCheckout([{ kind: 'ticket_order', resourceId: `ord_al${i}` }], 'dev_1').catch(() => {})
      }

      const alerta = errSpy.mock.calls.map((c) => String(c[0])).find((s) => s.includes('ALERTA'))
      expect(alerta).toBeDefined()
      expect(saludDeLaConsultaAMp.fallosConsecutivos).toBeGreaterThanOrEqual(FALLOS_CONSECUTIVOS_PARA_ALERTAR)
      errSpy.mockRestore()
    })

    it('una consulta exitosa borra el contador: la alerta es de fallos CONSECUTIVOS', async () => {
      saludDeLaConsultaAMp.fallosConsecutivos = 99
      saludDeLaConsultaAMp.desde = new Date()
      const carrito = sembrarViejos(1)

      await createCheckout(carrito, 'dev_1').catch(() => {})

      expect(saludDeLaConsultaAMp.fallosConsecutivos).toBe(0)
      expect(saludDeLaConsultaAMp.desde).toBeNull()
    })
  })

  it('el vencimiento es por cobro ENTERO: un carrito de 2 abandonado libera las 2 órdenes juntas', async () => {
    ordenes({ id: 'ord_a', total: 1000 }, { id: 'ord_b', total: 2000 })
    const viejo = store.sembrar(
      { mpPreferenceId: 'pref_v', initPoint: 'https://mp/checkout/pref_v', createdAt: HACE_31_MIN() },
      [
        { kind: 'ticket_order', resourceId: 'ord_a' },
        { kind: 'ticket_order', resourceId: 'ord_b' },
      ],
    )
    vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_n', init_point: 'https://mp/checkout/pref_n' })

    // Alcanza con que el carrito nuevo toque UNA de las dos para que el cobro entero venza.
    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_a' }], 'dev_1')

    expect(r.initPoint).toBe('https://mp/checkout/pref_n')
    expect(store.itemsDe(viejo).every((i) => i.closedAt !== null)).toBe(true)
    // ord_b quedó libre también, no a medio camino.
    expect(store.vivasDe('ticket_order', 'ord_b')).toHaveLength(0)
  })
})

describe('mpCheckoutService — el espejo closedAt se repara solo si se desincroniza', () => {
  it('una línea VIVA sobre un Payment que ya no está pending se cierra y deja de trabar la orden', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    // Estado imposible por diseño, pero recuperable: si un bug lo produjera, sin el barrido esa
    // orden no se podría cobrar NUNCA MÁS y el síntoma sería un 409 eterno sin explicación.
    const roto = store.sembrar({ status: 'approved' }, [{ kind: 'ticket_order', resourceId: 'ord_1', closedAt: null }])
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const r = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')

    expect(store.itemsDe(roto)[0].closedAt).not.toBeNull()
    expect(r.initPoint).toBe('https://mp/checkout/pref_1')
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('mpCheckoutService — el reintento del comprador tras un fallo de persistencia no genera un segundo cobro (defecto crítico B)', () => {
  it('createPreference OK pero el update que guarda mpPreferenceId/initPoint falla siempre: el reintento NO crea una segunda preferencia', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    // El update SIEMPRE falla (no es un fallo transitorio que un reintento con backoff resuelva):
    // mpPreferenceId/initPoint nunca quedan guardados en la base.
    vi.mocked(prisma.payment.update).mockRejectedValue(new Error('la base no vuelve más'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const r1 = await createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')
    expect(r1.initPoint).toBe('https://mp/checkout/pref_1')

    // El comprador reintenta. El Payment de la primera vez quedó `pending` con
    // `mpPreferenceId: null` — invisible para el guard de reuso. Sin la red de contención, esto
    // genera una SEGUNDA preferencia pagable en MP (doble cobro si el comprador paga las dos).
    await expect(createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')).rejects.toMatchObject({
      code: 'CHECKOUT_EN_CURSO',
    })
    errSpy.mockRestore()

    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
    expect(store.vivasDe('ticket_order', 'ord_1')).toHaveLength(1)
  })
})

describe('mpCheckoutService — si falla el guardado post-creación no se pierde la preferencia (defecto crítico 3)', () => {
  it('createPreference OK + update posterior falla → el Payment NO queda rejected y se devuelve el initPoint', async () => {
    vi.mocked(prisma.payment.update).mockRejectedValueOnce(new Error('la base se cayó justo acá'))

    const r = await createCheckout([{ kind: 'membership', resourceId: 'dev_1' }], 'dev_1')

    expect(r.initPoint).toBe('https://mp/checkout/pref_1')
    // La preferencia está viva en MP: etiquetar el cobro como rechazado sería mentirle a
    // cualquiera que reconcilie después. Y las líneas siguen vivas (el recurso, reservado).
    expect(store.pagos()[0].status).toBe('pending')
    expect(store.vivasDe('membership', 'dev_1')).toHaveLength(1)
  })

  it('si createPreference FALLA, el cobro se cierra entero (cabecera + líneas) y la orden queda libre', async () => {
    ordenes({ id: 'ord_1', total: 1000 })
    vi.mocked(mpApi.createPreference).mockRejectedValue(new Error('MP explotó'))

    await expect(createCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }], 'dev_1')).rejects.toMatchObject({
      code: 'MP_API_ERROR',
    })

    expect(store.pagos()[0].status).toBe('rejected')
    // Si solo se moviera la cabecera, la orden quedaría trabada por un cobro que no existe.
    expect(store.vivasDe('ticket_order', 'ord_1')).toHaveLength(0)
  })
})

describe('mpCheckoutService — la base sale de PUBLIC_BASE_URL, no de recortar MP_REDIRECT_URI (defecto importante 4)', () => {
  const originalPublicBaseUrl = env.PUBLIC_BASE_URL
  const originalRedirectUri = env.MP_REDIRECT_URI

  afterEach(() => {
    env.PUBLIC_BASE_URL = originalPublicBaseUrl
    env.MP_REDIRECT_URI = originalRedirectUri
  })

  it('usa PUBLIC_BASE_URL (con la barra final recortada) y arma un notification_url absoluto', async () => {
    env.PUBLIC_BASE_URL = 'https://ccm.example.com/'
    // MP_REDIRECT_URI con una forma que el regex viejo (recorte de '/api/v1/mp/callback') NO
    // matchea: si el código todavía dependiera de él, notification_url saldría con esta URL
    // entera pegada adelante en vez del host limpio de PUBLIC_BASE_URL.
    env.MP_REDIRECT_URI = 'https://otra-cosa.mercadopago.com/oauth/authorize'

    await createCheckout([{ kind: 'membership', resourceId: 'dev_1' }], 'dev_1')

    const body = vi.mocked(mpApi.createPreference).mock.calls[0][1] as {
      notification_url: string
      back_urls: { success: string; pending: string; failure: string }
    }
    expect(body.notification_url).toBe('https://ccm.example.com/api/v1/mp/webhook')
    expect(body.back_urls.success).toBe('https://ccm.example.com/entradas?pago=ok')
    expect(body.back_urls.pending).toBe('https://ccm.example.com/entradas?pago=pendiente')
    expect(body.back_urls.failure).toBe('https://ccm.example.com/entradas?pago=error')
  })
})
