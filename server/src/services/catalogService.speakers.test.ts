import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = {
  event: { findMany: vi.fn() },
}
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { getSpeakersByEvent } = await import('./catalogService.js')

const perfil = (id: string, name: string) => ({
  id, slug: id, name, role: 'Speaker', kind: 'speaker', platform: 'Moda',
  city: 'Córdoba', bio: 'b', projects: null, photo: 'p', instagram: null,
  whatsapp: null, verified: true, participatesIn: [], quote: 'Inspiro',
  portfolio: [], createdAt: new Date(), updatedAt: new Date(),
})

beforeEach(() => {
  vi.clearAllMocks()
  // Dos eventos publicados; el más nuevo primero (orden desc por fecha).
  mockPrisma.event.findMany.mockResolvedValue([
    {
      id: 'ev-2026', title: 'CCM 2026', startDate: new Date('2026-09-19T00:00:00Z'), published: true,
      speakers: [{ profile: perfil('cat-1', 'Carolina'), order: 0 }],
    },
    {
      id: 'ev-2025', title: 'CCM 2025', startDate: new Date('2025-09-20T00:00:00Z'), published: true,
      speakers: [{ profile: perfil('cat-2', 'Marcos'), order: 0 }],
    },
  ])
})

describe('getSpeakersByEvent', () => {
  it('agrupa por evento y devuelve el perfil serializado', async () => {
    const out = await getSpeakersByEvent()
    expect(out).toHaveLength(2)
    expect(out[0].eventId).toBe('ev-2026')
    expect(out[0].eventDate).toBe('2026-09-19') // ISO 'YYYY-MM-DD', no String(Date) (corre el día por timezone)
    expect(out[0].speakers[0].name).toBe('Carolina')
    expect(out[0].speakers[0].quote).toBe('Inspiro')
  })

  it('filtra por eventos publicados con al menos un speaker', async () => {
    await getSpeakersByEvent()
    const query = mockPrisma.event.findMany.mock.calls[0][0]
    expect(query.where).toMatchObject({ published: true, speakers: { some: {} } })
  })

  it('no incluye eventos sin speakers', async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      { id: 'ev-vacio', title: 'Vacío', startDate: new Date('2026-01-01T00:00:00Z'), published: true, speakers: [] },
    ])
    expect(await getSpeakersByEvent()).toEqual([])
  })
})
