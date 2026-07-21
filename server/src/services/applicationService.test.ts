import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = {
  application: { updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  adminUser: { findUnique: vi.fn() },
}
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { decideApplication } = await import('./applicationService.js')

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.adminUser.findUnique.mockResolvedValue({ email: 'gaston@ccm.test' })
  mockPrisma.application.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.application.findUnique.mockResolvedValue({
    id: 'app-1', status: 'aceptada', fromSeed: false, data: {}, convocatoria: { title: 'Camino a CCM' },
  })
})

describe('decideApplication — transición condicionada', () => {
  it('exige que la postulación esté en preinscripta', async () => {
    await decideApplication('app-1', 'aceptada', { adminUserId: 'u1' })
    const args = mockPrisma.application.updateMany.mock.calls[0][0]
    expect(args.where).toMatchObject({ id: 'app-1', status: 'preinscripta' })
  })

  it('guarda el EMAIL de quien decidió, no su id', async () => {
    await decideApplication('app-1', 'aceptada', { adminUserId: 'u1' })
    const args = mockPrisma.application.updateMany.mock.calls[0][0]
    expect(args.data.decidedBy).toBe('gaston@ccm.test')
  })

  it('si ya estaba decidida (count 0) tira 409 y no sigue', async () => {
    mockPrisma.application.updateMany.mockResolvedValue({ count: 0 })
    await expect(decideApplication('app-1', 'aceptada', { adminUserId: 'u1' })).rejects.toMatchObject({
      status: 409,
      // No alcanza con el status: un código de error equivocado (ej. otro conflicto)
      // pasaría igual si solo miramos el 409.
      code: 'APPLICATION_ALREADY_DECIDED',
    })
  })

  it('la nota es opcional: rechazar sin nota funciona', async () => {
    await decideApplication('app-1', 'rechazada', { adminUserId: 'u1' })
    const args = mockPrisma.application.updateMany.mock.calls[0][0]
    // toHaveBeenCalled() solo no alcanza: pasaría aunque decisionNote quedara
    // guardado mal (undefined, '' o cualquier otra cosa que no sea null).
    expect(args.data.decisionNote).toBeNull()
  })
})

describe('decideApplication — volver a revisión (deshacer)', () => {
  // Esta rama no tenía ningún test. Importa porque la tarea siguiente (envío de
  // email) va a leer notifiedAt/notifyError para decidir si reenviar: si una
  // regresión dejara alguno de estos campos colgado, nadie se enteraría.

  it('exige que la postulación esté decidida (aceptada o rechazada), no cualquier estado', async () => {
    await decideApplication('app-1', 'preinscripta', { adminUserId: 'u1' })
    const args = mockPrisma.application.updateMany.mock.calls[0][0]
    expect(args.where).toMatchObject({ id: 'app-1', status: { in: ['aceptada', 'rechazada'] } })
  })

  it('limpia los cinco campos de la decisión previa', async () => {
    await decideApplication('app-1', 'preinscripta', { adminUserId: 'u1' })
    const args = mockPrisma.application.updateMany.mock.calls[0][0]
    expect(args.data).toMatchObject({
      status: 'preinscripta',
      decidedAt: null,
      decidedBy: null,
      decisionNote: null,
      notifiedAt: null,
      notifyError: null,
    })
  })

  it('si la postulación no estaba decidida (count 0) tira 409 y no sigue', async () => {
    mockPrisma.application.updateMany.mockResolvedValue({ count: 0 })
    await expect(decideApplication('app-1', 'preinscripta', { adminUserId: 'u1' })).rejects.toMatchObject({
      status: 409,
      code: 'APPLICATION_ALREADY_DECIDED',
    })
  })
})
