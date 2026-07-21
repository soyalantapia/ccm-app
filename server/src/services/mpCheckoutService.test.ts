import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    ticketOrder: { findUnique: vi.fn() },
    adCampaign: { findUnique: vi.fn() },
    payment: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  },
}))
vi.mock('./mpOAuthService.js', () => ({ getValidToken: vi.fn() }))
vi.mock('../lib/mpApi.js', () => ({ createPreference: vi.fn() }))

import { prisma } from '../lib/prisma.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { env } from '../lib/env.js'
import { createCheckout } from './mpCheckoutService.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidToken).mockResolvedValue('ACCESS-1')
  vi.mocked(prisma.payment.create).mockResolvedValue({ id: 'pay_1' } as never)
  // Sin Payment reusable por default: cada test que quiera probar la reutilización lo pisa.
  vi.mocked(prisma.payment.findFirst).mockResolvedValue(null as never)
  // Default que guarda bien: `vi.clearAllMocks()` borra el historial de llamadas pero NO
  // implementaciones (`mockResolvedValue`/`mockRejectedValue`) — sin este default explícito acá,
  // un test que pise `payment.update` con `mockRejectedValue` (no `Once`) dejaría ese fallo
  // filtrando hacia tests posteriores que no lo esperan.
  vi.mocked(prisma.payment.update).mockResolvedValue({} as never)
  // Sin pendings viejos que vencer por default: el `updateMany` de vencimiento matchea 0 filas
  // salvo que un test arme un store real (ver `crearPaymentStoreEnMemoria`) que lo implemente.
  vi.mocked(prisma.payment.updateMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_1', init_point: 'https://mp/checkout/pref_1' })
})

/** Lee el monto que se le mandó a MP en la preferencia. */
function montoEnviadoAMp(): number {
  const body = vi.mocked(mpApi.createPreference).mock.calls[0][1] as { items: { unit_price: number; quantity: number }[] }
  return body.items.reduce((acc, i) => acc + i.unit_price * i.quantity, 0)
}

describe('mpCheckoutService — el monto sale de la base', () => {
  it('una orden de entradas cobra su total congelado', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 66000, qty: 2, planId: 'sab-night-vip', status: 'iniciada', deviceId: 'dev_1' } as never)
    const r = await createCheckout('ticket_order', 'ord_1', 'dev_1')
    expect(montoEnviadoAMp()).toBe(66000)
    expect(r.initPoint).toBe('https://mp/checkout/pref_1')
  })

  it('la membresía cobra SOCIO_PRICE, no lo que diga nadie', async () => {
    await createCheckout('membership', 'dev_1', 'dev_1')
    expect(montoEnviadoAMp()).toBe(9900)
  })

  it('la campaña se recalcula por slot y horas', async () => {
    vi.mocked(prisma.adCampaign.findUnique).mockResolvedValue({ id: 'camp_1', slot: 'S2', hours: 5, total: 1 } as never)
    await createCheckout('ad_campaign', 'camp_1', 'dev_1')
    expect(montoEnviadoAMp()).toBe(30000)
  })

  it('la preferencia lleva external_reference con el id del Payment (es lo que reconcilia)', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada', deviceId: 'dev_1' } as never)
    await createCheckout('ticket_order', 'ord_1', 'dev_1')
    const body = vi.mocked(mpApi.createPreference).mock.calls[0][1] as { external_reference: string }
    expect(body.external_reference).toBe('pay_1')
  })

  // Cobertura extra (no viene en el brief): server/test/setup.ts define
  // PUBLIC_BASE_URL = 'http://localhost:4000'. baseUrl() la usa tal cual (sin recortar nada de
  // MP_REDIRECT_URI) para armar notification_url y back_urls. El resto de estos tests mockean
  // mpApi.createPreference entero y nunca miran esos dos campos.
  it('notification_url y back_urls usan el host limpio de PUBLIC_BASE_URL', async () => {
    await createCheckout('membership', 'dev_1', 'dev_1')
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

describe('mpCheckoutService — casos que no deben cobrar', () => {
  it('sin conexión responde 503 y no crea preferencia', async () => {
    vi.mocked(getValidToken).mockRejectedValue(Object.assign(new Error('x'), { status: 503, code: 'MP_NOT_CONNECTED' }))
    await expect(createCheckout('membership', 'dev_1', 'dev_1')).rejects.toMatchObject({ code: 'MP_NOT_CONNECTED' })
    expect(mpApi.createPreference).not.toHaveBeenCalled()
  })

  it('una orden inexistente no crea cobro', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue(null as never)
    await expect(createCheckout('ticket_order', 'ord_fantasma', 'dev_1')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' })
  })

  it('una orden ya confirmada no se vuelve a cobrar', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'confirmada', deviceId: 'dev_1' } as never)
    await expect(createCheckout('ticket_order', 'ord_1', 'dev_1')).rejects.toMatchObject({ code: 'ALREADY_PAID' })
  })
})

describe('mpCheckoutService — no permite doble cobro (defecto crítico 1)', () => {
  it('pedir el cobro dos veces para la misma orden reusa la preferencia: MP se llama una sola vez', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada', deviceId: 'dev_1' } as never)

    // Primer pedido: no hay ningún Payment pending con preferencia todavía → crea uno nuevo.
    const r1 = await createCheckout('ticket_order', 'ord_1', 'dev_1')

    // Segundo pedido (doble clic, dos pestañas, reintento del navegador): ya existe un Payment
    // pending con la preferencia guardada para esa misma (kind, resourceId) → hay que reusarla,
    // no crear otra preferencia nueva en MP.
    vi.mocked(prisma.payment.findFirst).mockResolvedValueOnce({
      id: 'pay_1',
      mpPreferenceId: 'pref_1',
      initPoint: r1.initPoint,
    } as never)
    const r2 = await createCheckout('ticket_order', 'ord_1', 'dev_1')

    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
    expect(r2.initPoint).toBe(r1.initPoint)
  })
})

describe('mpCheckoutService — verifica de quién es el recurso (defecto crítico 2)', () => {
  it('un device que no es dueño de la orden no puede generar el cobro (misma respuesta que "no existe")', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada', deviceId: 'dev_dueño' } as never)

    await expect(createCheckout('ticket_order', 'ord_1', 'dev_intruso')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      message: 'La orden no existe',
    })
    expect(mpApi.createPreference).not.toHaveBeenCalled()

    // Misma respuesta exacta que si la orden directamente no existiera: no hay que darle a un
    // atacante ninguna pista de que "La orden no existe" (mismatch) es distinto de "no existe"
    // (null) — si no, podría enumerar órdenes ajenas por diferencia de respuesta.
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue(null as never)
    await expect(createCheckout('ticket_order', 'ord_fantasma', 'dev_intruso')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      message: 'La orden no existe',
    })
  })
})

/**
 * A diferencia de `mockResolvedValueOnce` (que solo puede simular el caso SECUENCIAL: primero
 * termina la request 1 entera, RECIÉN AHÍ se pisa el mock para la request 2), este store tiene
 * estado real y hace cumplir el índice único parcial que agrega la migración
 * 9_mp_payment_pending_unique (un solo Payment `pending` por (kind, resourceId)): `create` tira
 * un error `{ code: 'P2002' }` si ya hay un pending para ese par. Es lo único que permite
 * reproducir la carrera de DOS requests concurrentes de verdad con `Promise.all`.
 */
function crearPaymentStoreEnMemoria() {
  let autoincremento = 0
  const filas: {
    id: string
    kind: string
    resourceId: string
    deviceId: string | null
    amount: number
    status: string
    mpPreferenceId: string | null
    initPoint: string | null
    mpPaymentId: string | null
    createdAt: Date
  }[] = []

  function coincide(fila: (typeof filas)[number], where: Record<string, unknown>): boolean {
    if ('kind' in where && fila.kind !== where.kind) return false
    if ('resourceId' in where && fila.resourceId !== where.resourceId) return false
    if ('status' in where && fila.status !== where.status) return false
    if ('mpPreferenceId' in where) {
      const cond = where.mpPreferenceId as { not?: null } | null
      if (cond === null) {
        if (fila.mpPreferenceId !== null) return false
      } else if (cond && 'not' in cond && cond.not === null) {
        if (fila.mpPreferenceId === null) return false
      }
    }
    // A diferencia de mpPreferenceId (arriba, siempre viene envuelto en `{ not: null }`), el
    // `where` de vencimiento pide `mpPaymentId: null` DIRECTO (sin envolver) — el corazón de la
    // tarea: jamás vencer un pending que MP ya asoció a un pago concreto (efectivo pendiente de
    // acreditación).
    if ('mpPaymentId' in where && where.mpPaymentId === null && fila.mpPaymentId !== null) return false
    if ('createdAt' in where) {
      const cond = where.createdAt as { gte?: Date; lt?: Date }
      if (cond?.gte && fila.createdAt.getTime() < cond.gte.getTime()) return false
      if (cond?.lt && fila.createdAt.getTime() >= cond.lt.getTime()) return false
    }
    return true
  }

  return {
    /** Siembra una fila directo, sin pasar por el chequeo de unicidad de `create` — para armar
     * el escenario de partida de un test (un Payment `pending` que ya existía antes de la
     * request bajo prueba), con `createdAt`/`mpPaymentId` a medida. */
    sembrar: (fila: Partial<(typeof filas)[number]> & { kind: string; resourceId: string }) => {
      autoincremento += 1
      filas.push({
        id: `pay_${autoincremento}`,
        deviceId: null,
        amount: 1000,
        status: 'pending',
        mpPreferenceId: null,
        initPoint: null,
        mpPaymentId: null,
        createdAt: new Date(),
        ...fila,
      })
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const yaHayPending = filas.some((f) => f.kind === data.kind && f.resourceId === data.resourceId && f.status === 'pending')
      if (yaHayPending) {
        throw Object.assign(new Error('Unique constraint failed on the fields: (`kind`,`resourceId`)'), { code: 'P2002' })
      }
      autoincremento += 1
      const fila = {
        id: `pay_${autoincremento}`,
        kind: data.kind as string,
        resourceId: data.resourceId as string,
        deviceId: (data.deviceId as string | null) ?? null,
        amount: data.amount as number,
        status: (data.status as string) ?? 'pending',
        mpPreferenceId: null,
        initPoint: null,
        mpPaymentId: null,
        createdAt: new Date(),
      }
      filas.push(fila)
      return { ...fila }
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const candidatas = filas.filter((f) => coincide(f, where))
      candidatas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      return candidatas[0] ? { ...candidatas[0] } : null
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const fila = filas.find((f) => f.id === where.id)
      if (!fila) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' })
      Object.assign(fila, data)
      return { ...fila }
    },
    /** Simula el `updateMany` condicional de vencimiento: aplica `data` a TODAS las filas que
     * matchean `where` (así lo haría Postgres), devuelve cuántas tocó. */
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0
      for (const f of filas) {
        if (coincide(f, where)) {
          Object.assign(f, data)
          count += 1
        }
      }
      return { count }
    },
  }
}

describe('mpCheckoutService — atomicidad real ante concurrencia (defecto crítico A)', () => {
  it('dos createCheckout concurrentes para la misma orden: MP se llama UNA sola vez (con store con estado real, no mockResolvedValueOnce)', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada', deviceId: 'dev_1' } as never)

    const store = crearPaymentStoreEnMemoria()
    vi.mocked(prisma.payment.create).mockImplementation(store.create as never)
    vi.mocked(prisma.payment.findFirst).mockImplementation(store.findFirst as never)
    vi.mocked(prisma.payment.update).mockImplementation(store.update as never)

    // Latencia real en createPreference (50ms): es la ventana en la que un doble clic real cae
    // de lleno. Sin ella, todo el `Promise.all` corre en microtasks y nunca se demuestra nada.
    let llamadas = 0
    vi.mocked(mpApi.createPreference).mockImplementation(async () => {
      llamadas += 1
      const n = llamadas
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { id: `pref_${n}`, init_point: `https://mp/checkout/pref_${n}` }
    })

    const [r1, r2] = await Promise.all([
      createCheckout('ticket_order', 'ord_1', 'dev_1'),
      createCheckout('ticket_order', 'ord_1', 'dev_1'),
    ])

    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
    // Las dos requests tienen que terminar con el MISMO link — nunca dos preferencias vivas
    // pagables para la misma orden.
    expect(r1.initPoint).toBe(r2.initPoint)
  }, 10_000)

  it('en secuencial (una request termina antes de que arranque la otra) da 1 sola preferencia, para contrastar con el caso concurrente', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada', deviceId: 'dev_1' } as never)

    const store = crearPaymentStoreEnMemoria()
    vi.mocked(prisma.payment.create).mockImplementation(store.create as never)
    vi.mocked(prisma.payment.findFirst).mockImplementation(store.findFirst as never)
    vi.mocked(prisma.payment.update).mockImplementation(store.update as never)
    vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_1', init_point: 'https://mp/checkout/pref_1' })

    const r1 = await createCheckout('ticket_order', 'ord_1', 'dev_1')
    const r2 = await createCheckout('ticket_order', 'ord_1', 'dev_1')

    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
    expect(r1.initPoint).toBe(r2.initPoint)
  })
})

describe('mpCheckoutService — vencimiento perezoso de pendings abandonados (Tarea 8)', () => {
  it('un pending viejo SIN mpPaymentId no traba: se vence solo y se genera un cobro nuevo', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada', deviceId: 'dev_1' } as never)

    const store = crearPaymentStoreEnMemoria()
    // El abandono típico del brief: tocó "comprar", MP le armó una preferencia (mpPreferenceId
    // + initPoint viven), cerró la pestaña, MP nunca avisó nada (mpPaymentId sigue null). 31
    // minutos: un toque pasado del umbral de 30.
    store.sembrar({
      kind: 'ticket_order',
      resourceId: 'ord_1',
      mpPreferenceId: 'pref_viejo',
      initPoint: 'https://mp/checkout/pref_viejo',
      mpPaymentId: null,
      createdAt: new Date(Date.now() - 31 * 60_000),
    })
    vi.mocked(prisma.payment.create).mockImplementation(store.create as never)
    vi.mocked(prisma.payment.findFirst).mockImplementation(store.findFirst as never)
    vi.mocked(prisma.payment.update).mockImplementation(store.update as never)
    vi.mocked(prisma.payment.updateMany).mockImplementation(store.updateMany as never)
    vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_nuevo', init_point: 'https://mp/checkout/pref_nuevo' })

    const r = await createCheckout('ticket_order', 'ord_1', 'dev_1')

    // No reusa el link viejo: se venció, así que hay que haber pasado por MP de nuevo.
    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
    expect(r.initPoint).toBe('https://mp/checkout/pref_nuevo')
  })

  it('un pending RECIENTE sigue trabando: se reusa su initPoint, no se crea otra preferencia', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada', deviceId: 'dev_1' } as never)

    const store = crearPaymentStoreEnMemoria()
    // 5 minutos: todavía puede tener el checkout de MP abierto en otra pestaña — no hay que
    // tocarlo.
    store.sembrar({
      kind: 'ticket_order',
      resourceId: 'ord_1',
      mpPreferenceId: 'pref_reciente',
      initPoint: 'https://mp/checkout/pref_reciente',
      mpPaymentId: null,
      createdAt: new Date(Date.now() - 5 * 60_000),
    })
    vi.mocked(prisma.payment.create).mockImplementation(store.create as never)
    vi.mocked(prisma.payment.findFirst).mockImplementation(store.findFirst as never)
    vi.mocked(prisma.payment.update).mockImplementation(store.update as never)
    vi.mocked(prisma.payment.updateMany).mockImplementation(store.updateMany as never)

    const r = await createCheckout('ticket_order', 'ord_1', 'dev_1')

    expect(mpApi.createPreference).not.toHaveBeenCalled()
    expect(r.initPoint).toBe('https://mp/checkout/pref_reciente')
  })

  it('un pending viejo CON mpPaymentId (efectivo esperando acreditación) NO se vence nunca, por más viejo que sea', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada', deviceId: 'dev_1' } as never)

    const store = crearPaymentStoreEnMemoria()
    // 10 días: MUCHO más viejo que el umbral, pero mpPaymentId != null significa que MP YA
    // conoce un pago concreto para esto (p.ej. un boleto de Rapipago pendiente de acreditación).
    // Vencerlo liberaría el índice, el comprador generaría un segundo cobro, y cuando MP acredite
    // el efectivo tendríamos plata cobrada contra un Payment marcado 'expired'.
    store.sembrar({
      kind: 'ticket_order',
      resourceId: 'ord_1',
      mpPreferenceId: 'pref_efectivo',
      initPoint: 'https://mp/checkout/pref_efectivo',
      mpPaymentId: 'mp_123456',
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60_000),
    })
    vi.mocked(prisma.payment.create).mockImplementation(store.create as never)
    vi.mocked(prisma.payment.findFirst).mockImplementation(store.findFirst as never)
    vi.mocked(prisma.payment.update).mockImplementation(store.update as never)
    vi.mocked(prisma.payment.updateMany).mockImplementation(store.updateMany as never)

    const r = await createCheckout('ticket_order', 'ord_1', 'dev_1')

    expect(mpApi.createPreference).not.toHaveBeenCalled()
    expect(r.initPoint).toBe('https://mp/checkout/pref_efectivo')
  })
})

describe('mpCheckoutService — el reintento del comprador tras un fallo de persistencia no genera un segundo cobro (defecto crítico B)', () => {
  it('createPreference OK pero el update que guarda mpPreferenceId/initPoint falla siempre: el reintento del comprador NO crea una segunda preferencia', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada', deviceId: 'dev_1' } as never)

    const store = crearPaymentStoreEnMemoria()
    vi.mocked(prisma.payment.create).mockImplementation(store.create as never)
    vi.mocked(prisma.payment.findFirst).mockImplementation(store.findFirst as never)
    // El update SIEMPRE falla (no es un fallo transitorio que un reintento con backoff
    // resuelva): mpPreferenceId/initPoint nunca quedan guardados en la base.
    vi.mocked(prisma.payment.update).mockRejectedValue(new Error('la base no vuelve más'))
    vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_1', init_point: 'https://mp/checkout/pref_1' })

    // Primer pedido: MP ya le dio un link real al comprador (la preferencia está viva), aunque
    // no se haya podido guardar en la base.
    const r1 = await createCheckout('ticket_order', 'ord_1', 'dev_1')
    expect(r1.initPoint).toBe('https://mp/checkout/pref_1')

    // El comprador reintenta (el link no le sirvió / volvió a tocar "pagar"). El Payment de la
    // primera vez quedó `pending` con `mpPreferenceId: null` para siempre — invisible para el
    // guard de reuso. Sin la red de contención del defecto B, esto genera una SEGUNDA
    // preferencia pagable en MP (doble cobro si el comprador paga las dos).
    await expect(createCheckout('ticket_order', 'ord_1', 'dev_1')).rejects.toMatchObject({ code: 'CHECKOUT_EN_CURSO' })

    expect(mpApi.createPreference).toHaveBeenCalledTimes(1)
  })
})

describe('mpCheckoutService — si falla el guardado post-creación no se pierde la preferencia (defecto crítico 3)', () => {
  it('createPreference OK + update posterior falla → el Payment NO queda rejected y se devuelve el initPoint', async () => {
    vi.mocked(prisma.payment.update).mockRejectedValueOnce(new Error('la base se cayó justo acá'))

    const r = await createCheckout('membership', 'dev_1', 'dev_1')

    expect(r.initPoint).toBe('https://mp/checkout/pref_1')
    // Ninguna llamada a update debe haber marcado el Payment como rechazado: la preferencia
    // está viva en MP, etiquetarla rejected sería mentirle a cualquiera que reconcilie después.
    const llamadasAUpdate = vi.mocked(prisma.payment.update).mock.calls as unknown as { data?: { status?: string } }[][]
    const marcoRechazado = llamadasAUpdate.some(([args]) => args?.data?.status === 'rejected')
    expect(marcoRechazado).toBe(false)
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

    await createCheckout('membership', 'dev_1', 'dev_1')

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
