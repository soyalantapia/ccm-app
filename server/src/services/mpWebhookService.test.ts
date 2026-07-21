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

  /**
   * Soporta las pocas formas de `where` que usa el servicio: igualdad, `{ not }`, `{ notIn }` y
   * `OR`. Si aparece una condición nueva, TIRA en vez de devolver `false` en silencio — un fake
   * que ignora un filtro que no entiende haría pasar tests que en Postgres fallarían.
   */
  function coincideValor(actual: unknown, cond: unknown): boolean {
    if (cond !== null && typeof cond === 'object') {
      const c = cond as Record<string, unknown>
      if ('not' in c) return actual !== c.not
      if ('notIn' in c) return !(c.notIn as unknown[]).includes(actual)
      throw new Error(`filaFake: condición no soportada ${JSON.stringify(cond)}`)
    }
    return actual === cond
  }

  function coincide(where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Record<string, unknown>[]).some((sub) => coincide(sub))
      return coincideValor(fila[k], v)
    })
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

    const args = vi.mocked(prisma.payment.updateMany).mock.calls[0][0] as { data: { status: string } }
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

    const args = vi.mocked(prisma.payment.updateMany).mock.calls[0][0] as { data: { status: string } }
    expect(args.data.status).toBe('refunded')
    expect(errSpy).toHaveBeenCalled()

    errSpy.mockRestore()
  })
})

/**
 * P0-A: una MISMA preferencia (mismo external_reference = Payment.id) puede generar VARIOS
 * payment_id distintos en MP — la tarjeta rebota, el comprador paga con otra. El guard viejo
 * usaba `mpPaymentId IS NULL` como sinónimo de "todavía no procesado": el primer aviso (el
 * rechazado, o el cupón de efectivo) ocupaba el campo y el APROBADO que llegaba después se
 * descartaba en silencio. Plata cobrada, entrada nunca entregada.
 */
describe('webhook — P0-A: la idempotencia es por payment_id CONCRETO, no por "hay algún mpPaymentId"', () => {
  it('rechazado con una tarjeta y aprobado con otra: el aprobado SÍ entrega', async () => {
    const fila = filaFake({ id: 'pay_A', kind: 'ticket_order', resourceId: 'ord_A' })

    // Intento 1: la tarjeta rebota. Ocupa mpPaymentId con el payment_id 900.
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 900, status: 'rejected', external_reference: 'pay_A' } as never)
    await handleNotification('900', true)
    expect(fila.mpPaymentId).toBe('900')

    // Intento 2: paga con otra tarjeta. Es OTRO payment_id y viene aprobado.
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 901, status: 'approved', external_reference: 'pay_A' } as never)
    await handleNotification('901', true)

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(1)
    expect(fila.status).toBe('approved')
    expect(fila.mpPaymentId).toBe('901')
  })

  it('efectivo pendiente y después acreditado (mismo payment_id) entrega una sola vez', async () => {
    const fila = filaFake({ id: 'pay_A2', kind: 'ticket_order', resourceId: 'ord_A2' })

    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 902, status: 'pending', external_reference: 'pay_A2' } as never)
    await handleNotification('902', true)
    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()

    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 902, status: 'approved', external_reference: 'pay_A2' } as never)
    await handleNotification('902', true)
    await handleNotification('902', true) // reintento de MP del MISMO evento: no puede duplicar

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(1)
    expect(fila.status).toBe('approved')
  })

  it('un SEGUNDO payment_id aprobado sobre un pago ya entregado no re-entrega, pero grita en el log', async () => {
    const fila = filaFake({ id: 'pay_A3', kind: 'ticket_order', resourceId: 'ord_A3', status: 'approved', mpPaymentId: '903' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 904, status: 'approved', external_reference: 'pay_A3' } as never)

    await handleNotification('904', true)

    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()
    expect(fila.mpPaymentId).toBe('903')
    expect(errSpy).toHaveBeenCalled() // doble cobro real: alguien tiene que devolver esa plata
    errSpy.mockRestore()
  })
})

/**
 * P0-B: la rama de estados no-aprobados hacía un `update` INCONDICIONAL. Un aviso viejo, o uno
 * de OTRO payment_id que llega desordenado, pisaba un Payment `approved` (ya entregado) y lo
 * dejaba en `rejected`/`pending`. Un pago aprobado NO retrocede de estado.
 */
describe('webhook — P0-B: un pago aprobado no puede retroceder de estado', () => {
  it('un rechazo tardío de OTRO payment_id no degrada un pago ya aprobado y entregado', async () => {
    const fila = filaFake({ id: 'pay_B', kind: 'ticket_order', resourceId: 'ord_B', status: 'approved', mpPaymentId: '901' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 900, status: 'rejected', external_reference: 'pay_B' } as never)

    await handleNotification('900', true)

    expect(fila.status).toBe('approved')
    expect(fila.mpPaymentId).toBe('901')
    errSpy.mockRestore()
  })

  it('un pending desordenado tampoco lo devuelve a pendiente (re-trabaría el índice único)', async () => {
    const fila = filaFake({ id: 'pay_B2', kind: 'ticket_order', resourceId: 'ord_B2', status: 'approved', mpPaymentId: '901' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 901, status: 'in_process', external_reference: 'pay_B2' } as never)

    await handleNotification('901', true)

    expect(fila.status).toBe('approved')
    errSpy.mockRestore()
  })

  it('approved → refunded SÍ es una transición válida (el reverso tiene que quedar registrado)', async () => {
    const fila = filaFake({ id: 'pay_B3', kind: 'ticket_order', resourceId: 'ord_B3', status: 'approved', mpPaymentId: '901' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 901, status: 'refunded', external_reference: 'pay_B3' } as never)

    await handleNotification('901', true)

    expect(fila.status).toBe('refunded')
    errSpy.mockRestore()
  })

  it('un rechazo que llega después de un reverso tampoco lo pisa', async () => {
    const fila = filaFake({ id: 'pay_B4', kind: 'ticket_order', resourceId: 'ord_B4', status: 'refunded', mpPaymentId: '901' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 900, status: 'rejected', external_reference: 'pay_B4' } as never)

    await handleNotification('900', true)

    expect(fila.status).toBe('refunded')
    errSpy.mockRestore()
  })
})
