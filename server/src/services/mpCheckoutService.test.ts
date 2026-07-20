import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    ticketOrder: { findUnique: vi.fn() },
    adCampaign: { findUnique: vi.fn() },
    payment: { create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('./mpOAuthService.js', () => ({ getValidToken: vi.fn() }))
vi.mock('../lib/mpApi.js', () => ({ createPreference: vi.fn() }))

import { prisma } from '../lib/prisma.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { createCheckout } from './mpCheckoutService.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidToken).mockResolvedValue('ACCESS-1')
  vi.mocked(prisma.payment.create).mockResolvedValue({ id: 'pay_1' } as never)
  vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_1', init_point: 'https://mp/checkout/pref_1' })
})

/** Lee el monto que se le mandó a MP en la preferencia. */
function montoEnviadoAMp(): number {
  const body = vi.mocked(mpApi.createPreference).mock.calls[0][1] as { items: { unit_price: number; quantity: number }[] }
  return body.items.reduce((acc, i) => acc + i.unit_price * i.quantity, 0)
}

describe('mpCheckoutService — el monto sale de la base', () => {
  it('una orden de entradas cobra su total congelado', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 66000, qty: 2, planId: 'sab-night-vip', status: 'iniciada' } as never)
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
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada' } as never)
    await createCheckout('ticket_order', 'ord_1', 'dev_1')
    const body = vi.mocked(mpApi.createPreference).mock.calls[0][1] as { external_reference: string }
    expect(body.external_reference).toBe('pay_1')
  })

  // Cobertura extra (no viene en el brief): server/test/setup.ts define
  // MP_REDIRECT_URI = 'http://localhost:4000/api/v1/mp/callback'. baseUrl() le recorta el
  // sufijo '/api/v1/mp/callback' con un regex para armar notification_url y back_urls. Si ese
  // recorte no matcheara (p.ej. porque alguien cambia el redirect URI real y deja de terminar
  // exactamente en ese sufijo), notification_url y back_urls saldrían con la URL completa del
  // callback de OAuth pegada adelante — basura silenciosa, porque el resto de estos tests
  // mockean mpApi.createPreference entero y nunca miran esos dos campos.
  it('notification_url y back_urls usan el host limpio, sin el sufijo de /mp/callback', async () => {
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
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'confirmada' } as never)
    await expect(createCheckout('ticket_order', 'ord_1', 'dev_1')).rejects.toMatchObject({ code: 'ALREADY_PAID' })
  })
})
