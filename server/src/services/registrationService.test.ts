import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * register() es la única escritura pública del circuito de inscripción, y el eventId lo elige
 * el cliente. Un evento en BORRADOR no puede aceptar inscripciones ni admitir que existe: si
 * contestara EVENT_PAST, SOCIO_ONLY o BLOCK_FULL, el id de un borrador quedaría confirmado desde
 * afuera. Todo lo que no está publicado responde el mismo 404 que un id inventado.
 */

const mockTx = {
  $queryRaw: vi.fn(),
  eventBlock: { findUnique: vi.fn() },
  registration: { findFirst: vi.fn(), count: vi.fn(), update: vi.fn(), create: vi.fn() },
}

const mockPrisma = {
  event: { findUnique: vi.fn() },
  membership: { findUnique: vi.fn() },
  registration: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { register } = await import('./registrationService.js')

const EVENTO_PUBLICADO = { id: 'ev_1', past: false, socioOnly: false, published: true }
const FILA_NUEVA = { id: 'reg_1', eventId: 'ev_1', blockId: null, ts: new Date(), status: 'confirmada' }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx))
  mockPrisma.event.findUnique.mockResolvedValue(EVENTO_PUBLICADO)
  mockTx.registration.findFirst.mockResolvedValue(null)
  mockTx.registration.count.mockResolvedValue(0)
  mockTx.registration.create.mockResolvedValue(FILA_NUEVA)
  mockTx.eventBlock.findUnique.mockResolvedValue({
    id: 'blk_a', eventId: 'ev_1', capacity: 10, seedTaken: 0,
  })
})

describe('register — gate de publicado', () => {
  it('un evento en borrador da el MISMO 404 que un id inexistente', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_PUBLICADO, published: false })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({
      status: 404,
      code: 'EVENT_NOT_FOUND',
    })
    mockPrisma.event.findUnique.mockResolvedValue(null)
    await expect(register('dev_1', 'ev_inventado')).rejects.toMatchObject({
      status: 404,
      code: 'EVENT_NOT_FOUND',
    })
  })

  it('el borrador se rechaza ANTES de abrir la transacción: no toca cupos ni crea filas', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_PUBLICADO, published: false })
    await expect(register('dev_1', 'ev_1', 'blk_a')).rejects.toThrow()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockTx.registration.create).not.toHaveBeenCalled()
  })

  // El orden de los gates importa: si published se evaluara después, un borrador pasado o
  // socioOnly contestaría EVENT_PAST / SOCIO_ONLY y eso ya confirma que el evento existe.
  it('un borrador pasado no dice EVENT_PAST, dice EVENT_NOT_FOUND', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_PUBLICADO, published: false, past: true })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' })
  })

  it('un borrador socioOnly no dice SOCIO_ONLY, dice EVENT_NOT_FOUND', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_PUBLICADO, published: false, socioOnly: true })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' })
    expect(mockPrisma.membership.findUnique).not.toHaveBeenCalled()
  })
})

describe('register — el evento publicado sigue funcionando igual', () => {
  it('inscribe a nivel evento (sin bloque)', async () => {
    const reg = await register('dev_1', 'ev_1')
    expect(reg).toMatchObject({ id: 'reg_1', eventId: 'ev_1', status: 'confirmada' })
    expect(mockTx.registration.create).toHaveBeenCalled()
  })

  it('inscribe a un bloque con lugar', async () => {
    mockTx.registration.create.mockResolvedValue({ ...FILA_NUEVA, blockId: 'blk_a' })
    const reg = await register('dev_1', 'ev_1', 'blk_a')
    expect(reg.blockId).toBe('blk_a')
  })

  it('sigue rechazando un bloque completo con BLOCK_FULL', async () => {
    mockTx.registration.count.mockResolvedValue(10)
    await expect(register('dev_1', 'ev_1', 'blk_a')).rejects.toMatchObject({
      status: 409,
      code: 'BLOCK_FULL',
    })
  })

  it('sigue cerrando la inscripción a un evento finalizado con EVENT_PAST', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_PUBLICADO, past: true })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({
      status: 409,
      code: 'EVENT_PAST',
    })
  })

  it('sigue exigiendo membresía en un evento socioOnly publicado', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_PUBLICADO, socioOnly: true })
    mockPrisma.membership.findUnique.mockResolvedValue({ deviceId: 'dev_1', tier: 'general' })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({
      status: 403,
      code: 'SOCIO_ONLY',
    })
  })
})
