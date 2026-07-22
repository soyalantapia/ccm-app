import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * register() es lo más delicado del backend y hasta acá no tenía NINGÚN test: es la única pieza
 * del sistema con control anti-sobreventa real (`SELECT ... FOR UPDATE` sobre la fila del bloque
 * dentro de una transacción). Esta suite fija su contrato: el orden de los gates, el 409 cuando
 * el bloque está lleno, la reactivación de una inscripción cancelada, y el lock sobre Event del
 * camino sin bloque —que no es redundante: el @@unique(deviceId,eventId,blockId) no protege con
 * blockId null porque en Postgres dos NULL se consideran distintos.
 */

const tx = {
  $queryRaw: vi.fn(),
  eventBlock: { findUnique: vi.fn() },
  registration: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
}

const mockPrisma = {
  event: { findUnique: vi.fn() },
  membership: { findUnique: vi.fn() },
  registration: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn((fn: (c: typeof tx) => unknown) => fn(tx)),
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { register } = await import('./registrationService.js')

const EVENTO_VIVO = { id: 'ev_1', published: true, past: false, socioOnly: false }
const BLOQUE = { id: 'blk_1', eventId: 'ev_1', capacity: 10, seedTaken: 3 }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.event.findUnique.mockResolvedValue(EVENTO_VIVO)
  mockPrisma.$transaction.mockImplementation((fn: (c: typeof tx) => unknown) => fn(tx))
  tx.$queryRaw.mockResolvedValue([])
  tx.eventBlock.findUnique.mockResolvedValue(BLOQUE)
  tx.registration.findFirst.mockResolvedValue(null)
  tx.registration.count.mockResolvedValue(0)
  tx.registration.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...data, ts: new Date() }),
  )
  tx.registration.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'reg_x', deviceId: 'dev_1', eventId: 'ev_1', blockId: 'blk_1', ...data }),
  )
})

describe('register — gates del evento', () => {
  it('evento inexistente → 404', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(null)
    await expect(register('dev_1', 'ev_x')).rejects.toMatchObject({
      status: 404,
      code: 'EVENT_NOT_FOUND',
    })
  })

  it('evento en BORRADOR → 404, y responde igual que uno inexistente', async () => {
    // Sin este gate se podía crear una inscripción confirmada, con su QR, contra un evento que
    // el organizador todavía estaba armando. El código debe usar el MISMO error que "no existe"
    // para que un borrador no sea adivinable desde afuera.
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_VIVO, published: false })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({
      status: 404,
      code: 'EVENT_NOT_FOUND',
    })
  })

  it('el gate de borrador corre ANTES que el de evento pasado: un borrador vencido sigue diciendo 404', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_VIVO, published: false, past: true })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' })
  })

  it('evento finalizado → 409 EVENT_PAST', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_VIVO, past: true })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({
      status: 409,
      code: 'EVENT_PAST',
    })
  })

  it('evento CON PRECIO no se puede tomar gratis → 409 EVENT_REQUIRES_PAYMENT', async () => {
    // El lugar de un evento pago lo crea el aviso de Mercado Pago, no esta ruta. Sin este guard,
    // apagar el botón en la pantalla es cosmético: el POST sigue abierto.
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_VIVO, price: 45000 })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({
      status: 409,
      code: 'EVENT_REQUIRES_PAYMENT',
    })
  })

  it('un evento pago tampoco se puede tomar gratis POR UN BLOQUE de su grilla', async () => {
    // Ésta es la puerta de atrás: el CTA de arriba dice "Comprar", pero cada renglón de la
    // agenda tenía su propio "Inscribime" que llamaba a la misma ruta con un blockId.
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_VIVO, price: 45000 })
    await expect(register('dev_1', 'ev_1', 'blk_1')).rejects.toMatchObject({
      code: 'EVENT_REQUIRES_PAYMENT',
    })
    // Ni siquiera llega a abrir la transacción del cupo.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('evento sólo para Socios sin membresía → 403 SOCIO_ONLY', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_VIVO, socioOnly: true })
    mockPrisma.membership.findUnique.mockResolvedValue(null)
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({
      status: 403,
      code: 'SOCIO_ONLY',
    })
  })

  it('evento sólo para Socios CON membresía socio → pasa', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ ...EVENTO_VIVO, socioOnly: true })
    mockPrisma.membership.findUnique.mockResolvedValue({ deviceId: 'dev_1', tier: 'socio' })
    await expect(register('dev_1', 'ev_1', 'blk_1')).resolves.toMatchObject({ eventId: 'ev_1' })
  })
})

describe('register con bloque — cupo y lock', () => {
  it('toma el lock de la fila del bloque ANTES de contar', async () => {
    await register('dev_1', 'ev_1', 'blk_1')
    expect(tx.$queryRaw).toHaveBeenCalled()
    const sql = tx.$queryRaw.mock.calls[0][0].join('?')
    expect(sql).toContain('EventBlock')
    expect(sql).toContain('FOR UPDATE')
    // El lock tiene que ir antes del count o no serializa nada.
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.registration.count.mock.invocationCallOrder[0],
    )
  })

  it('bloque de otro evento → 404 (no se puede inscribir cruzado)', async () => {
    tx.eventBlock.findUnique.mockResolvedValue({ ...BLOQUE, eventId: 'ev_otro' })
    await expect(register('dev_1', 'ev_1', 'blk_1')).rejects.toMatchObject({
      code: 'BLOCK_NOT_FOUND',
    })
  })

  it('cupo lleno contando seedTaken → 409 BLOCK_FULL', async () => {
    // capacity 10, seedTaken 3: con 7 confirmadas ya está completo.
    tx.registration.count.mockResolvedValue(7)
    await expect(register('dev_1', 'ev_1', 'blk_1')).rejects.toMatchObject({
      status: 409,
      code: 'BLOCK_FULL',
    })
  })

  it('el último lugar SÍ se puede tomar (el límite es >=, no >)', async () => {
    tx.registration.count.mockResolvedValue(6) // 3 + 6 = 9 < 10
    await expect(register('dev_1', 'ev_1', 'blk_1')).resolves.toMatchObject({ blockId: 'blk_1' })
  })

  it('ya inscripto y confirmado → 409 ALREADY_REGISTERED', async () => {
    tx.registration.findFirst.mockResolvedValue({ id: 'reg_1', status: 'confirmada' })
    await expect(register('dev_1', 'ev_1', 'blk_1')).rejects.toMatchObject({
      code: 'ALREADY_REGISTERED',
    })
  })

  it('inscripción CANCELADA se reactiva en vez de crear otra fila (respeta el @@unique)', async () => {
    tx.registration.findFirst.mockResolvedValue({ id: 'reg_1', status: 'cancelada' })
    await register('dev_1', 'ev_1', 'blk_1')
    expect(tx.registration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reg_1' },
        data: expect.objectContaining({ status: 'confirmada' }),
      }),
    )
    expect(tx.registration.create).not.toHaveBeenCalled()
  })
})

describe('register sin bloque — el lock sobre Event no es redundante', () => {
  it('lockea la fila del Event: el @@unique no cubre blockId null', async () => {
    // En Postgres dos NULL son distintos dentro de un índice único, así que sin este lock dos
    // POST en carrera del mismo device creaban DOS inscripciones (y dos QR) para el mismo evento.
    await register('dev_1', 'ev_1')
    const sql = tx.$queryRaw.mock.calls[0][0].join('?')
    expect(sql).toContain('"Event"')
    expect(sql).toContain('FOR UPDATE')
  })

  it('crea la inscripción general con blockId null en la base, y el serializador lo omite', async () => {
    const r = await register('dev_1', 'ev_1')
    // La fila se escribe con blockId null (es lo que distingue "general" de "a un bloque")…
    expect(tx.registration.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ blockId: null }) }),
    )
    // …pero toRegistration omite la clave en vez de mandar null, así que el front recibe undefined.
    expect(r).not.toHaveProperty('blockId')
    expect(r.eventId).toBe('ev_1')
  })

  it('ya inscripto al evento → 409 ALREADY_REGISTERED', async () => {
    tx.registration.findFirst.mockResolvedValue({ id: 'reg_1', status: 'confirmada' })
    await expect(register('dev_1', 'ev_1')).rejects.toMatchObject({ code: 'ALREADY_REGISTERED' })
  })
})
