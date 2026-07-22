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

describe('getApplications — cola de revisión', () => {
  it('ordena por más antigua primero: es la que más esperó', async () => {
    mockPrisma.application.findMany.mockResolvedValue([])
    const { getApplications } = await import('./applicationService.js')
    await getApplications()
    const args = mockPrisma.application.findMany.mock.calls[0][0]
    expect(args.orderBy).toMatchObject({ ts: 'asc' })
  })

  it('devuelve nextCursor cuando hay más de una página', async () => {
    const filas = Array.from({ length: 51 }, (_, i) => ({
      id: `app-${i}`, convocatoriaId: 'c1', status: 'preinscripta', data: {}, ts: new Date(), fromSeed: false,
    }))
    mockPrisma.application.findMany.mockResolvedValue(filas)
    const { getApplications } = await import('./applicationService.js')
    const r = await getApplications({ limit: 50 })
    expect(r.items).toHaveLength(50)
    expect(r.nextCursor).toBe('app-49')
  })

  // Esta cola es EXCLUSIVAMENTE del panel (requirePermission('applications:read')): acá SÍ
  // tiene que viajar decidedBy, y en TODAS las filas — no solo la primera (ver el test de abajo
  // sobre por qué "solo la primera" es justo el bug que hay que evitar).
  it('incluye decidedBy en cada fila decidida, sin importar la posición', async () => {
    const filas = [
      { id: 'app-0', convocatoriaId: 'c1', status: 'aceptada', data: {}, ts: new Date(), fromSeed: false, decidedBy: 'a@ccm.test' },
      { id: 'app-1', convocatoriaId: 'c1', status: 'aceptada', data: {}, ts: new Date(), fromSeed: false, decidedBy: 'b@ccm.test' },
      { id: 'app-2', convocatoriaId: 'c1', status: 'aceptada', data: {}, ts: new Date(), fromSeed: false, decidedBy: 'c@ccm.test' },
    ]
    mockPrisma.application.findMany.mockResolvedValue(filas)
    const { getApplications } = await import('./applicationService.js')
    const r = await getApplications()
    expect(r.items.map((a) => a.decidedBy)).toEqual(['a@ccm.test', 'b@ccm.test', 'c@ccm.test'])
  })
})

describe('getDeviceApplications — "Mis postulaciones" del propio postulante', () => {
  // Regresión: pasar toApplication SUELTO a .map() deja que Array#map le mande el índice como
  // segundo argumento (forAdmin), y como 1, 2, 3... son truthy, decidedBy (el email del admin
  // que decidió) se filtraba a partir de la SEGUNDA fila. Con una sola fila el bug no se veía.
  it('NUNCA incluye decidedBy, en ninguna fila — ni siquiera de la segunda en adelante', async () => {
    const filas = [
      { id: 'app-0', convocatoriaId: 'c1', status: 'aceptada', data: {}, ts: new Date(), fromSeed: false, decidedBy: 'a@ccm.test' },
      { id: 'app-1', convocatoriaId: 'c1', status: 'aceptada', data: {}, ts: new Date(), fromSeed: false, decidedBy: 'b@ccm.test' },
      { id: 'app-2', convocatoriaId: 'c1', status: 'aceptada', data: {}, ts: new Date(), fromSeed: false, decidedBy: 'c@ccm.test' },
    ]
    mockPrisma.application.findMany.mockResolvedValue(filas)
    const { getDeviceApplications } = await import('./applicationService.js')
    const items = await getDeviceApplications('device-1')
    for (const item of items) expect('decidedBy' in item).toBe(false)
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

  // Sin esto, una postulación decidida → deshecha → decidida de nuevo podía mostrar el
  // notifiedAt/notifyError de la decisión ANTERIOR como si fuera de la actual (la rama de
  // "volver a revisión" ya limpiaba estos dos campos; a esta rama, la de decidir, le faltaba).
  it('la transición también limpia notifiedAt/notifyError: una decisión nueva no hereda el aviso de la anterior', async () => {
    await decideApplication('app-1', 'aceptada', { adminUserId: 'u1' })
    const args = mockPrisma.application.updateMany.mock.calls[0][0]
    expect(args.data).toMatchObject({ notifiedAt: null, notifyError: null })
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

  /**
   * Carrera entre el envío y "Deshacer" (review, IMPORTANTE 5). El envío es async; si mientras
   * el SMTP tarda alguien deshace (vuelve a preinscripta) o decide de nuevo, la fila ya NO
   * representa la decisión que originó este mail. Antes el update posterior al envío usaba
   * `where: { id }` a secas, así que aterrizaba igual sobre la fila ya revertida y le dejaba un
   * notifiedAt de un aviso que no corresponde a la decisión actual. Acá se verifica que el
   * `where` de esos dos updates (éxito y error) incluya el status recién decidido — en la DB
   * real, eso hace que el update no matchee ninguna fila (count 0) si el estado ya cambió.
   */
  it('el update de éxito condiciona por { id, status } — no solo por id', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-6', status: 'aceptada', fromSeed: false,
      data: { nombre: 'Lautaro', email: 'lau@mail.test' }, convocatoria: { title: 'C' },
    })
    await decideApplication('app-6', 'aceptada', { adminUserId: 'u1' })
    const ultima = mockPrisma.application.updateMany.mock.calls.at(-1)![0]
    expect(ultima.where).toMatchObject({ id: 'app-6', status: 'aceptada' })
  })

  it('el update de error TAMBIÉN condiciona por { id, status } — no solo por id', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-7', status: 'rechazada', fromSeed: false,
      data: { nombre: 'W', email: 'w@mail.test' }, convocatoria: { title: 'C' },
    })
    const mailer = await import('../mail/mailer.js')
    vi.spyOn(mailer, 'getMailer').mockReturnValue({
      send: async () => { throw new Error('SMTP caído') },
    })
    await decideApplication('app-7', 'rechazada', { adminUserId: 'u1' })
    const ultima = mockPrisma.application.updateMany.mock.calls.at(-1)![0]
    expect(ultima.where).toMatchObject({ id: 'app-7', status: 'rechazada' })
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
