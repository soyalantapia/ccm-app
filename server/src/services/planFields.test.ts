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
})
