import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * INVARIANTE: un evento en BORRADOR no acepta inscripciones.
 *
 * `published` se filtraba SOLO en las lecturas de eventService (getEvents, getEvent,
 * getEventsWithBlocks) y NO en register(). El id de un evento no es secreto —lo genera el
 * cliente y está a la vista en el panel—, así que con ese id se podía crear una Registration
 * CONFIRMADA contra un evento que el público ni siquiera ve, y quedarse con un QR de algo que
 * no existe para nadie más. El organizador, además, se encontraba con inscriptos en un
 * borrador que todavía estaba armando.
 *
 * Un borrador responde igual que un evento inexistente (404 EVENT_NOT_FOUND), por la misma
 * razón que getEvent: si el error fuera distinto, la existencia de un borrador sería
 * adivinable desde afuera probando ids.
 */

const mockPrisma = {
  event: { findUnique: vi.fn() },
  membership: { findUnique: vi.fn() },
  registration: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  eventBlock: { findUnique: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { register } = await import('./registrationService.js')

const PUBLICADO = { id: 'ev_pub', published: true, past: false, socioOnly: false }
const BORRADOR = { id: 'ev_draft', published: false, past: false, socioOnly: false }

beforeEach(() => {
  vi.clearAllMocks()
  // La transacción corre el callback con el mismo mock: si la guardia falla, el test
  // llega hasta acá y se ve el intento de escritura.
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma))
  mockPrisma.$queryRaw.mockResolvedValue([{ id: 'ev_pub' }])
  mockPrisma.registration.findFirst.mockResolvedValue(null)
  mockPrisma.registration.count.mockResolvedValue(0)
  mockPrisma.registration.create.mockResolvedValue({
    id: 'reg_1', deviceId: 'dev_1', eventId: 'ev_pub', blockId: null,
    status: 'confirmada', ts: new Date(),
  })
})

describe('register() — un evento en borrador no acepta inscripciones', () => {
  it('rechaza la inscripción a un borrador con 404 EVENT_NOT_FOUND', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(BORRADOR)
    await expect(register('dev_1', 'ev_draft')).rejects.toMatchObject({
      status: 404,
      code: 'EVENT_NOT_FOUND',
    })
  })

  it('no escribe NADA cuando el evento es un borrador', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(BORRADOR)
    await register('dev_1', 'ev_draft').catch(() => {})
    expect(mockPrisma.registration.create).not.toHaveBeenCalled()
    expect(mockPrisma.registration.update).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('el borrador es indistinguible de un evento inexistente (no se filtra que existe)', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(BORRADOR)
    const enBorrador = await register('dev_1', 'ev_draft').catch((e) => e)
    mockPrisma.event.findUnique.mockResolvedValue(null)
    const inexistente = await register('dev_1', 'ev_fantasma').catch((e) => e)
    expect(enBorrador.status).toBe(inexistente.status)
    expect(enBorrador.code).toBe(inexistente.code)
    expect(enBorrador.message).toBe(inexistente.message)
  })

  it('un evento publicado sigue aceptando inscripciones (la guardia no rompe el camino feliz)', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(PUBLICADO)
    const reg = await register('dev_1', 'ev_pub')
    expect(reg.status).toBe('confirmada')
    expect(mockPrisma.registration.create).toHaveBeenCalled()
  })
})
