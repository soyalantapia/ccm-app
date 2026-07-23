import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Los tipos de entrada pasaron de ser un tarifario suelto de 5 filas a colgar de un evento.
 *
 * Eso desbloquea lo que el cliente pidió —que cada evento venda sus propios tiers: sábado,
 * sábado a la noche, combo, domingo, sunset— y trae tres reglas nuevas que no existían, porque
 * hasta acá los planes ni se creaban ni se borraban: sólo se les editaba precio y link.
 */

const tx = {
  $queryRaw: vi.fn(),
  ticketOrder: { count: vi.fn(), deleteMany: vi.fn() },
  ticketPlan: { delete: vi.fn() },
}

const mockPrisma = {
  event: { findUnique: vi.fn() },
  ticketPlan: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  ticketOrder: { count: vi.fn() },
  $transaction: vi.fn((fn: (c: typeof tx) => unknown) => fn(tx)),
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { createPlan, updatePlan, deletePlan } = await import('./adminService.js')
const { getPlans, getAllPlans } = await import('./catalogService.js')

const FILA = {
  id: 'vip-sabado-a1b2c3',
  eventId: 'ev_1',
  name: 'Sábado · Night VIP',
  tagline: 'Desfile',
  price: 30000,
  serviceCharge: 3000,
  mpLink: null,
  perks: [],
  featured: false,
  day: 'sabado',
  kind: 'vip',
  preventa: false,
  archived: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.event.findUnique.mockResolvedValue({ id: 'ev_1' })
  mockPrisma.ticketPlan.create.mockResolvedValue(FILA)
  mockPrisma.ticketPlan.findMany.mockResolvedValue([FILA])
  mockPrisma.ticketPlan.findUnique.mockResolvedValue(FILA)
  mockPrisma.$transaction.mockImplementation((fn: (c: typeof tx) => unknown) => fn(tx))
  tx.$queryRaw.mockResolvedValue([])
  tx.ticketOrder.count.mockResolvedValue(0)
  tx.ticketOrder.deleteMany.mockResolvedValue({ count: 0 })
})

describe('leer los tipos de entrada de un evento', () => {
  it('la lectura PÚBLICA excluye las retiradas de la venta', async () => {
    // El corazón del feature: /plans nunca devuelve una entrada archived. Si el filtro se cayera,
    // una entrada retirada volvería a aparecer y a cobrarse en la app.
    await getPlans('ev_1')
    expect(mockPrisma.ticketPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { archived: false, eventId: 'ev_1' } }),
    )
  })

  it('sin eventId, la pública sigue excluyendo las retiradas', async () => {
    await getPlans()
    expect(mockPrisma.ticketPlan.findMany.mock.calls[0][0].where).toEqual({ archived: false })
  })

  it('ordena determinísticamente: destacados primero, después por precio', async () => {
    // Sin orderBy Postgres devuelve heap-order y el selector de entradas cambiaba de orden
    // entre visitas, con el "destacado" saltando de lugar.
    await getPlans('ev_1')
    expect(mockPrisma.ticketPlan.findMany.mock.calls[0][0].orderBy).toEqual([
      { featured: 'desc' },
      { price: 'asc' },
    ])
  })

  it('el evento viaja al front: sin eso no se puede filtrar del lado de la pantalla', async () => {
    const [plan] = await getPlans('ev_1')
    expect(plan.eventId).toBe('ev_1')
  })
})

describe('getAllPlans — la lectura del PANEL, con retiradas incluidas', () => {
  it('NO filtra por archived: el panel ve las retiradas para reactivarlas', async () => {
    await getAllPlans('ev_1')
    expect(mockPrisma.ticketPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'ev_1' } }),
    )
    // where NO tiene archived: trae activas y retiradas.
    expect(mockPrisma.ticketPlan.findMany.mock.calls[0][0].where.archived).toBeUndefined()
  })

  it('sin eventId trae absolutamente todos: AdminOrdenes resuelve hasta el nombre de una vendida y luego retirada', async () => {
    await getAllPlans()
    expect(mockPrisma.ticketPlan.findMany.mock.calls[0][0].where).toBeUndefined()
  })

  it('el flag archived viaja al front, para pintarla en gris', async () => {
    mockPrisma.ticketPlan.findMany.mockResolvedValue([{ ...FILA, archived: true }])
    const [plan] = await getAllPlans('ev_1')
    expect(plan.archived).toBe(true)
  })
})

describe('crear un tipo de entrada', () => {
  it('cuelga del evento de la RUTA, no de lo que venga en el cuerpo', async () => {
    // Si el eventId saliera del body, se podrían mover entradas de un evento a otro por request
    // y las órdenes ya emitidas quedarían apuntando a otro lado.
    await createPlan('ev_1', { name: 'Night VIP', eventId: 'ev_otro' })
    const data = mockPrisma.ticketPlan.create.mock.calls[0][0].data
    expect(data.eventId).toBe('ev_1')
  })

  it('genera un id legible a partir del nombre, con acentos normalizados', async () => {
    await createPlan('ev_1', { name: 'Sábado · Night VIP' })
    const { id } = mockPrisma.ticketPlan.create.mock.calls[0][0].data
    expect(id).toMatch(/^sabado-night-vip-[a-z0-9]{6}$/)
  })

  it('dos entradas con el mismo nombre no chocan', async () => {
    await createPlan('ev_1', { name: 'General' })
    await createPlan('ev_1', { name: 'General' })
    const [a, b] = mockPrisma.ticketPlan.create.mock.calls.map((c) => c[0].data.id)
    expect(a).not.toBe(b)
  })

  it('sin nombre no se crea: un tipo de entrada sin nombre no se puede elegir', async () => {
    await expect(createPlan('ev_1', { name: '   ' })).rejects.toMatchObject({
      code: 'INVALID_PLAN',
    })
    expect(mockPrisma.ticketPlan.create).not.toHaveBeenCalled()
  })

  it('evento inexistente → no crea nada', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(null)
    await expect(createPlan('ev_fantasma', { name: 'VIP' })).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    })
    expect(mockPrisma.ticketPlan.create).not.toHaveBeenCalled()
  })

  it('el día es opcional: un taller de una tarde no es "sábado" ni "combo"', async () => {
    await createPlan('ev_1', { name: 'Entrada al taller' })
    expect(mockPrisma.ticketPlan.create.mock.calls[0][0].data.day).toBeUndefined()
  })
})

describe('editar un tipo de entrada', () => {
  it('ahora acepta todos los campos, no sólo precio y link', async () => {
    // Antes updatePlan aceptaba EXACTAMENTE {price, mpLink}: no se podía ni renombrar una entrada.
    // La entrada no tiene precio cargado, así que pasarla a "general" (la gratuita) es coherente.
    mockPrisma.ticketPlan.findUnique.mockResolvedValue({ ...FILA, price: null })
    await updatePlan('p1', { name: 'Nuevo nombre', tagline: 'Nueva bajada', kind: 'general' })
    const data = mockPrisma.ticketPlan.update.mock.calls[0][0].data
    expect(data).toMatchObject({ name: 'Nuevo nombre', tagline: 'Nueva bajada', kind: 'general' })
  })

  it('no deja mover la entrada a otro evento por el cuerpo del pedido', async () => {
    await updatePlan('p1', { name: 'X', eventId: 'ev_otro' })
    expect(mockPrisma.ticketPlan.update.mock.calls[0][0].data).not.toHaveProperty('eventId')
  })

  it('un precio inválido se rechaza antes de tocar la base', async () => {
    await expect(updatePlan('p1', { price: -5 })).rejects.toMatchObject({ code: 'INVALID_PRICE' })
    expect(mockPrisma.ticketPlan.update).not.toHaveBeenCalled()
  })
})

describe('borrar un tipo de entrada', () => {
  it('con compras hechas → 409 con un mensaje que se entiende, no un error de base', async () => {
    // TicketOrder.planId es una relación obligatoria (Restrict): sin este pre-chequeo Prisma
    // tira un P2003 crudo y el organizador ve un 500 sin explicación.
    tx.ticketOrder.count.mockResolvedValue(3)
    await expect(deletePlan('p1')).rejects.toMatchObject({ status: 409, code: 'HAS_ORDERS' })
    expect(tx.ticketPlan.delete).not.toHaveBeenCalled()
  })

  it('sin compras se borra', async () => {
    await deletePlan('p1')
    expect(tx.ticketPlan.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
  })

  it('sólo bloquean las órdenes que dejan rastro, no un carrito abandonado', async () => {
    // Las órdenes se crean ANTES de pedir el link de pago, así que cualquier visitante que
    // apriete "Continuar" y cierre la pestaña deja una fila 'iniciada'. Como no existe DELETE de
    // órdenes ni purga por vencimiento, esa fila clavaba el tipo de entrada para siempre: el
    // organizador ya no podía borrar algo que cargó mal y nunca vendió.
    await deletePlan('p1')
    expect(tx.ticketOrder.count).toHaveBeenCalledWith({
      where: { planId: 'p1', status: { in: ['confirmada', 'redirigida_mp', 'cancelada'] } },
    })
    expect(tx.ticketOrder.deleteMany).toHaveBeenCalledWith({
      where: { planId: 'p1', status: 'iniciada' },
    })
    expect(tx.ticketPlan.delete).toHaveBeenCalled()
  })

  it('una compra confirmada, una en curso o una cancelada SÍ bloquean: son registros de algo que pasó', async () => {
    tx.ticketOrder.count.mockResolvedValue(1)
    await expect(deletePlan('p1')).rejects.toMatchObject({ code: 'HAS_ORDERS' })
    // Y no se toca ninguna orden: si el borrado no procede, nada se limpia.
    expect(tx.ticketOrder.deleteMany).not.toHaveBeenCalled()
  })

  it('el 409 ya no manda a "sacalo de la venta": ese control no existe', async () => {
    // El mensaje mandaba a retirar la entrada de la venta, y TicketPlan no tiene forma de
    // hacerlo. El organizador quedaba buscando un botón inventado.
    tx.ticketOrder.count.mockResolvedValue(2)
    await expect(deletePlan('p1')).rejects.toMatchObject({
      message: expect.not.stringContaining('sacalo de la venta'),
    })
  })

  it('toma el lock de la fila ANTES de contar las compras', async () => {
    // Si no, el conteo es una foto vieja: alguien compra en esa ventana y el borrado se lleva
    // una entrada que acaba de venderse.
    await deletePlan('p1')
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.ticketOrder.count.mock.invocationCallOrder[0],
    )
  })
})
