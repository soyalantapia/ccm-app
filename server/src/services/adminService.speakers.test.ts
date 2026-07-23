import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = {
  catalogProfile: { update: vi.fn() },
  eventSpeaker: { deleteMany: vi.fn(), createMany: vi.fn() },
  $queryRaw: vi.fn(),
  portfolioPiece: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), createMany: vi.fn() },
}
const mockPrisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  catalogProfile: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'cat-1', portfolio: [] }) },
}
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))
const { updateCatalogProfile } = await import('./adminService.js')

beforeEach(() => vi.clearAllMocks())

describe('updateCatalogProfile — apariciones de speaker', () => {
  it('reemplaza las filas EventSpeaker cuando viene speakerAppearances', async () => {
    await updateCatalogProfile('cat-1', {
      quote: 'Inspiro',
      speakerAppearances: [{ eventId: 'ev-2026', blockId: null }],
    } as never)
    expect(tx.eventSpeaker.deleteMany).toHaveBeenCalledWith({ where: { profileId: 'cat-1' } })
    expect(tx.eventSpeaker.createMany).toHaveBeenCalledWith({
      data: [{ eventId: 'ev-2026', profileId: 'cat-1', blockId: null, order: 0 }],
    })
  })

  it('NO toca EventSpeaker si speakerAppearances es undefined', async () => {
    await updateCatalogProfile('cat-1', { name: 'X' } as never)
    expect(tx.eventSpeaker.deleteMany).not.toHaveBeenCalled()
  })
})
