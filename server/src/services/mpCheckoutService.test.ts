import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    ticketOrder: { findUnique: vi.fn() },
    adCampaign: { findUnique: vi.fn() },
    payment: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
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
