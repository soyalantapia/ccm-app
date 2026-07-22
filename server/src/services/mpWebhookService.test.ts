import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/prisma.js', () => {
  const prisma = {
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    // Las líneas del cobro: un Payment cubre N recursos y la entrega se marca por línea.
    // `count` lo usa el deshacer del claim (para que la cabecera siga a las líneas) y `findMany`
    // la detección del doble cobro repartido en DOS filas Payment.
    paymentItem: { update: vi.fn(), updateMany: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    ticketOrder: { update: vi.fn() },
    // findUnique además de update: `activar()` necesita leer AdCampaign.hours (lo comprado) para
    // calcular expiresAt — ese dato no viaja en el Payment (que solo tiene el monto).
    adCampaign: { findUnique: vi.fn(), update: vi.fn() },
    membership: { upsert: vi.fn() },
    // Un evento con precio se entrega creando la inscripción, así que `activar()` toca
    // Registration. Y `$queryRaw` porque esa creación va detrás del mismo `SELECT ... FOR UPDATE`
    // sobre la fila del Event que usa register(): el @@unique no protege con blockId null.
    registration: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
    // `$transaction` en sus dos formas. Con callback le pasa el MISMO cliente mockeado (un tx de
    // Prisma expone la misma superficie). No simula rollback: lo que estos tests verifican es el
    // resultado final, no el rollback.
    $transaction: vi.fn(),
  }
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (c: unknown) => unknown)(prisma),
  )
  return { prisma }
})
vi.mock('./mpOAuthService.js', () => ({ getValidToken: vi.fn() }))
vi.mock('../lib/mpApi.js', () => ({ getPayment: vi.fn(), searchPaymentsByExternalReference: vi.fn() }))
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
  // `clearAllMocks` borra las llamadas pero NO las implementaciones: un `mockRejectedValue` (sin
  // `Once`) puesto por un test para simular una entrega fallida se filtraba a los siguientes y
  // los hacía fallar por un motivo que no tenía nada que ver con lo que probaban. Se resetea acá,
  // una vez, en vez de pedirle a cada test que se acuerde de limpiar.
  vi.mocked(prisma.ticketOrder.update).mockReset()
  vi.mocked(getValidToken).mockResolvedValue('ACCESS-1')
  vi.mocked(prisma.payment.findFirst).mockResolvedValue(null as never)
  vi.mocked(prisma.payment.update).mockResolvedValue({} as never)
  // Camino aprobado feliz: por default el gate atómico deja pasar (los tests que necesitan
  // simular la carrera/el fallo pisan esto con un mock con estado real, ver `cobroFake` abajo).
  vi.mocked(prisma.payment.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(prisma.paymentItem.update).mockResolvedValue({} as never)
  vi.mocked(prisma.paymentItem.updateMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.paymentItem.count).mockResolvedValue(0 as never)
  // Por default NINGUNA otra fila Payment entregó estos recursos (el detector de doble cobro
  // repartido no encuentra nada). Los tests que reproducen ese caso lo pisan.
  vi.mocked(prisma.paymentItem.findMany).mockResolvedValue([] as never)
  // Por default MP no conoce ningún pago vivo para la preferencia: un rechazo es un rechazo y
  // punto. Los tests del reintento dentro de la misma preferencia lo pisan.
  vi.mocked(mpApi.searchPaymentsByExternalReference).mockResolvedValue([] as never)
  // Entrega de un evento pago: por default no hay inscripción previa y el lock no devuelve nada.
  vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never)
  vi.mocked(prisma.registration.findFirst).mockResolvedValue(null as never)
  vi.mocked(prisma.registration.create).mockResolvedValue({} as never)
  vi.mocked(prisma.registration.update).mockResolvedValue({} as never)
})

function pagoAprobado(ref: string, status: string = 'approved') {
  vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 111, status, external_reference: ref } as never)
}

interface LineaFake {
  kind: string
  resourceId: string
  amount?: number
  closedAt?: Date | null
  deliveredAt?: Date | null
}

/**
 * Cobro (cabecera + líneas) con estado REAL en memoria, para poder probar el gate atómico
 * (defecto B.3) de verdad: `updateMany`/`findUnique`/`update` leen y escriben sobre los MISMOS
 * objetos, respetando el `where` como lo haría Postgres. Esto es a propósito más pesado que un
 * `mockResolvedValueOnce`: un mock que "siempre dice que sí" no puede demostrar una condición de
 * carrera, ni que el segundo aviso reintenta después de que el primero soltó el claim, ni que una
 * entrega parcial no se repite.
 *
 * Las líneas arrancan VIVAS (`closedAt: null`) si el cobro está pending, y selladas si ya
 * terminó: es el invariante que sostienen `cerrarPago`/`vencerPendientesAbandonados`.
 */
function cobroFake(overrides: Partial<Record<string, unknown>> = {}, lineasDef: LineaFake[] = [{ kind: 'ticket_order', resourceId: 'ord_x' }]) {
  const fila: Record<string, unknown> = {
    id: 'pay_x',
    deviceId: null,
    amount: 1000,
    status: 'pending',
    mpPaymentId: null,
    ...overrides,
  }
  const items = lineasDef.map((l, i) => ({
    id: `it_${i}`,
    paymentId: fila.id as string,
    kind: l.kind,
    resourceId: l.resourceId,
    amount: l.amount ?? (fila.amount as number),
    titulo: 'linea',
    closedAt: l.closedAt !== undefined ? l.closedAt : fila.status === 'pending' ? null : new Date(),
    deliveredAt: l.deliveredAt ?? null,
  }))

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
      throw new Error(`cobroFake: condición no soportada ${JSON.stringify(cond)}`)
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
  vi.mocked(prisma.payment.findUnique).mockImplementation((async () => ({
    ...fila,
    items: items.map((i) => ({ ...i })),
  })) as never)
  vi.mocked(prisma.payment.update).mockImplementation((async (args: { data: Record<string, unknown> }) => {
    Object.assign(fila, args.data)
    return { ...fila }
  }) as never)
  vi.mocked(prisma.paymentItem.update).mockImplementation((async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const it = items.find((i) => i.id === args.where.id)
    if (!it) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' })
    Object.assign(it, args.data)
    return { ...it }
  }) as never)
  vi.mocked(prisma.paymentItem.updateMany).mockImplementation((async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    let count = 0
    for (const it of items) {
      const w = args.where as { paymentId?: string; closedAt?: null }
      if (w.paymentId && it.paymentId !== w.paymentId) continue
      if ('closedAt' in w && w.closedAt === null && it.closedAt !== null) continue
      Object.assign(it, args.data)
      count += 1
    }
    return { count }
  }) as never)
  // Conteo de líneas VIVAS, sobre los MISMOS objetos: es lo que le permite al deshacer del claim
  // mirar el estado real de las líneas (que un proceso concurrente pudo haber cerrado en el
  // medio) en vez de suponerlo.
  vi.mocked(prisma.paymentItem.count).mockImplementation((async (args: { where: { paymentId?: string; closedAt?: null } }) => {
    return items.filter((it) => {
      if (args.where.paymentId && it.paymentId !== args.where.paymentId) return false
      if ('closedAt' in args.where && args.where.closedAt === null) return it.closedAt === null
      return true
    }).length
  }) as never)

  return { fila, items }
}

/** El invariante del espejo, escrito una sola vez: `closedAt IS NULL` ⟺ `status = 'pending'`. */
function invarianteDelEspejo(fila: Record<string, unknown>, items: { closedAt: Date | null }[]): boolean {
  const hayVivas = items.some((i) => i.closedAt === null)
  return hayVivas === (fila.status === 'pending')
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
    cobroFake({ id: 'pay_1', deviceId: 'dev_1' }, [{ kind: 'ticket_order', resourceId: 'ord_1' }])
    pagoAprobado('pay_1')
    await handleNotification('111', true)
    expect(prisma.ticketOrder.update).toHaveBeenCalledWith({ where: { id: 'ord_1' }, data: { status: 'confirmada' } })
  })

  it('una membresía deja al device como socio', async () => {
    cobroFake({ id: 'pay_2', deviceId: 'dev_1', amount: 9900 }, [{ kind: 'membership', resourceId: 'dev_1', amount: 9900 }])
    pagoAprobado('pay_2')
    await handleNotification('111', true)
    // El tercer argumento es el cliente de la transacción (para que alta de socio y marca de
    // entrega sean atómicas): no se fija en cuál, sí en que el monto no lo elige el cliente.
    expect(becomeSocio).toHaveBeenCalledWith('dev_1', 9900, expect.anything())
  })

  it('un evento pago crea la inscripción del comprador', async () => {
    cobroFake({ id: 'pay_ev', deviceId: 'dev_1', amount: 45000 }, [
      { kind: 'event', resourceId: 'ev_taller', amount: 45000 },
    ])
    pagoAprobado('pay_ev')
    await handleNotification('111', true)
    expect(prisma.registration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceId: 'dev_1',
          eventId: 'ev_taller',
          blockId: null,
          status: 'confirmada',
        }),
      }),
    )
  })

  it('la inscripción se crea detrás del lock de la fila del Event, no con un create pelado', async () => {
    // Sin el lock, dos avisos de MP en carrera crean DOS inscripciones: el @@unique
    // (deviceId,eventId,blockId) no protege este caso porque blockId es null y en Postgres dos
    // NULL se consideran distintos dentro de un índice único.
    cobroFake({ id: 'pay_ev2', deviceId: 'dev_1', amount: 45000 }, [
      { kind: 'event', resourceId: 'ev_taller', amount: 45000 },
    ])
    pagoAprobado('pay_ev2')
    await handleNotification('111', true)
    const sql = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as unknown as string[]
    expect(sql.join('?')).toContain('"Event"')
    expect(sql.join('?')).toContain('FOR UPDATE')
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prisma.registration.create).mock.invocationCallOrder[0],
    )
  })

  it('un aviso repetido NO genera una segunda inscripción (ni un segundo QR)', async () => {
    // MP reenvía el aviso seguido. Si ya hay una inscripción confirmada, activar() sale sin tocar
    // nada: es el caso que evita que el comprador aparezca dos veces en la lista de la puerta.
    vi.mocked(prisma.registration.findFirst).mockResolvedValue({
      id: 'reg_1',
      status: 'confirmada',
    } as never)
    cobroFake({ id: 'pay_ev3', deviceId: 'dev_1', amount: 45000 }, [
      { kind: 'event', resourceId: 'ev_taller', amount: 45000 },
    ])
    pagoAprobado('pay_ev3')
    await handleNotification('111', true)
    expect(prisma.registration.create).not.toHaveBeenCalled()
    expect(prisma.registration.update).not.toHaveBeenCalled()
  })

  it('si el comprador había cancelado, se reactiva su fila en vez de crear otra', async () => {
    vi.mocked(prisma.registration.findFirst).mockResolvedValue({
      id: 'reg_1',
      status: 'cancelada',
    } as never)
    cobroFake({ id: 'pay_ev4', deviceId: 'dev_1', amount: 45000 }, [
      { kind: 'event', resourceId: 'ev_taller', amount: 45000 },
    ])
    pagoAprobado('pay_ev4')
    await handleNotification('111', true)
    expect(prisma.registration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reg_1' },
        data: expect.objectContaining({ status: 'confirmada' }),
      }),
    )
    expect(prisma.registration.create).not.toHaveBeenCalled()
  })

  it('un evento pago SIN device no se entrega en silencio: tira para que MP reintente', async () => {
    // Payment.device tiene onDelete: SetNull. Si el Device se borra entre el checkout y el aviso,
    // deviceId llega null: cobrar y no inscribir a nadie, sin rastro, es el peor resultado.
    cobroFake({ id: 'pay_ev5', deviceId: null, amount: 45000 }, [
      { kind: 'event', resourceId: 'ev_taller', amount: 45000 },
    ])
    pagoAprobado('pay_ev5')
    // Propaga: la ruta devuelve 5xx y MP reintenta. Es el mismo contrato que membership — un
    // fallo de entrega nunca puede quedar grabado como entregado.
    await expect(handleNotification('111', true)).rejects.toThrow(/no se puede inscribir/)
    expect(prisma.registration.create).not.toHaveBeenCalled()
    // La línea NO queda marcada como entregada, así que el reintento vuelve a intentarla.
    expect(prisma.paymentItem.update).not.toHaveBeenCalled()
  })

  it('una campaña se pone al aire con su ventana de horas', async () => {
    cobroFake({ id: 'pay_3' }, [{ kind: 'ad_campaign', resourceId: 'camp_1' }])
    vi.mocked(prisma.adCampaign.update).mockResolvedValue({} as never)
    pagoAprobado('pay_3')
    await handleNotification('111', true)
    const args = vi.mocked(prisma.adCampaign.update).mock.calls[0][0] as { data: { status: string; startsAt: Date; expiresAt: Date } }
    expect(args.data.status).toBe('activa')
    expect(args.data.expiresAt.getTime()).toBeGreaterThan(args.data.startsAt.getTime())
  })
})

/**
 * El corazón del cambio multi-orden en el webhook: un cobro cubre N líneas y hay que entregarlas
 * TODAS. Antes esto era imposible de expresar — el Payment tenía un solo (kind, resourceId).
 */
describe('webhook — un cobro que cubre varias órdenes las entrega TODAS', () => {
  it('2 líneas aprobadas → las 2 órdenes quedan confirmadas y el cobro queda approved con las líneas selladas', async () => {
    const { fila, items } = cobroFake({ id: 'pay_multi', deviceId: 'dev_1', amount: 3000 }, [
      { kind: 'ticket_order', resourceId: 'ord_a', amount: 1000 },
      { kind: 'ticket_order', resourceId: 'ord_b', amount: 2000 },
    ])
    pagoAprobado('pay_multi')

    await handleNotification('111', true)

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(2)
    expect(vi.mocked(prisma.ticketOrder.update).mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id).sort()).toEqual(['ord_a', 'ord_b'])
    expect(fila.status).toBe('approved')
    // Las dos líneas quedan entregadas y cerradas: el índice único parcial libera los recursos.
    expect(items.every((i) => i.deliveredAt !== null)).toBe(true)
    expect(items.every((i) => i.closedAt !== null)).toBe(true)
  })

  it('si la 2ª línea falla: la 1ª queda entregada, el claim se suelta, y el reintento de MP NO la re-entrega', async () => {
    const { fila, items } = cobroFake({ id: 'pay_parcial', deviceId: 'dev_1', amount: 3000 }, [
      { kind: 'ticket_order', resourceId: 'ord_a', amount: 1000 },
      { kind: 'ticket_order', resourceId: 'ord_b', amount: 2000 },
    ])
    pagoAprobado('pay_parcial')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // La primera entrega bien; la segunda revienta.
    vi.mocked(prisma.ticketOrder.update).mockImplementation((async ({ where }: { where: { id: string } }) => {
      if (where.id === 'ord_b') throw new Error('P2025 simulado: la orden ya no existe')
      return {}
    }) as never)

    await expect(handleNotification('111', true)).rejects.toThrow()

    // ord_a entregada de verdad; ord_b no. El cobro NO queda marcado como entregado (si quedara,
    // ningún reintento de MP volvería a intentar: plata cobrada, entrada nunca entregada).
    expect(items[0].deliveredAt).not.toBeNull()
    expect(items[1].deliveredAt).toBeNull()
    expect(fila.status).toBe('pending')
    expect(fila.mpPaymentId).toBeNull()
    // Las líneas siguen VIVAS: hay un pago aprobado dando vueltas, el comprador no puede generarse
    // un segundo cobro para estas órdenes mientras tanto.
    expect(items.every((i) => i.closedAt === null)).toBe(true)

    // Reintento de MP, ahora sin el fallo: NO re-activa ord_a (ya tiene deliveredAt) y cierra.
    vi.mocked(prisma.ticketOrder.update).mockResolvedValue({} as never)
    const llamadasAntes = vi.mocked(prisma.ticketOrder.update).mock.calls.length
    await handleNotification('111', true)

    const nuevas = vi.mocked(prisma.ticketOrder.update).mock.calls.slice(llamadasAntes)
    expect(nuevas).toHaveLength(1)
    expect((nuevas[0][0] as { where: { id: string } }).where.id).toBe('ord_b')
    expect(fila.status).toBe('approved')
    expect(items.every((i) => i.closedAt !== null)).toBe(true)
    errSpy.mockRestore()
  })
})

describe('webhook — lo que NO debe pasar', () => {
  it('con firma inválida no activa nada', async () => {
    await handleNotification('111', false)
    expect(mpApi.getPayment).not.toHaveBeenCalled()
    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()
  })

  it('un pago pendiente (efectivo) NO confirma la orden Y DEJA LAS LÍNEAS VIVAS (el recurso sigue reservado)', async () => {
    const { fila, items } = cobroFake({ id: 'pay_4' }, [{ kind: 'ticket_order', resourceId: 'ord_1' }])
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 111, status: 'pending', external_reference: 'pay_4' } as never)

    await handleNotification('111', true)

    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()
    expect(fila.status).toBe('pending')
    // Lo importante: un cupón de efectivo en curso NO libera el índice. Si estas líneas se
    // cerraran, el comprador podría generarse un segundo cobro por lo mismo.
    expect(items.every((i) => i.closedAt === null)).toBe(true)
  })
})

describe('webhook — defecto B: un fallo de entrega nunca queda grabado como entregado', () => {
  it('el mismo pago avisado dos veces SEGUIDAS activa una sola vez', async () => {
    const { fila } = cobroFake({ id: 'pay_5' }, [{ kind: 'ticket_order', resourceId: 'ord_5' }])
    pagoAprobado('pay_5')

    await handleNotification('111', true)
    await handleNotification('111', true)

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(1)
    expect(fila.status).toBe('approved')
  })

  it('dos avisos CONCURRENTES del mismo pago activan una sola vez (gate atómico, no mockResolvedValueOnce)', async () => {
    const { fila } = cobroFake({ id: 'pay_6' }, [{ kind: 'ticket_order', resourceId: 'ord_6' }])
    pagoAprobado('pay_6')

    await Promise.all([handleNotification('111', true), handleNotification('111', true)])

    expect(prisma.ticketOrder.update).toHaveBeenCalledTimes(1)
    expect(fila.status).toBe('approved')
  })

  it('si la activación falla, el Payment NO queda bloqueado y un segundo aviso reintenta', async () => {
    const { fila } = cobroFake({ id: 'pay_7' }, [{ kind: 'ticket_order', resourceId: 'ord_7' }])
    pagoAprobado('pay_7')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
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
    errSpy.mockRestore()
  })

  it('membership con deviceId nulo: no activa, deja log, y no queda marcado como entregado', async () => {
    const { fila } = cobroFake({ id: 'pay_8', deviceId: null, amount: 9900 }, [
      { kind: 'membership', resourceId: 'dev_borrado', amount: 9900 },
    ])
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

/**
 * REGRESIÓN de la tanda anterior. El `catch` que deshace el claim volvía a `pending` FIJO, sin
 * mirar de qué estado venía. Si el Payment estaba `rejected`/`expired` —sus líneas ya tienen
 * `closedAt` seteado— y después llega el `approved` y la entrega falla, quedaba
 * `status = 'pending'` CON LAS LÍNEAS CERRADAS. Ese es el lado peligroso de romper el invariante:
 *
 *   · `buscarCobrosVivos` y `vencerPendientesAbandonados` filtran por `closedAt: null` → la fila
 *     se vuelve INVISIBLE para las dos;
 *   · `repararEspejo` solo sabe CERRAR líneas, no reabrirlas → no lo repara nunca;
 *   · el recurso queda LIBRE mientras existe un pago aprobado de verdad en MP → segundo cobro,
 *     en silencio.
 */
describe('webhook — deshacer el claim NUNCA puede romper el espejo closedAt', () => {
  it('venía de rejected (líneas cerradas), llega el approved y la entrega falla: NO queda pending con las líneas muertas', async () => {
    const { fila, items } = cobroFake({ id: 'pay_RV', status: 'rejected', mpPaymentId: '900' }, [
      { kind: 'ticket_order', resourceId: 'ord_RV' },
    ])
    // El escenario de partida: la tarjeta rebotó, se cerró el cobro y se liberaron las líneas.
    expect(items.every((i) => i.closedAt !== null)).toBe(true)
    pagoAprobado('pay_RV')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.ticketOrder.update).mockRejectedValue(new Error('P2025 simulado: la orden ya no existe'))

    await expect(handleNotification('111', true)).rejects.toThrow()

    // Lo único inaceptable: cabecera viva con líneas muertas. Esa combinación es invisible para
    // buscarCobrosVivos y para vencerPendientesAbandonados, y repararEspejo no la puede arreglar.
    expect(invarianteDelEspejo(fila, items)).toBe(true)
    // Y el claim igual quedó suelto: el reintento de MP tiene que poder volver a entregar.
    expect(fila.status).not.toBe('approved')
    expect(fila.mpPaymentId).toBeNull()
    errSpy.mockRestore()
  })

  it('el reintento de MP después de ese revert vuelve a entregar (el cobro no quedó trabado)', async () => {
    const { fila, items } = cobroFake({ id: 'pay_RV2', status: 'rejected', mpPaymentId: '900' }, [
      { kind: 'ticket_order', resourceId: 'ord_RV2' },
    ])
    pagoAprobado('pay_RV2')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.ticketOrder.update).mockRejectedValueOnce(new Error('P2025 simulado'))

    await expect(handleNotification('111', true)).rejects.toThrow()
    await handleNotification('111', true)

    expect(fila.status).toBe('approved')
    expect(items.every((i) => i.deliveredAt !== null)).toBe(true)
    expect(invarianteDelEspejo(fila, items)).toBe(true)
    errSpy.mockRestore()
  })

  it('por CARRERA: un checkout concurrente cierra las líneas entre el claim y la entrega, y la entrega falla', async () => {
    const { fila, items } = cobroFake({ id: 'pay_RC' }, [{ kind: 'ticket_order', resourceId: 'ord_RC' }])
    pagoAprobado('pay_RC')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.ticketOrder.update).mockImplementation((async () => {
      // Esto es exactamente lo que hace `repararEspejo` de mpCheckoutService desde otro request:
      // ve la cabecera en `approved` (el claim) con las líneas todavía vivas y las cierra. Justo
      // después, nuestra entrega falla.
      for (const it of items) it.closedAt = new Date()
      throw new Error('P2025 simulado: la orden ya no existe')
    }) as never)

    await expect(handleNotification('111', true)).rejects.toThrow()

    expect(invarianteDelEspejo(fila, items)).toBe(true)
    expect(fila.status).not.toBe('approved')
    errSpy.mockRestore()
  })

  it('el caso normal no cambia: venía de pending con líneas vivas → vuelve a pending con líneas vivas', async () => {
    const { fila, items } = cobroFake({ id: 'pay_RN' }, [{ kind: 'ticket_order', resourceId: 'ord_RN' }])
    pagoAprobado('pay_RN')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.ticketOrder.update).mockRejectedValue(new Error('P2025 simulado'))

    await expect(handleNotification('111', true)).rejects.toThrow()

    expect(fila.status).toBe('pending')
    expect(items.every((i) => i.closedAt === null)).toBe(true)
    expect(invarianteDelEspejo(fila, items)).toBe(true)
    errSpy.mockRestore()
  })
})

/**
 * El HUECO HERMANO. La rama `rejected` cerraba las líneas sin preguntarle NADA a MP. En Checkout
 * Pro el comprador puede reintentar DENTRO DE LA MISMA PREFERENCIA después de un rechazo: con las
 * líneas ya liberadas puede, además, armarse un cobro nuevo — y terminar pagando los dos. Resultado:
 * dos filas Payment aprobadas sobre el mismo recurso.
 */
describe('webhook — un rechazo no libera el recurso si MP todavía tiene un pago vivo', () => {
  it('MP reporta un pago vivo para esa preferencia: las líneas NO se cierran y el cobro sigue vivo', async () => {
    const { fila, items } = cobroFake({ id: 'pay_HH' }, [{ kind: 'ticket_order', resourceId: 'ord_HH' }])
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 900, status: 'rejected', external_reference: 'pay_HH' } as never)
    // El comprador ya volvió a intentar dentro de la misma preferencia: hay otro pago en curso.
    vi.mocked(mpApi.searchPaymentsByExternalReference).mockResolvedValue([
      { id: 900, status: 'rejected' },
      { id: 901, status: 'in_process' },
    ] as never)

    await handleNotification('900', true)

    expect(fila.status).toBe('pending')
    expect(items.every((i) => i.closedAt === null)).toBe(true)
    expect(invarianteDelEspejo(fila, items)).toBe(true)
  })

  it('en ese caso NO se anota el mpPaymentId del rechazado: si no, el cobro no vencería nunca más', async () => {
    // `vencerPendientesAbandonados` filtra por `mpPaymentId: null`. Si al mantener vivo el cobro
    // le grabáramos el id del pago RECHAZADO, esa fila dejaría de ser candidata a vencer para
    // siempre y el recurso quedaría trabado sin que nada lo destrabe.
    const { fila } = cobroFake({ id: 'pay_HH2' }, [{ kind: 'ticket_order', resourceId: 'ord_HH2' }])
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 900, status: 'rejected', external_reference: 'pay_HH2' } as never)
    vi.mocked(mpApi.searchPaymentsByExternalReference).mockResolvedValue([{ id: 901, status: 'pending' }] as never)

    await handleNotification('900', true)

    expect(fila.mpPaymentId).toBeNull()
  })

  it('si la consulta a MP falla, tampoco se libera (fail-closed) y queda rastro', async () => {
    const { fila, items } = cobroFake({ id: 'pay_HH3' }, [{ kind: 'ticket_order', resourceId: 'ord_HH3' }])
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 900, status: 'rejected', external_reference: 'pay_HH3' } as never)
    vi.mocked(mpApi.searchPaymentsByExternalReference).mockRejectedValue(new Error('MP no responde'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handleNotification('900', true)

    expect(fila.status).toBe('pending')
    expect(items.every((i) => i.closedAt === null)).toBe(true)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('sin ningún pago vivo en MP el rechazo SÍ libera (si no, una tarjeta rebotada trabaría la orden para siempre)', async () => {
    const { fila, items } = cobroFake({ id: 'pay_HH4' }, [{ kind: 'ticket_order', resourceId: 'ord_HH4' }])
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 900, status: 'rejected', external_reference: 'pay_HH4' } as never)
    vi.mocked(mpApi.searchPaymentsByExternalReference).mockResolvedValue([{ id: 900, status: 'rejected' }] as never)

    await handleNotification('900', true)

    expect(fila.status).toBe('rejected')
    expect(items.every((i) => i.closedAt !== null)).toBe(true)
  })
})

/**
 * El `console.error` de "SEGUNDO pago aprobado" solo salta cuando los dos approved caen en la
 * MISMA fila Payment. El doble cobro REPARTIDO EN DOS FILAS (el que produce el hueco hermano de
 * arriba) no dispara nada: son dos Payment distintos, cada uno con su claim limpio. No se puede
 * deployar algo que puede cobrar dos veces sin dejar huella.
 */
describe('webhook — detección del doble cobro repartido en DOS filas Payment', () => {
  it('un approved sobre un recurso que YA entregó otra fila Payment deja un rastro inequívoco', async () => {
    cobroFake({ id: 'pay_D2' }, [{ kind: 'ticket_order', resourceId: 'ord_D' }])
    pagoAprobado('pay_D2')
    // Otra fila Payment (el primer cobro, ya aprobado y entregado) tiene esta misma orden.
    vi.mocked(prisma.paymentItem.findMany).mockResolvedValue([
      { id: 'it_otro', paymentId: 'pay_D1', kind: 'ticket_order', resourceId: 'ord_D', amount: 1000, deliveredAt: new Date() },
    ] as never)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handleNotification('111', true)

    const grito = errSpy.mock.calls.map((c) => String(c[0])).find((s) => s.includes('DOBLE COBRO'))
    expect(grito).toBeDefined()
    // El log tiene que decir CUÁL es el otro cobro: sin eso el operador no puede devolver nada.
    const contexto = errSpy.mock.calls.flat().find(
      (a) => typeof a === 'object' && a !== null && 'yaEntregadoPorOtroCobro' in (a as object),
    ) as { yaEntregadoPorOtroCobro: { paymentId: string; resourceId: string }[] }
    expect(contexto.yaEntregadoPorOtroCobro[0]).toMatchObject({ paymentId: 'pay_D1', resourceId: 'ord_D' })
    errSpy.mockRestore()
  })

  it('sin otra fila involucrada no grita nada (el detector no puede ser ruido de fondo)', async () => {
    cobroFake({ id: 'pay_D3' }, [{ kind: 'ticket_order', resourceId: 'ord_D3' }])
    pagoAprobado('pay_D3')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handleNotification('111', true)

    expect(errSpy.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('DOBLE COBRO'))).toHaveLength(0)
    errSpy.mockRestore()
  })
})

describe('webhook — defecto C: reversos y vencimientos NO son "pendiente"', () => {
  it('un pago cancelled (efectivo vencido) libera el índice único: NO queda pending y las líneas se sellan', async () => {
    const { fila, items } = cobroFake({ id: 'pay_9' }, [{ kind: 'ticket_order', resourceId: 'ord_9' }])
    pagoAprobado('pay_9', 'cancelled')

    await handleNotification('111', true)

    expect(fila.status).toBe('rejected')
    // Sin el sellado de las líneas, el comprador no podría generar un cobro nuevo NUNCA MÁS.
    expect(items.every((i) => i.closedAt !== null)).toBe(true)
  })

  it('un pago refunded se registra como tal y deja el log accionable con TODO lo entregado', async () => {
    const { fila } = cobroFake({ id: 'pay_10', deviceId: 'dev_10', status: 'approved' }, [
      { kind: 'ticket_order', resourceId: 'ord_10', deliveredAt: new Date(), closedAt: new Date() },
    ])
    pagoAprobado('pay_10', 'refunded')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handleNotification('111', true)

    expect(fila.status).toBe('refunded')
    expect(errSpy).toHaveBeenCalled()
    // El log tiene que listar lo que quedó entregado: es lo único accionable para el operador.
    const contexto = errSpy.mock.calls.flat().find((a) => typeof a === 'object' && a !== null && 'entregado' in (a as object)) as {
      entregado: { resourceId: string }[]
    }
    expect(contexto.entregado.map((e) => e.resourceId)).toEqual(['ord_10'])

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
    const { fila } = cobroFake({ id: 'pay_A' }, [{ kind: 'ticket_order', resourceId: 'ord_A' }])

    // Intento 1: la tarjeta rebota. Ocupa mpPaymentId con el payment_id 900 y cierra el cobro.
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
    const { fila } = cobroFake({ id: 'pay_A2' }, [{ kind: 'ticket_order', resourceId: 'ord_A2' }])

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
    const { fila } = cobroFake({ id: 'pay_A3', status: 'approved', mpPaymentId: '903' }, [
      { kind: 'ticket_order', resourceId: 'ord_A3', deliveredAt: new Date() },
    ])
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
    const { fila } = cobroFake({ id: 'pay_B', status: 'approved', mpPaymentId: '901' }, [
      { kind: 'ticket_order', resourceId: 'ord_B', deliveredAt: new Date() },
    ])
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 900, status: 'rejected', external_reference: 'pay_B' } as never)

    await handleNotification('900', true)

    expect(fila.status).toBe('approved')
    expect(fila.mpPaymentId).toBe('901')
    errSpy.mockRestore()
  })

  it('un pending desordenado tampoco lo devuelve a pendiente (re-trabaría el índice único)', async () => {
    const { fila } = cobroFake({ id: 'pay_B2', status: 'approved', mpPaymentId: '901' }, [
      { kind: 'ticket_order', resourceId: 'ord_B2', deliveredAt: new Date() },
    ])
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 901, status: 'in_process', external_reference: 'pay_B2' } as never)

    await handleNotification('901', true)

    expect(fila.status).toBe('approved')
    errSpy.mockRestore()
  })

  it('approved → refunded SÍ es una transición válida (el reverso tiene que quedar registrado)', async () => {
    const { fila } = cobroFake({ id: 'pay_B3', status: 'approved', mpPaymentId: '901' }, [
      { kind: 'ticket_order', resourceId: 'ord_B3', deliveredAt: new Date() },
    ])
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 901, status: 'refunded', external_reference: 'pay_B3' } as never)

    await handleNotification('901', true)

    expect(fila.status).toBe('refunded')
    errSpy.mockRestore()
  })

  it('un rechazo que llega después de un reverso tampoco lo pisa', async () => {
    const { fila } = cobroFake({ id: 'pay_B4', status: 'refunded', mpPaymentId: '901' }, [
      { kind: 'ticket_order', resourceId: 'ord_B4', deliveredAt: new Date() },
    ])
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 900, status: 'rejected', external_reference: 'pay_B4' } as never)

    await handleNotification('900', true)

    expect(fila.status).toBe('refunded')
    errSpy.mockRestore()
  })
})

/**
 * El invariante que sostiene el índice único parcial:
 *     closedAt IS NULL  ⟺  Payment.status = 'pending'
 * Si se rompe, el índice deja de proteger EN SILENCIO (o traba un recurso para siempre). Este
 * test lo recorre transición por transición: es el gate del espejo.
 */
describe('webhook — invariante del espejo closedAt', () => {
  const casos: { estadoMp: string; esperado: string }[] = [
    { estadoMp: 'approved', esperado: 'approved' },
    { estadoMp: 'rejected', esperado: 'rejected' },
    { estadoMp: 'cancelled', esperado: 'rejected' },
  ]

  for (const { estadoMp, esperado } of casos) {
    it(`tras un ${estadoMp} (→ ${esperado}) no queda ninguna línea viva`, async () => {
      const { fila, items } = cobroFake({ id: 'pay_inv', deviceId: 'dev_1' }, [
        { kind: 'ticket_order', resourceId: 'ord_i1' },
        { kind: 'ticket_order', resourceId: 'ord_i2' },
      ])
      pagoAprobado('pay_inv', estadoMp)

      await handleNotification('111', true)

      expect(fila.status).toBe(esperado)
      expect(items.filter((i) => i.closedAt === null)).toHaveLength(0)
    })
  }

  it('tras un refunded sobre un cobro ya aprobado tampoco queda ninguna línea viva', async () => {
    const { fila, items } = cobroFake({ id: 'pay_inv2', status: 'approved', mpPaymentId: '1' }, [
      { kind: 'ticket_order', resourceId: 'ord_i3', deliveredAt: new Date(), closedAt: null },
    ])
    pagoAprobado('pay_inv2', 'refunded')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handleNotification('111', true)

    expect(fila.status).toBe('refunded')
    expect(items.filter((i) => i.closedAt === null)).toHaveLength(0)
    errSpy.mockRestore()
  })

  it('con status pending (efectivo) las líneas siguen VIVAS: el recurso queda reservado', async () => {
    const { fila, items } = cobroFake({ id: 'pay_inv3' }, [{ kind: 'ticket_order', resourceId: 'ord_i4' }])
    pagoAprobado('pay_inv3', 'pending')

    await handleNotification('111', true)

    expect(fila.status).toBe('pending')
    expect(items.filter((i) => i.closedAt === null)).toHaveLength(1)
  })
})
