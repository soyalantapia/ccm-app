import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDevOutbox, clearDevOutbox } from '../mail/mailer.js'

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

describe('decideApplication — aviso al postulante', () => {
  beforeEach(() => clearDevOutbox())

  it('manda el mail al email que cargó el postulante', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-1', status: 'aceptada', fromSeed: false,
      data: { nombre: 'Lautaro', email: 'lau@mail.test' },
      convocatoria: { title: 'Camino a CCM' },
    })
    await decideApplication('app-1', 'aceptada', { adminUserId: 'u1' })
    expect(getDevOutbox()).toHaveLength(1)
    expect(getDevOutbox()[0].to).toBe('lau@mail.test')
  })

  // Una postulación de demo trae un email de aspecto real que no es de nadie —o peor, de alguien.
  it('NUNCA le manda mail a una postulación de demo', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-seed', status: 'aceptada', fromSeed: true,
      data: { nombre: 'Demo', email: 'milagros.soria.disenio@gmail.com' },
      convocatoria: { title: 'Camino a CCM' },
    })
    await decideApplication('app-seed', 'aceptada', { adminUserId: 'u1' })
    expect(getDevOutbox()).toHaveLength(0)
  })

  it('sin email en la postulación, decide igual y no intenta enviar', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-2', status: 'aceptada', fromSeed: false,
      data: { nombre: 'Sin Mail' }, convocatoria: { title: 'Camino a CCM' },
    })
    await expect(decideApplication('app-2', 'aceptada', { adminUserId: 'u1' })).resolves.toBeUndefined()
    expect(getDevOutbox()).toHaveLength(0)
  })

  it('con skipEmail no manda nada, aunque haya email', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-3', status: 'rechazada', fromSeed: false,
      data: { nombre: 'X', email: 'x@mail.test' }, convocatoria: { title: 'C' },
    })
    await decideApplication('app-3', 'rechazada', { adminUserId: 'u1', skipEmail: true })
    expect(getDevOutbox()).toHaveLength(0)
  })

  it('si el envío falla, la decisión QUEDA y se registra el error', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-4', status: 'aceptada', fromSeed: false,
      data: { nombre: 'Y', email: 'no-existe@' }, convocatoria: { title: 'C' },
    })
    const mailer = await import('../mail/mailer.js')
    vi.spyOn(mailer, 'getMailer').mockReturnValue({
      send: async () => { throw new Error('SMTP caído') },
    })
    await expect(decideApplication('app-4', 'aceptada', { adminUserId: 'u1' })).resolves.toBeUndefined()
    const ultima = mockPrisma.application.updateMany.mock.calls.at(-1)![0]
    expect(ultima.data.notifyError).toContain('SMTP caído')
    vi.restoreAllMocks()
  })

  // Con email presente a propósito: si el guard de "volver a revisión" se rompiera, el de
  // "sin email" taparía el bug y este test seguiría en verde sin detectarlo.
  it('volver a revisión no dispara ningún aviso', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-5', status: 'aceptada', fromSeed: false,
      data: { nombre: 'Z', email: 'z@mail.test' }, convocatoria: { title: 'C' },
    })
    await decideApplication('app-5', 'preinscripta', { adminUserId: 'u1' })
    expect(getDevOutbox()).toHaveLength(0)
  })
})
