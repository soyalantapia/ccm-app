import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getEventAvailability (batch) debe dar EXACTAMENTE los mismos números que
 * blockAvailability (individual) para cada bloque. El batch existe para matar el
 * fan-out de N+1 requests de AdminEventos; si diverge, el admin ve cupos distintos
 * según por dónde entre — peor que el problema de performance que vino a resolver.
 */

const mockPrisma = {
  eventBlock: { findMany: vi.fn(), findUnique: vi.fn() },
  registration: { groupBy: vi.fn(), count: vi.fn() },
  event: { findMany: vi.fn(), findUnique: vi.fn() },
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { getEventAvailability, blockAvailability, getBlocks, generalRegistrationCount } =
  await import('./eventService.js')

// Escenario: 3 bloques del mismo evento con seedTaken distinto y un bloque que se
// pasa de capacidad (confirmadas + seedTaken > capacity) para ejercitar el clamp.
const BLOCKS = [
  { id: 'blk_a', eventId: 'ev_1', capacity: 10, seedTaken: 3 }, // +2 conf → 5 taken, 5 left
  { id: 'blk_b', eventId: 'ev_1', capacity: 5, seedTaken: 5 }, // +1 conf → clamp a 5, full
  { id: 'blk_c', eventId: 'ev_1', capacity: 8, seedTaken: 0 }, // 0 conf → 0 taken, 8 left
]
const CONFIRMADAS: Record<string, number> = { blk_a: 2, blk_b: 1, blk_c: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.eventBlock.findMany.mockResolvedValue(BLOCKS)
  // El evento padre existe y está PUBLICADO salvo que un test diga lo contrario: la agenda, el
  // cupo y la inscripción heredan `published` del evento, así que sin esto todo da 404.
  mockPrisma.event.findUnique.mockResolvedValue({ id: 'ev_1', published: true })
  mockPrisma.eventBlock.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
    const b = BLOCKS.find((x) => x.id === where.id)
    // blockAvailability incluye el evento para poder mirar `published`.
    return Promise.resolve(b ? { ...b, event: { published: true } } : null)
  })
  mockPrisma.registration.groupBy.mockResolvedValue(
    Object.entries(CONFIRMADAS).map(([blockId, n]) => ({ blockId, _count: { _all: n } })),
  )
  // count se usa para generals (blockId:null) y para el conteo por bloque del individual.
  mockPrisma.registration.count.mockImplementation(({ where }: { where: { blockId?: string | null } }) =>
    Promise.resolve(where.blockId == null ? 7 : (CONFIRMADAS[where.blockId] ?? 0)),
  )
})

describe('getEventAvailability (batch) vs blockAvailability (individual)', () => {
  it('da los MISMOS capacity/taken/left/full que el cálculo per-bloque', async () => {
    const batch = await getEventAvailability('ev_1')
    for (const b of BLOCKS) {
      const individual = await blockAvailability(b.id)
      const fromBatch = batch.blocks.find((x) => x.id === b.id)
      expect(fromBatch, `bloque ${b.id} ausente del batch`).toBeDefined()
      const { id: _id, ...batchNums } = fromBatch!
      expect(batchNums, `divergencia en ${b.id}`).toEqual(individual)
    }
  })

  it('clampea taken a capacity y nunca devuelve left negativo', async () => {
    const { blocks } = await getEventAvailability('ev_1')
    const b = blocks.find((x) => x.id === 'blk_b')!
    expect(b.taken).toBe(5) // seedTaken 5 + 1 confirmada = 6, clampeado a capacity 5
    expect(b.left).toBe(0)
    expect(b.full).toBe(true)
    for (const x of blocks) expect(x.left).toBeGreaterThanOrEqual(0)
  })

  it('devuelve los inscriptos generales (blockId null) del evento', async () => {
    const { generals } = await getEventAvailability('ev_1')
    expect(generals).toBe(7)
  })

  it('agrupa por blockId de los bloques del evento (NO por eventId): batch e individual no pueden divergir', async () => {
    await getEventAvailability('ev_1')
    const groupArgs = mockPrisma.registration.groupBy.mock.calls[0][0]
    expect(groupArgs.where.blockId).toEqual({ in: ['blk_a', 'blk_b', 'blk_c'] })
    expect(groupArgs.where.eventId).toBeUndefined()
  })

  it('con cero bloques no rompe y devuelve lista vacía + generales', async () => {
    mockPrisma.eventBlock.findMany.mockResolvedValue([])
    mockPrisma.registration.groupBy.mockResolvedValue([])
    const r = await getEventAvailability('ev_vacio')
    expect(r.blocks).toEqual([])
    expect(r.generals).toBe(7)
  })
})

/**
 * Un evento en BORRADOR no existe para el público — tampoco por sus rutas hijas.
 * getEvents/getEvent ya lo filtraban, pero la agenda y el cupo NO heredaban la regla: con el id
 * de un borrador (que se ve en el panel, no es secreto) se leía la grilla entera y los cupos.
 * Estos tests salen en ROJO contra el código anterior al gate: ése es su punto.
 */
describe('borradores: la agenda y el cupo heredan `published` del evento', () => {
  const draft = { id: 'ev_draft', published: false }

  it('getBlocks de un borrador da 404, igual que un evento inexistente', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(draft)
    await expect(getBlocks('ev_draft')).rejects.toMatchObject({
      status: 404,
      code: 'EVENT_NOT_FOUND',
    })
  })

  it('getEventAvailability de un borrador da 404', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(draft)
    await expect(getEventAvailability('ev_draft')).rejects.toMatchObject({ status: 404 })
  })

  it('generalRegistrationCount de un borrador da 404', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(draft)
    await expect(generalRegistrationCount('ev_draft')).rejects.toMatchObject({ status: 404 })
  })

  it('blockAvailability de un bloque de borrador da 404 (mismo código que un bloque inexistente)', async () => {
    mockPrisma.eventBlock.findUnique.mockResolvedValue({
      ...BLOCKS[0],
      event: { published: false },
    })
    await expect(blockAvailability('blk_a')).rejects.toMatchObject({
      status: 404,
      code: 'BLOCK_NOT_FOUND',
    })
  })

  it('el panel SÍ los ve: con { admin: true } el borrador responde normal', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(draft)
    mockPrisma.eventBlock.findMany.mockResolvedValue(BLOCKS)
    const blocks = await getBlocks('ev_draft', { admin: true })
    expect(blocks).toHaveLength(3)

    const avail = await getEventAvailability('ev_draft', { admin: true })
    expect(avail.blocks).toHaveLength(3)

    mockPrisma.eventBlock.findUnique.mockResolvedValue({
      ...BLOCKS[0],
      event: { published: false },
    })
    await expect(blockAvailability('blk_a', { admin: true })).resolves.toMatchObject({
      capacity: 10,
    })
  })
})
