import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Campos que el panel manda y el servidor descarta en silencio.
 *
 * Ya pasó tres veces en este proyecto: el cupo del evento, el cargo por servicio del tipo de
 * entrada, y antes el texto de la fecha. Siempre igual — el formulario pide el dato, el toast
 * dice "guardado", nada falla, y el valor no llega a la base. Es el bug más caro de un panel
 * que usa una sola persona: no da ningún síntoma y se descubre cuando el número ya se usó para
 * decidir algo.
 *
 * La causa es siempre una lista blanca a la que le falta el campo. Estos tests recorren el
 * camino completo (lo que manda el panel → lo que se escribe) en vez de mirar la lista.
 */

const mockPrisma = {
  event: { findUnique: vi.fn() },
  ticketPlan: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  ticketOrder: { count: vi.fn() },
  $transaction: vi.fn(),
}
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { createPlan, updatePlan } = await import('./adminService.js')

/** Lo que el formulario del panel manda al crear un tipo de entrada. */
const DEL_FORMULARIO = {
  name: 'Sábado · Night VIP',
  tagline: 'Desfile de las Estrellas',
  price: 30000,
  serviceCharge: 3000,
  mpLink: null,
  perks: ['Zona VIP'],
  kind: 'vip' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.event.findUnique.mockResolvedValue({ id: 'ev_1' })
  // updatePlan lee la fila para medir la coherencia sobre cómo queda DESPUÉS del patch.
  mockPrisma.ticketPlan.findUnique.mockResolvedValue({ kind: 'vip', price: 30000 })
  mockPrisma.ticketPlan.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ perks: [], ...data }),
  )
  mockPrisma.ticketPlan.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'p1', eventId: 'ev_1', name: 'x', tagline: '', perks: [], kind: 'vip', price: null, serviceCharge: 0, mpLink: null, ...data }),
  )
  mockPrisma.$transaction.mockImplementation((fn: (c: unknown) => unknown) => fn(mockPrisma))
})

describe('alta de un tipo de entrada: se guarda TODO lo que el panel manda', () => {
  it('el cargo por servicio llega a la base', async () => {
    // Éste es el que faltaba: `serviceCharge` no estaba en la lista blanca, así que la entrada
    // quedaba en 0 aunque el organizador hubiera cargado 3000.
    await createPlan('ev_1', DEL_FORMULARIO)
    expect(mockPrisma.ticketPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ serviceCharge: 3000 }) }),
    )
  })

  it('no se pierde ninguno de los campos del formulario', async () => {
    await createPlan('ev_1', DEL_FORMULARIO)
    const { data } = mockPrisma.ticketPlan.create.mock.calls[0][0]
    for (const campo of ['name', 'tagline', 'price', 'serviceCharge', 'perks', 'kind'] as const) {
      expect(data, `falta "${campo}" en lo que se escribe`).toHaveProperty(campo)
    }
    expect(data.eventId).toBe('ev_1')
  })

  it('el cargo por servicio se valida como plata, no se acepta cualquier cosa', async () => {
    await expect(createPlan('ev_1', { ...DEL_FORMULARIO, serviceCharge: -50 })).rejects.toMatchObject({
      code: 'INVALID_PRICE',
    })
  })

  it('sin cargo por servicio queda en 0, no en null (la columna es NOT NULL)', async () => {
    const { serviceCharge: _, ...sinCargo } = DEL_FORMULARIO
    await createPlan('ev_1', sinCargo)
    const { data } = mockPrisma.ticketPlan.create.mock.calls[0][0]
    expect(data.serviceCharge === undefined || data.serviceCharge === 0).toBe(true)
  })
})

describe('edición de un tipo de entrada', () => {
  it('también guarda el cargo por servicio', async () => {
    await updatePlan('p1', { serviceCharge: 4500 })
    expect(mockPrisma.ticketPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ serviceCharge: 4500 }) }),
    )
  })

  it('deja renombrar la entrada: antes sólo se podía tocar precio y link', async () => {
    await updatePlan('p1', { name: 'Otro nombre' })
    expect(mockPrisma.ticketPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Otro nombre' }) }),
    )
  })

  it('lo que no viene en el patch no se toca', async () => {
    await updatePlan('p1', { price: 1 })
    const { data } = mockPrisma.ticketPlan.update.mock.calls[0][0]
    expect(data).not.toHaveProperty('name')
    expect(data).not.toHaveProperty('serviceCharge')
  })

  it('retira una entrada de la venta (archived) y la reactiva', async () => {
    await updatePlan('p1', { archived: true })
    expect(mockPrisma.ticketPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archived: true }) }),
    )
    vi.clearAllMocks()
    mockPrisma.ticketPlan.findUnique.mockResolvedValue({ kind: 'vip', price: 30000 })
    await updatePlan('p1', { archived: false })
    expect(mockPrisma.ticketPlan.update.mock.calls[0][0].data.archived).toBe(false)
  })

  it('archived llega a la base SIEMPRE como booleano, no como lo que venga crudo', async () => {
    // El front manda true/false reales; esto es higiene de tipo. Lo que importa es que Prisma
    // reciba un booleano y no otro tipo. (No es un parser de strings: "false" es truthy en JS,
    // pero el front nunca manda strings acá.)
    await updatePlan('p1', { archived: 1 as unknown as boolean })
    const { data } = mockPrisma.ticketPlan.update.mock.calls[0][0]
    expect(typeof data.archived).toBe('boolean')
    expect(data.archived).toBe(true)
  })
})

/**
 * «General» no es una etiqueta más: toda la app la trata como la acreditación gratuita. El
 * selector le imprime "Gratis" ignorando el precio y la inscribe sin cobrar; el panel le tapa el
 * campo de precio con la leyenda "gratuita, sin link de pago". Una General con precio no es una
 * entrada cara: es una entrada que se regala mientras el panel muestra $30.000. Y como el editor
 * esconde ese campo justamente cuando es general, tampoco había cómo corregirla.
 */
describe('General y precio no pueden convivir', () => {
  it('no se puede CREAR una general con precio', async () => {
    await expect(
      createPlan('ev_1', { ...DEL_FORMULARIO, kind: 'general' as const }),
    ).rejects.toMatchObject({ code: 'INVALID_PLAN' })
    expect(mockPrisma.ticketPlan.create).not.toHaveBeenCalled()
  })

  it('una general SIN precio se crea normal: es el caso legítimo', async () => {
    await createPlan('ev_1', { ...DEL_FORMULARIO, kind: 'general' as const, price: null })
    expect(mockPrisma.ticketPlan.create).toHaveBeenCalled()
  })

  it('tampoco se le puede poner precio a una general que ya existe', async () => {
    mockPrisma.ticketPlan.findUnique.mockResolvedValue({ kind: 'general', price: null })
    await expect(updatePlan('p1', { price: 30000 })).rejects.toMatchObject({ code: 'INVALID_PLAN' })
    expect(mockPrisma.ticketPlan.update).not.toHaveBeenCalled()
  })

  it('ni pasar a general una entrada que ya tiene precio cargado', async () => {
    // El patch trae SÓLO el tipo; el precio viejo sigue ahí. Mirar el patch no alcanza: hay que
    // mirar cómo queda la entrada.
    mockPrisma.ticketPlan.findUnique.mockResolvedValue({ kind: 'vip', price: 30000 })
    await expect(updatePlan('p1', { kind: 'general' })).rejects.toMatchObject({
      code: 'INVALID_PLAN',
    })
  })

  it('pasar a general Y borrar el precio en el mismo patch sí se puede', async () => {
    mockPrisma.ticketPlan.findUnique.mockResolvedValue({ kind: 'vip', price: 30000 })
    await updatePlan('p1', { kind: 'general', price: null })
    expect(mockPrisma.ticketPlan.update).toHaveBeenCalled()
  })

  it('una VIP con precio no se toca: es el caso de siempre', async () => {
    await updatePlan('p1', { price: 45000 })
    expect(mockPrisma.ticketPlan.update).toHaveBeenCalled()
  })
})
