import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * El Dashboard del organizador se usa para decidir (a quién responder, qué plata
 * reclamar, qué bloque empujar) y para venderle a un sponsor. Un número mal acá no
 * es un detalle estético.
 *
 * Cada test blinda una condición que el banco de pruebas de scripts/audit-metricas
 * demostró que hoy está rota: el Dashboard cuenta EVENTOS de analytics en el
 * navegador sobre una lista truncada a 500, en vez de contar hechos en la base.
 */

const mockPrisma = {
  device: { count: vi.fn() },
  registration: { count: vi.fn(), groupBy: vi.fn() },
  membership: { count: vi.fn(), aggregate: vi.fn() },
  ticketOrder: { count: vi.fn(), groupBy: vi.fn() },
  application: { count: vi.fn(), findMany: vi.fn() },
  photoDownload: { count: vi.fn(), groupBy: vi.fn() },
  eventBlock: { findMany: vi.fn() },
  convocatoria: { findMany: vi.fn() },
  sponsor: { findMany: vi.fn() },
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { getAdminStats } = await import('./statsService.js')

const DIA = 86_400_000
const hace = (d: number) => new Date(Date.now() - d * DIA)
const dentroDe = (d: number) => new Date(Date.now() + d * DIA)

/** Lo justo del arg de `convocatoria.findMany` que el mock necesita mirar para contar. */
type ConvocatoriaFindManyArgs = {
  include?: { _count?: { select?: { applications?: true | { where?: { fromSeed?: boolean } } } } }
}

/** Mismos números que siembra scripts/audit-metricas/audit-seed.mjs. */
beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.device.count.mockResolvedValue(10)
  mockPrisma.registration.count.mockResolvedValue(6)
  mockPrisma.membership.count.mockResolvedValue(3)
  mockPrisma.membership.aggregate.mockResolvedValue({ _sum: { paid: 20_000 } })
  mockPrisma.ticketOrder.count.mockResolvedValue(2)
  mockPrisma.application.count.mockResolvedValue(4)
  mockPrisma.photoDownload.count.mockResolvedValue(7)

  mockPrisma.ticketOrder.groupBy.mockResolvedValue([
    { status: 'iniciada', _sum: { total: 30_000 }, _count: { _all: 3 } },
    { status: 'redirigida_mp', _sum: { total: 15_000 }, _count: { _all: 1 } },
  ])
  mockPrisma.application.findMany.mockResolvedValue([
    { id: 'app-real-1', ts: hace(12), convocatoria: { title: 'Cierra en 3 días' } },
    { id: 'app-real-2', ts: hace(5), convocatoria: { title: 'Cierra en 3 días' } },
  ])
  // El include de la query trae { title, startDate }: startDate se usa para desempatar
  // por urgencia cuando dos bloques tienen la misma ocupación.
  const ev = { title: 'Evento', startDate: dentroDe(10) }
  mockPrisma.eventBlock.findMany.mockResolvedValue([
    { id: 'blk-lleno', title: 'Bloque lleno', capacity: 10, seedTaken: 8, day: '01/09', event: ev },
    { id: 'blk-flojo', title: 'Bloque flojo', capacity: 100, seedTaken: 0, day: '01/09', event: ev },
    // capacity 0: la query ya lo filtra, pero el mock lo devuelve igual para probar
    // que el guard del servicio lo excluye y no produce NaN.
    { id: 'blk-cero', title: 'Bloque sin cupo', capacity: 0, seedTaken: 0, day: '01/09', event: ev },
  ])
  mockPrisma.registration.groupBy.mockResolvedValue([{ blockId: 'blk-flojo', _count: { _all: 3 } }])
  // El mock CUENTA como contaría la base: 3 si la query pide el filtro, 27 si pide todas (3
  // reales + 24 del seed, los números que hay hoy en producción). Con un `_count` fijo, el test
  // de "informa cuántas postulaciones juntó cada una" daba 3 con filtro y sin filtro — o sea,
  // pasaba igual si alguien volvía a `applications: true`, que es justo la reversión que duele.
  mockPrisma.convocatoria.findMany.mockImplementation(async (args: ConvocatoriaFindManyArgs) => {
    const pedido = args?.include?._count?.select?.applications
    const soloReales = pedido !== true && pedido?.where?.fromSeed === false
    return [
      {
        id: 'conv-cerca',
        slug: 'cierra-pronto',
        title: 'Cierra en 3 días',
        deadline: dentroDe(3),
        _count: { applications: soloReales ? 3 : 27 },
      },
    ]
  })
  mockPrisma.photoDownload.groupBy.mockResolvedValue([{ sponsorId: 'sp-1', _count: { _all: 7 } }])
  mockPrisma.sponsor.findMany.mockResolvedValue([{ id: 'sp-1', name: 'Sponsor Uno', level: 'Oro' }])
})

describe('KPIs: cuentan hechos de la base, no eventos de telemetría', () => {
  it('devuelve los conteos reales de cada tabla', async () => {
    const s = await getAdminStats()
    expect(s.kpis).toMatchObject({
      registrados: 10,
      inscripciones: 6,
      socios: 3,
      ingresoSocios: 20_000,
      ordenesConfirmadas: 2,
      postulaciones: 4,
      descargas: 7,
    })
  })

  it('cuenta SOLO inscripciones confirmadas (una cancelada no suma)', async () => {
    await getAdminStats()
    const args = mockPrisma.registration.count.mock.calls[0][0]
    expect(args.where).toMatchObject({ status: 'confirmada' })
  })

  it('excluye del KPI las postulaciones fromSeed (son demo, no hechos)', async () => {
    await getAdminStats()
    const args = mockPrisma.application.count.mock.calls[0][0]
    expect(args.where).toMatchObject({ fromSeed: false })
  })

  it('el ingreso suma solo membresías de socios, no las free', async () => {
    await getAdminStats()
    const args = mockPrisma.membership.aggregate.mock.calls[0][0]
    expect(args.where).toMatchObject({ tier: 'socio' })
    expect(args._sum).toMatchObject({ paid: true })
  })

  it('ordenesConfirmadas cuenta solo lo cobrado, no todas las órdenes', async () => {
    await getAdminStats()
    const args = mockPrisma.ticketOrder.count.mock.calls[0][0]
    expect(args.where).toMatchObject({ status: 'confirmada' })
  })
})

describe('Plata trabada: lo que se quiso comprar y no se cobró', () => {
  it('suma iniciada + redirigida_mp y nada más', async () => {
    const s = await getAdminStats()
    expect(s.plataTrabada.montoTotal).toBe(45_000)
    expect(s.plataTrabada.cantidad).toBe(4)
  })

  it('NO incluye canceladas ni confirmadas en la consulta', async () => {
    await getAdminStats()
    const args = mockPrisma.ticketOrder.groupBy.mock.calls[0][0]
    expect(args.where.status.in).toEqual(['iniciada', 'redirigida_mp'])
    expect(args.where.status.in).not.toContain('cancelada')
    expect(args.where.status.in).not.toContain('confirmada')
  })
})

describe('Postulaciones sin responder', () => {
  it('pide solo preinscriptas reales, más viejas primero', async () => {
    await getAdminStats()
    const args = mockPrisma.application.findMany.mock.calls[0][0]
    expect(args.where).toMatchObject({ status: 'preinscripta', fromSeed: false })
    expect(args.orderBy).toMatchObject({ ts: 'asc' })
  })

  it('calcula los días de espera en el servidor (no depende del reloj del navegador)', async () => {
    const s = await getAdminStats()
    expect(s.postulacionesPendientes.items[0].diasEsperando).toBe(12)
    expect(s.postulacionesPendientes.masAntiguaDias).toBe(12)
  })
})

describe('Bloques flojos', () => {
  it('excluye los de capacity 0 y nunca produce NaN', async () => {
    const s = await getAdminStats()
    expect(s.bloquesFlojos.items.some((b) => b.id === 'blk-cero')).toBe(false)
    for (const b of s.bloquesFlojos.items) expect(Number.isFinite(b.ocupacion)).toBe(true)
  })

  it('ordena por ocupación ascendente: el más vacío primero', async () => {
    const s = await getAdminStats()
    expect(s.bloquesFlojos.items[0].id).toBe('blk-flojo') // 3% vs 80%
  })

  it('cuenta el cupo como seedTaken + confirmadas, clampeado a capacity', async () => {
    const s = await getAdminStats()
    const flojo = s.bloquesFlojos.items.find((b) => b.id === 'blk-flojo')!
    expect(flojo.taken).toBe(3) // 0 seedTaken + 3 confirmadas
    expect(flojo.faltan).toBe(97)
    const lleno = s.bloquesFlojos.items.find((b) => b.id === 'blk-lleno')!
    expect(lleno.taken).toBe(8) // 8 seedTaken + 0 confirmadas
  })
})

describe('Convocatorias por cerrar', () => {
  it('mira solo la ventana de 14 días hacia adelante', async () => {
    await getAdminStats()
    const args = mockPrisma.convocatoria.findMany.mock.calls[0][0]
    const { gte, lte } = args.where.deadline
    const ventanaDias = Math.round((lte.getTime() - gte.getTime()) / DIA)
    expect(ventanaDias).toBe(14)
    expect(gte.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('informa cuántas postulaciones juntó cada una, contando SOLO las reales', async () => {
    const s = await getAdminStats()
    // 3, no 27: si el filtro se cayera, el mock devolvería las 24 del seed también y este
    // bloque volvería a decir "cierra en 3 días · 27 postulaciones" al lado de un KPI que
    // dice 3.
    expect(s.convocatoriasPorCerrar.items[0]).toMatchObject({ slug: 'cierra-pronto', postulaciones: 3 })
  })

  it('pide el conteo por convocatoria con el MISMO filtro que el KPI', async () => {
    await getAdminStats()
    const args = mockPrisma.convocatoria.findMany.mock.calls[0][0]
    // `applications: true` también compila y también devuelve un número; lo único que separa
    // "postulaciones reales" de "postulaciones + demo" es este where.
    expect(args.include._count.select.applications).toEqual({ where: { fromSeed: false } })
  })
})

describe('Contrato', () => {
  it('sella el instante del cálculo para el "actualizado hace X"', async () => {
    const s = await getAdminStats()
    expect(() => new Date(s.generatedAt).toISOString()).not.toThrow()
    expect(Date.now() - new Date(s.generatedAt).getTime()).toBeLessThan(5_000)
  })

  it('resuelve el nombre del sponsor de las descargas', async () => {
    const s = await getAdminStats()
    expect(s.sponsors.items[0]).toMatchObject({ sponsorId: 'sp-1', nombre: 'Sponsor Uno', descargas: 7 })
  })
})
