import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    ticketOrder: { update: vi.fn() },
    // findUnique además de update: `activar()` necesita leer AdCampaign.hours (lo comprado) para
    // calcular expiresAt — ese dato no viaja en el Payment (que solo tiene el monto). Sin este
    // mock, "una campaña se pone al aire..." explota con "adCampaign.findUnique is not a function"
    // (desvío respecto del brief, documentado en el informe).
    adCampaign: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('./mpOAuthService.js', () => ({ getValidToken: vi.fn() }))
vi.mock('../lib/mpApi.js', () => ({ getPayment: vi.fn() }))
vi.mock('./membershipService.js', () => ({ becomeSocio: vi.fn() }))

import { prisma } from '../lib/prisma.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { becomeSocio } from './membershipService.js'
import { handleNotification, verificarFirma } from './mpWebhookService.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidToken).mockResolvedValue('ACCESS-1')
  vi.mocked(prisma.payment.findFirst).mockResolvedValue(null as never)
  vi.mocked(prisma.payment.update).mockResolvedValue({} as never)
})

function pagoAprobado(ref: string) {
  vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 111, status: 'approved', external_reference: ref } as never)
}

describe('webhook — verificación de firma', () => {
  it('rechaza una firma que no corresponde', () => {
    const ok = verificarFirma({ 'x-signature': 'ts=1,v1=firmafalsa', 'x-request-id': 'req-1' }, '111')
    expect(ok).toBe(false)
  })

  it('sin secreto configurado NO acepta cualquier cosa', () => {
    const ok = verificarFirma({}, '111')
    expect(ok).toBe(false)
  })
})

describe('webhook — activa el recurso al aprobarse', () => {
  it('una orden de entradas pasa a confirmada', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ id: 'pay_1', kind: 'ticket_order', resourceId: 'ord_1', deviceId: 'dev_1', status: 'pending' } as never)
    pagoAprobado('pay_1')
    await handleNotification('111', true)
    expect(prisma.ticketOrder.update).toHaveBeenCalledWith({ where: { id: 'ord_1' }, data: { status: 'confirmada' } })
  })

  it('una membresía deja al device como socio', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ id: 'pay_2', kind: 'membership', resourceId: 'dev_1', deviceId: 'dev_1', amount: 9900, status: 'pending' } as never)
    pagoAprobado('pay_2')
    await handleNotification('111', true)
    expect(becomeSocio).toHaveBeenCalledWith('dev_1', 9900)
  })

  it('una campaña se pone al aire con su ventana de horas', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ id: 'pay_3', kind: 'ad_campaign', resourceId: 'camp_1', status: 'pending' } as never)
    vi.mocked(prisma.adCampaign.update).mockResolvedValue({} as never)
    pagoAprobado('pay_3')
    await handleNotification('111', true)
    const args = vi.mocked(prisma.adCampaign.update).mock.calls[0][0] as { data: { status: string; startsAt: Date; expiresAt: Date } }
    expect(args.data.status).toBe('activa')
    expect(args.data.expiresAt.getTime()).toBeGreaterThan(args.data.startsAt.getTime())
  })
})

describe('webhook — lo que NO debe pasar', () => {
  it('con firma inválida no activa nada', async () => {
    await handleNotification('111', false)
    expect(mpApi.getPayment).not.toHaveBeenCalled()
    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()
  })

  it('un pago pendiente (efectivo) NO confirma la orden', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ id: 'pay_4', kind: 'ticket_order', resourceId: 'ord_1', status: 'pending' } as never)
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 111, status: 'pending', external_reference: 'pay_4' } as never)
    await handleNotification('111', true)
    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()
  })

  it('el mismo pago avisado dos veces se procesa una sola vez', async () => {
    vi.mocked(prisma.payment.findFirst).mockResolvedValue({ id: 'pay_1', mpPaymentId: '111', status: 'approved' } as never)
    await handleNotification('111', true)
    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()
  })
})
