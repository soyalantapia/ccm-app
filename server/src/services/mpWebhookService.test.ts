import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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
import { env } from '../lib/env.js'
import { handleNotification, verificarFirma } from './mpWebhookService.js'
import { createHmac } from 'node:crypto'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidToken).mockResolvedValue('ACCESS-1')
  vi.mocked(prisma.payment.findFirst).mockResolvedValue(null as never)
  vi.mocked(prisma.payment.update).mockResolvedValue({} as never)
  // Camino aprobado feliz: por default el gate atómico deja pasar (los tests que necesitan
  // simular la carrera/el fallo pisan esto con un mock con estado real, ver `filaFake` abajo).
  vi.mocked(prisma.payment.updateMany).mockResolvedValue({ count: 1 } as never)
})

function pagoAprobado(ref: string, status: string = 'approved') {
  vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 111, status, external_reference: ref } as never)
}

/**
 * Fila de Payment con estado REAL en memoria, para poder probar el gate atómico (defecto B.3)
 * de verdad: `updateMany`/`findUnique`/`update`/`findFirst` leen y escriben sobre el MISMO
 * objeto, respetando el `where` como lo haría Postgres (coincide TODO lo pedido en el `where`
 * contra el valor actual de la fila). Esto es a propósito más pesado que un `mockResolvedValueOnce`:
 * un mock que "siempre dice que sí" no puede demostrar una condición de carrera ni que el
 * segundo aviso reintenta después de que el primero soltó el claim.
 */
function filaFake(overrides: Partial<Record<string, unknown>>) {
  const fila: Record<string, unknown> = {
    id: 'pay_x',
    kind: 'ticket_order',
    resourceId: 'ord_x',
    deviceId: null,
    amount: 1000,
    status: 'pending',
    mpPaymentId: null,
    ...overrides,
  }

  function coincide(where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([k, v]) => fila[k] === v)
  }

  vi.mocked(prisma.payment.updateMany).mockImplementation((async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if (coincide(args.where)) {
      Object.assign(fila, args.data)
      return { count: 1 }
    }
    return { count: 0 }
  }) as never)
  vi.mocked(prisma.payment.findFirst).mockImplementation((async (args: { where: Record<string, unknown> }) => {
    return coincide(args.where) ? { ...fila } : null
  }) as never)
  vi.mocked(prisma.payment.findUnique).mockImplementation((async () => ({ ...fila })) as never)
  vi.mocked(prisma.payment.update).mockImplementation((async (args: { data: Record<string, unknown> }) => {
    Object.assign(fila, args.data)
    return { ...fila }
  }) as never)

  return fila
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

  describe('con MP_WEBHOOK_SECRET configurado', () => {
    const original = env.MP_WEBHOOK_SECRET
    beforeEach(() => {
      env.MP_WEBHOOK_SECRET = 'secreto-de-test'
    })
    afterEach(() => {
      env.MP_WEBHOOK_SECRET = original
    })

    function firmar(dataId: string, requestId: string, ts: string): string {
      const v1 = createHmac('sha256', 'secreto-de-test').update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex')
      return `ts=${ts},v1=${v1}`
    }

    it('valida cuando el request-id llega en x-request-id (caso sin proxy)', () => {
      const firma = firmar('111', 'req-original', '1700000000')
      const ok = verificarFirma({ 'x-signature': firma, 'x-request-id': 'req-original' }, '111')
      expect(ok).toBe(true)
    })

    // Defecto A: detrás del proxy de Railway (ver "1 hop" en app.ts), Railway reescribe el
    // header entrante X-Request-Id y expone el ORIGINAL (el que MP usó para firmar) como
    // X-Railway-Request-Id. Si la verificación solo mira x-request-id, la firma falla para el
    // 100% del tráfico real: MP cobra, nada se activa, y (hoy, sin el fix de D) cero rastro.
    it('valida cuando el identificador llega en x-railway-request-id en vez de x-request-id', () => {
      const firma = firmar('111', 'req-original-de-mp', '1700000000')
      const ok = verificarFirma(
        {
          'x-signature': firma,
          // Lo que Railway dejó en x-request-id NO es el que MP usó para firmar (lo reescribió):
          'x-request-id': 'req-reescrito-por-railway',
          'x-railway-request-id': 'req-original-de-mp',
        },
        '111',
      )
      expect(ok).toBe(true)
    })

    it('si NINGUNO de los dos candidatos matchea, sigue rechazando', () => {
      const firma = firmar('111', 'req-original-de-mp', '1700000000')
      const ok = verificarFirma(
        { 'x-signature': firma, 'x-request-id': 'otra-cosa', 'x-railway-request-id': 'otra-cosa-mas' },
        '111',
      )
      expect(ok).toBe(false)
    })
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

  /**
   * El test de arriba termina donde empieza el problema: comprueba que el aviso `pending` no
   * confirma nada (correcto) y ahí corta. Pero un pago en efectivo NO termina en `pending` — MP
   * avisa de nuevo, sobre EL MISMO pago y la MISMA fila, cuando la plata se acredita días
   * después. Esta es esa secuencia completa, que es el camino normal de Rapipago/PagoFácil en
   * Argentina, no un caso de borde.
   */
  it('efectivo: el aviso pending y DESPUÉS el approved del mismo pago sí confirma la orden', async () => {
    const fila = filaFake({ id: 'pay_efectivo', kind: 'ticket_order', resourceId: 'ord_efectivo' })

    // 1) MP genera el cupón: avisa "pending". No se entrega nada todavía, y está bien.
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 222, status: 'pending', external_reference: 'pay_efectivo' } as never)
    await handleNotification('222', true)
    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()

    // 2) El comprador va al kiosco y paga. MP avisa el MISMO pago, ahora acreditado.
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 222, status: 'approved', external_reference: 'pay_efectivo' } as never)
    await handleNotification('222', true)

    // La plata entró de verdad: la entrada TIENE que quedar confirmada.
    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(1)
    expect(fila.status).toBe('approved')
  })

  it('tarjeta en revisión: in_process y después approved también entrega', async () => {
    const fila = filaFake({ id: 'pay_revision', kind: 'ticket_order', resourceId: 'ord_revision' })

    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 333, status: 'in_process', external_reference: 'pay_revision' } as never)
    await handleNotification('333', true)

    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 333, status: 'approved', external_reference: 'pay_revision' } as never)
    await handleNotification('333', true)

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(1)
    expect(fila.status).toBe('approved')
  })

  /**
   * La contracara del arreglo: sacar `mpPaymentId` de la rama no aprobada no puede haber
   * debilitado el candado que impide entregar dos veces. Se prueba con la secuencia peor:
   * un `pending` previo (que antes quemaba el candado) y DESPUÉS dos avisos de aprobación
   * concurrentes sobre la misma fila.
   */
  it('pending y después dos approved CONCURRENTES: entrega una sola vez', async () => {
    const fila = filaFake({ id: 'pay_carrera', kind: 'ticket_order', resourceId: 'ord_carrera' })

    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 444, status: 'pending', external_reference: 'pay_carrera' } as never)
    await handleNotification('444', true)

    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 444, status: 'approved', external_reference: 'pay_carrera' } as never)
    await Promise.all([handleNotification('444', true), handleNotification('444', true)])

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(1)
    expect(fila.status).toBe('approved')
  })
})

describe('webhook — defecto B: activar antes de marcar aprobado, sin bloquear el reintento', () => {
  it('el mismo pago avisado dos veces SEGUIDAS activa una sola vez', async () => {
    const fila = filaFake({ id: 'pay_5', kind: 'ticket_order', resourceId: 'ord_5' })
    pagoAprobado('pay_5')

    await handleNotification('111', true)
    await handleNotification('111', true)

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(1)
    expect(fila.status).toBe('approved')
  })

  it('dos avisos CONCURRENTES del mismo pago activan una sola vez (gate atómico, no mockResolvedValueOnce)', async () => {
    const fila = filaFake({ id: 'pay_6', kind: 'ticket_order', resourceId: 'ord_6' })
    pagoAprobado('pay_6')

    await Promise.all([handleNotification('111', true), handleNotification('111', true)])

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(1)
    expect(fila.status).toBe('approved')
  })

  it('si la activación falla, el Payment NO queda bloqueado y un segundo aviso reintenta', async () => {
    const fila = filaFake({ id: 'pay_7', kind: 'ticket_order', resourceId: 'ord_7' })
    pagoAprobado('pay_7')
    vi.mocked(prisma.ticketOrder.update).mockRejectedValueOnce(new Error('P2025 simulado: la orden ya no existe'))

    await expect(handleNotification('111', true)).rejects.toThrow()

    // No debe quedar marcado como aprobado ni con el claim tomado: si quedara `approved` o con
    // `mpPaymentId` seteado, el segundo aviso de MP nunca volvería a intentar activar.
    expect(fila.status).not.toBe('approved')
    expect(fila.mpPaymentId).toBeNull()

    // Segundo aviso: esta vez ticketOrder.update no está pisado con el reject de una sola vez,
    // así que debería poder completar la activación.
    await handleNotification('111', true)

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(2)
    expect(fila.status).toBe('approved')
  })

  it('membership con deviceId nulo: no activa, deja log, y no queda marcado como entregado', async () => {
    const fila = filaFake({ id: 'pay_8', kind: 'membership', resourceId: 'dev_borrado', deviceId: null, amount: 9900 })
    pagoAprobado('pay_8')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(handleNotification('111', true)).rejects.toThrow()

    expect(becomeSocio).not.toHaveBeenCalled()
    expect(fila.status).not.toBe('approved')
    expect(fila.mpPaymentId).toBeNull() // no debe quedar bloqueado tampoco
    expect(errSpy).toHaveBeenCalled()

    errSpy.mockRestore()
  })
})

describe('webhook — defecto C: reversos y vencimientos NO son "pendiente"', () => {
  it('un pago cancelled (efectivo vencido) libera el índice único: NO queda pending', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ id: 'pay_9', kind: 'ticket_order', resourceId: 'ord_9', status: 'pending' } as never)
    pagoAprobado('pay_9', 'cancelled')

    await handleNotification('111', true)

    const args = vi.mocked(prisma.payment.update).mock.calls[0][0] as { data: { status: string } }
    expect(args.data.status).not.toBe('pending')
    expect(args.data.status).toBe('rejected')
  })

  it('un pago refunded se registra como tal y deja el log accionable', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: 'pay_10',
      kind: 'ticket_order',
      resourceId: 'ord_10',
      deviceId: 'dev_10',
      status: 'approved', // ya estaba aprobado y entregado
    } as never)
    pagoAprobado('pay_10', 'refunded')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handleNotification('111', true)

    const args = vi.mocked(prisma.payment.update).mock.calls[0][0] as { data: { status: string } }
    expect(args.data.status).toBe('refunded')
    expect(errSpy).toHaveBeenCalled()

    errSpy.mockRestore()
  })
})
