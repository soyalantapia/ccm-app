import { describe, it, expect, vi, beforeEach } from 'vitest'

// El link y el token se leen de env.ts al importar el módulo, así que estas dos van ANTES del
// `await import` de abajo — un beforeAll correría tarde (después de que el módulo ya cargó).
process.env.GRANT_TOKEN_SECRET = 'x'.repeat(40)
process.env.PUBLIC_BASE_URL = 'https://ccm.test'

/**
 * `crearGrant` corre casi todo dentro de una transacción. Se mockea prisma.$transaction para que
 * ejecute el callback con un `tx` de mocks: así se ejercita la lógica de validación y de cupo sin
 * una base real. El flujo completo contra Postgres ya se probó por curl; esto lo fija como
 * regresión.
 */
const tx = {
  person: { findUnique: vi.fn() },
  event: { findUnique: vi.fn() },
  ticketGrant: { findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  registration: { count: vi.fn(), updateMany: vi.fn() },
}
const mockPrisma = {
  ...tx,
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { crearGrant, linkDeGrant } = await import('./grantService.js')

const EVENTO_OK = { id: 'ev_1', published: true, past: false, capacity: null, seedTaken: 0 }
const PERSONA_OK = { id: 'per_1', email: 'a@b.com' }

beforeEach(() => {
  vi.clearAllMocks()
  tx.person.findUnique.mockResolvedValue(PERSONA_OK)
  tx.event.findUnique.mockResolvedValue(EVENTO_OK)
  tx.ticketGrant.findFirst.mockResolvedValue(null) // no hay duplicado
  tx.ticketGrant.aggregate.mockResolvedValue({ _sum: { qty: 0 } })
  tx.registration.count.mockResolvedValue(0)
  tx.ticketGrant.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'grant_1', tokenVersion: 1, status: 'pendiente', note: null, createdAt: new Date('2026-09-01'), ...data }),
  )
})

const base = { personId: 'per_1', eventId: 'ev_1', grantedById: 'admin_1' }

describe('crearGrant — validaciones', () => {
  it('crea la cortesía y devuelve un link con token', async () => {
    const g = await crearGrant({ ...base, qty: 2, note: 'prensa' })
    expect(g.status).toBe('pendiente')
    expect(g.qty).toBe(2)
    expect(g.link).toMatch(/^https:\/\/ccm\.test\/i\/grant_1\./)
    expect(tx.ticketGrant.create).toHaveBeenCalled()
  })

  it('rechaza qty fuera de 1..20 sin tocar la base', async () => {
    await expect(crearGrant({ ...base, qty: 0 })).rejects.toMatchObject({ code: 'GRANT_QTY_INVALIDA' })
    await expect(crearGrant({ ...base, qty: 21 })).rejects.toMatchObject({ code: 'GRANT_QTY_INVALIDA' })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('rechaza una persona inexistente', async () => {
    tx.person.findUnique.mockResolvedValue(null)
    await expect(crearGrant({ ...base, qty: 1 })).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' })
  })

  it('rechaza un evento borrador (published false) como inexistente', async () => {
    tx.event.findUnique.mockResolvedValue({ ...EVENTO_OK, published: false })
    await expect(crearGrant({ ...base, qty: 1 })).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' })
  })

  it('rechaza un evento ya pasado', async () => {
    tx.event.findUnique.mockResolvedValue({ ...EVENTO_OK, past: true })
    await expect(crearGrant({ ...base, qty: 1 })).rejects.toMatchObject({ code: 'EVENT_PAST' })
  })

  it('rechaza una segunda cortesía activa a la misma persona y evento', async () => {
    tx.ticketGrant.findFirst.mockResolvedValue({ id: 'grant_previo', status: 'pendiente' })
    await expect(crearGrant({ ...base, qty: 1 })).rejects.toMatchObject({ code: 'GRANT_DUPLICADO' })
  })

  it('NO chequea socioOnly ni precio: regalar es saltarse el peaje', async () => {
    tx.event.findUnique.mockResolvedValue({ ...EVENTO_OK, socioOnly: true, price: 20000 })
    const g = await crearGrant({ ...base, qty: 1 })
    expect(g.status).toBe('pendiente') // entra igual
  })
})

describe('crearGrant — cupo reservado al otorgar', () => {
  it('deja pasar mientras haya lugar', async () => {
    tx.event.findUnique.mockResolvedValue({ ...EVENTO_OK, capacity: 5, seedTaken: 1 })
    tx.registration.count.mockResolvedValue(1) // 1 inscripto
    tx.ticketGrant.aggregate.mockResolvedValue({ _sum: { qty: 1 } }) // 1 reservado por otro grant
    // ocupados = 1 seed + 1 insc + 1 grant = 3; pido 2 → 5, entra justo
    const g = await crearGrant({ ...base, qty: 2 })
    expect(g.qty).toBe(2)
  })

  it('rebota con EVENT_FULL cuando el regalo no entra (reserva desde pendiente)', async () => {
    tx.event.findUnique.mockResolvedValue({ ...EVENTO_OK, capacity: 2, seedTaken: 0 })
    tx.registration.count.mockResolvedValue(0)
    tx.ticketGrant.aggregate.mockResolvedValue({ _sum: { qty: 2 } }) // ya hay 2 reservados por grants pendientes
    await expect(crearGrant({ ...base, qty: 1 })).rejects.toMatchObject({ code: 'EVENT_FULL' })
  })
})

describe('linkDeGrant', () => {
  it('el mismo id+versión da el mismo link (permite reenviar)', () => {
    expect(linkDeGrant('g1', 1)).toBe(linkDeGrant('g1', 1))
  })
  it('subir la versión cambia el link', () => {
    expect(linkDeGrant('g1', 2)).not.toBe(linkDeGrant('g1', 1))
  })
})
