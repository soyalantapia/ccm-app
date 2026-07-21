import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma.js', () => {
  const prisma = {
    payment: { update: vi.fn(), updateMany: vi.fn() },
    paymentItem: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  }
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (c: unknown) => unknown)(prisma),
  )
  return { prisma }
})

import { prisma } from '../lib/prisma.js'
import { cerrarPago, cerrarPagoSiSigueEn } from './mpPaymentState.js'

/**
 * `cerrarPago` es el único escritor del espejo `PaymentItem.closedAt`, que es literalmente lo que
 * hace cumplir el índice único parcial contra el doble cobro. Si la cabecera y las líneas se
 * mueven por separado, el índice deja de proteger EN SILENCIO (o traba un recurso para siempre).
 */
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.payment.update).mockResolvedValue({} as never)
  vi.mocked(prisma.payment.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(prisma.paymentItem.updateMany).mockResolvedValue({ count: 1 } as never)
})

describe('cerrarPago', () => {
  it('mueve cabecera y líneas en la MISMA transacción', async () => {
    await cerrarPago('pay_1', 'approved', { raw: { x: 1 } })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay_1' },
      data: { status: 'approved', raw: { x: 1 } },
    })
    const args = vi.mocked(prisma.paymentItem.updateMany).mock.calls[0][0] as {
      where: { paymentId: string; closedAt: null }
      data: { closedAt: Date }
    }
    expect(args.where).toEqual({ paymentId: 'pay_1', closedAt: null })
    expect(args.data.closedAt).toBeInstanceOf(Date)
  })
})

describe('cerrarPagoSiSigueEn — bloqueo optimista', () => {
  it('si la cabecera sigue en el estado leído, cierra todo y devuelve true', async () => {
    const ok = await cerrarPagoSiSigueEn('pay_2', 'pending', 'rejected', { mpPaymentId: '900' })

    expect(ok).toBe(true)
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay_2', status: 'pending' },
      data: { status: 'rejected', mpPaymentId: '900' },
    })
    expect(prisma.paymentItem.updateMany).toHaveBeenCalled()
  })

  it('⚠️ si perdió la carrera (la cabecera cambió), NO toca las líneas: cerrarlas liberaría un cobro ajeno ya aprobado', async () => {
    vi.mocked(prisma.payment.updateMany).mockResolvedValue({ count: 0 } as never)

    const ok = await cerrarPagoSiSigueEn('pay_3', 'pending', 'rejected')

    expect(ok).toBe(false)
    // Este es el punto del test: con la forma de ARRAY de $transaction las dos escrituras corren
    // siempre, y un aviso viejo que perdió la carrera igual habría sellado las líneas de un cobro
    // que en ese instante quedó aprobado — el recurso quedaría libre para cobrarse de nuevo.
    expect(prisma.paymentItem.updateMany).not.toHaveBeenCalled()
  })
})
