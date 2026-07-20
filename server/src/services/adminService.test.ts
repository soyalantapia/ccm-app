import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * updateGallery NO puede borrar filas Photo que sobreviven a la edición.
 *
 * PhotoFavorite y PhotoDownload cuelgan de Photo con onDelete: Cascade, así que el
 * viejo deleteMany({galleryId}) + createMany convertía "editar el título de una galería"
 * en "borrar los favoritos y las descargas de todas sus fotos". Las descargas son
 * justamente la métrica del reporte que se le vende al sponsor.
 */

const tx = {
  gallery: { update: vi.fn() },
  photo: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
}

const mockPrisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  gallery: { findUniqueOrThrow: vi.fn() },
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))
vi.mock('../lib/serialize.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toGallery: (g: unknown) => g,
}))

const { updateGallery } = await import('./adminService.js')

// La galería ya persistida: 3 fotos, cada una con favoritos/descargas colgando.
const PERSISTIDAS = [
  { id: 'ph-1', src: 'img/g01.jpg' },
  { id: 'ph-2', src: 'img/g02.jpg' },
  { id: 'ph-3', src: 'img/g03.jpg' },
]

beforeEach(() => {
  vi.clearAllMocks()
  tx.photo.findMany.mockResolvedValue(PERSISTIDAS)
  mockPrisma.gallery.findUniqueOrThrow.mockResolvedValue({ id: 'gal-1', photos: [] })
})

describe('updateGallery — preserva la identidad de las fotos que sobreviven', () => {
  it('editar solo el título NO borra ninguna foto (favoritos y descargas intactos)', async () => {
    // El form manda las mismas 3 fotos por src, pero con ids REGENERADOS (el caso real que rompía).
    await updateGallery('gal-1', {
      title: 'Título nuevo',
      photos: [
        { id: 'ph-regenerado-a', src: 'img/g01.jpg', alt: 'a' },
        { id: 'ph-regenerado-b', src: 'img/g02.jpg', alt: 'b' },
        { id: 'ph-regenerado-c', src: 'img/g03.jpg', alt: 'c' },
      ],
    } as never)

    expect(tx.photo.deleteMany).not.toHaveBeenCalled()
    expect(tx.photo.create).not.toHaveBeenCalled()
    // Las 3 se actualizan in-place, conservando su id ORIGINAL.
    expect(tx.photo.update).toHaveBeenCalledTimes(3)
    const idsTocados = tx.photo.update.mock.calls.map((c) => c[0].where.id).sort()
    expect(idsTocados).toEqual(['ph-1', 'ph-2', 'ph-3'])
  })

  it('sacar una foto borra SOLO esa (por id), no la colección entera', async () => {
    await updateGallery('gal-1', {
      photos: [
        { id: 'x', src: 'img/g01.jpg', alt: 'a' },
        { id: 'y', src: 'img/g03.jpg', alt: 'c' },
      ],
    } as never)

    expect(tx.photo.deleteMany).toHaveBeenCalledTimes(1)
    expect(tx.photo.deleteMany.mock.calls[0][0]).toEqual({ where: { id: { in: ['ph-2'] } } })
    expect(tx.photo.update).toHaveBeenCalledTimes(2) // ph-1 y ph-3 sobreviven
  })

  it('agregar una foto la crea sin tocar las existentes', async () => {
    await updateGallery('gal-1', {
      photos: [
        { id: 'x', src: 'img/g01.jpg', alt: 'a' },
        { id: 'x', src: 'img/g02.jpg', alt: 'b' },
        { id: 'x', src: 'img/g03.jpg', alt: 'c' },
        { id: 'ph-nueva', src: 'img/g99.jpg', alt: 'nueva' },
      ],
    } as never)

    expect(tx.photo.deleteMany).not.toHaveBeenCalled()
    expect(tx.photo.create).toHaveBeenCalledTimes(1)
    expect(tx.photo.create.mock.calls[0][0].data).toMatchObject({ id: 'ph-nueva', src: 'img/g99.jpg' })
    expect(tx.photo.update).toHaveBeenCalledTimes(3)
  })

  it('reordenar persiste el nuevo order sin borrar nada', async () => {
    await updateGallery('gal-1', {
      photos: [
        { id: 'x', src: 'img/g03.jpg', alt: 'c' },
        { id: 'x', src: 'img/g01.jpg', alt: 'a' },
        { id: 'x', src: 'img/g02.jpg', alt: 'b' },
      ],
    } as never)

    expect(tx.photo.deleteMany).not.toHaveBeenCalled()
    const orderPorId = Object.fromEntries(
      tx.photo.update.mock.calls.map((c) => [c[0].where.id, c[0].data.order]),
    )
    expect(orderPorId).toEqual({ 'ph-3': 0, 'ph-1': 1, 'ph-2': 2 })
  })

  it('un patch SIN photos no toca las fotos en absoluto', async () => {
    await updateGallery('gal-1', { title: 'Solo el título' } as never)
    expect(tx.photo.findMany).not.toHaveBeenCalled()
    expect(tx.photo.deleteMany).not.toHaveBeenCalled()
    expect(tx.photo.update).not.toHaveBeenCalled()
  })
})
