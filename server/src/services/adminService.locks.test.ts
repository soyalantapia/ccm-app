import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Dos organizadores editando la misma galería a la vez se deadlockeaban entre sí.
 *
 * `updateGallery` corre dentro de una transacción y actualiza las filas Photo UNA POR UNA,
 * recorriendo `patch.photos` — es decir, en el orden que manda el cliente. Si A y B envían
 * las mismas fotos en distinto orden relativo, cada transacción toma los locks en orden
 * distinto y Postgres detecta un ciclo: error 40P01 "deadlock detected".
 *
 * Reproducido contra la base real: dos PATCH simultáneos sobre la galería «Camino a CCM ·
 * Marzo» (28 fotos), uno sacando la foto 1 y el otro la foto 2 → uno respondió HTTP 500.
 *
 * Lo que lo RESUELVE es el lock explícito sobre la galería (SELECT ... FOR UPDATE), que
 * serializa las ediciones de una misma galería. El orden fijo que verifica este archivo NO
 * alcanzaba solo: se probó, y seguían apareciendo 40P01 en el log, porque el deleteMany final
 * pide lock sobre filas distintas en cada transacción. Queda como defensa en profundidad —
 * si alguien saca el FOR UPDATE, al menos los UPDATE no se pisan entre sí.
 */

const tx = {
  $queryRaw: vi.fn(),
  gallery: { update: vi.fn() },
  photo: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
}
const mockPrisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  gallery: { findUniqueOrThrow: vi.fn() },
}
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { updateGallery } = await import('./adminService.js')

const EXISTENTES = [
  { id: 'ph-01', src: 'img/g01.jpg' },
  { id: 'ph-02', src: 'img/g02.jpg' },
  { id: 'ph-03', src: 'img/g03.jpg' },
  { id: 'ph-04', src: 'img/g04.jpg' },
]

beforeEach(() => {
  vi.clearAllMocks()
  tx.photo.findMany.mockResolvedValue(EXISTENTES)
  tx.photo.findUnique.mockResolvedValue(null)
  mockPrisma.gallery.findUniqueOrThrow.mockResolvedValue({ id: 'gal-1', photos: [] })
})

/** El orden en que la transacción pidió lock sobre cada fila Photo. */
function ordenDeLocks(): string[] {
  return tx.photo.updateMany.mock.calls.map((c) => c[0].where.id)
}

const comoFotos = (ids: string[]) =>
  ids.map((id) => ({ id, src: EXISTENTES.find((e) => e.id === id)!.src, alt: 'a' }))

describe('updateGallery — los locks se toman en orden determinístico', () => {
  it('el orden de los UPDATE no depende del orden del payload', async () => {
    await updateGallery('gal-1', { photos: comoFotos(['ph-01', 'ph-02', 'ph-03', 'ph-04']) } as never)
    const ordenA = ordenDeLocks()

    vi.clearAllMocks()
    tx.photo.findMany.mockResolvedValue(EXISTENTES)
    tx.photo.findUnique.mockResolvedValue(null)
    mockPrisma.gallery.findUniqueOrThrow.mockResolvedValue({ id: 'gal-1', photos: [] })

    // Mismas fotos, orden invertido: es lo que hace otro organizador reordenando la galería.
    await updateGallery('gal-1', { photos: comoFotos(['ph-04', 'ph-03', 'ph-02', 'ph-01']) } as never)
    const ordenB = ordenDeLocks()

    expect(ordenA, 'sin un orden fijo, dos ediciones concurrentes se deadlockean').toEqual(ordenB)
  })

  it('ese orden es el de los ids, que es total y estable', async () => {
    await updateGallery('gal-1', { photos: comoFotos(['ph-03', 'ph-01', 'ph-04', 'ph-02']) } as never)
    const orden = ordenDeLocks()
    expect(orden).toEqual([...orden].sort())
  })

  it('reordenar sigue persistiendo el order correcto de cada foto', async () => {
    // El orden de los LOCKS es por id, pero el campo `order` tiene que reflejar la posición
    // que eligió el organizador — si no, arreglaríamos el deadlock rompiendo la función.
    await updateGallery('gal-1', { photos: comoFotos(['ph-03', 'ph-01', 'ph-04', 'ph-02']) } as never)
    const orderPorId = Object.fromEntries(
      tx.photo.updateMany.mock.calls.map((c) => [c[0].where.id, c[0].data.order]),
    )
    expect(orderPorId).toEqual({ 'ph-03': 0, 'ph-01': 1, 'ph-04': 2, 'ph-02': 3 })
  })

  it('sigue sin borrar las fotos que sobreviven (no rompe el fix anterior)', async () => {
    await updateGallery('gal-1', { photos: comoFotos(['ph-01', 'ph-02', 'ph-03', 'ph-04']) } as never)
    expect(tx.photo.deleteMany).toHaveBeenCalledTimes(1)
    expect(tx.photo.deleteMany.mock.calls[0][0].where.id.notIn.sort()).toEqual(['ph-01', 'ph-02', 'ph-03', 'ph-04'])
  })
})
