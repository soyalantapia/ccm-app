import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Contrato de NO-DESTRUCCIÓN al guardar (regresión de un bug medido en prod).
 *
 * `Photo` es la única entidad que el admin recrea cuyo id está referenciado por otras tablas:
 * `PhotoFavorite.photoId` y `PhotoDownload.photoId`, ambas con `onDelete: Cascade`. El cascade
 * dispara en el DELETE, así que el viejo `deleteMany` + `createMany` borraba los favoritos y las
 * descargas del asistente cada vez que alguien editaba una galería — aunque solo cambiara el título.
 *
 * Si estos tests se ponen en rojo, NO los ajustes: el fix se rompió.
 */

const mockTx = {
  gallery: { update: vi.fn() },
  photo: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  catalogProfile: { update: vi.fn() },
  portfolioPiece: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
}

const mockPrisma = {
  $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  gallery: { findUniqueOrThrow: vi.fn() },
  catalogProfile: { findUniqueOrThrow: vi.fn() },
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { updateGallery, updateCatalogProfile } = await import('./adminService.js')

const EXISTENTES = [
  { id: 'ph-01', src: 'img/gallery/g01.jpg' },
  { id: 'ph-02', src: 'img/gallery/g02.jpg' },
  { id: 'ph-03', src: 'img/gallery/g03.jpg' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockTx.photo.findMany.mockResolvedValue(EXISTENTES)
  mockTx.photo.findUnique.mockResolvedValue(null)
  mockPrisma.gallery.findUniqueOrThrow.mockResolvedValue({
    id: 'gal-1', slug: 's', title: 't', eventLabel: 'e', date: 'd', cover: 'c', sponsorId: 'sp', photos: [],
  })
  mockPrisma.catalogProfile.findUniqueOrThrow.mockResolvedValue({
    id: 'cat-1', slug: 's', name: 'n', role: 'r', kind: 'participante', platform: 'Moda', city: 'c',
    bio: 'b', photo: 'p', verified: false, participatesIn: [], portfolio: [],
  })
})

/** ids que quedaron excluidos del deleteMany final = los que sobrevivieron. */
function sobrevivientes(): string[] {
  const call = mockTx.photo.deleteMany.mock.calls.at(-1)?.[0]
  return call?.where?.id?.notIn ?? []
}

describe('updateGallery — no destruye lo que sobrevive', () => {
  it('con el payload del front VIEJO (un id nuevo por foto) conserva las filas existentes', async () => {
    await updateGallery('gal-1', {
      title: 'nuevo título',
      photos: EXISTENTES.map((p, i) => ({ id: `ph_regen_${i}`, src: p.src, alt: '' })),
    } as never)

    // Se resolvieron por src contra las filas existentes: update, nunca create.
    expect(mockTx.photo.create).not.toHaveBeenCalled()
    expect(mockTx.photo.update).toHaveBeenCalledTimes(3)
    expect(sobrevivientes().sort()).toEqual(['ph-01', 'ph-02', 'ph-03'])
  })

  it('no pisa el alt curado cuando el payload no lo trae', async () => {
    await updateGallery('gal-1', {
      photos: [{ id: 'ph-01', src: 'img/gallery/g01.jpg' }],
    } as never)

    const data = mockTx.photo.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('alt')
    expect(data).toMatchObject({ src: 'img/gallery/g01.jpg', order: 0 })
  })

  it('sí escribe el alt cuando el payload lo trae', async () => {
    await updateGallery('gal-1', {
      photos: [{ id: 'ph-01', src: 'img/gallery/g01.jpg', alt: 'Epígrafe editado' }],
    } as never)
    expect(mockTx.photo.update.mock.calls[0][0].data).toMatchObject({ alt: 'Epígrafe editado' })
  })

  it('agrega las nuevas sin tocar las viejas', async () => {
    await updateGallery('gal-1', {
      photos: [
        ...EXISTENTES.map((p) => ({ id: p.id, src: p.src, alt: 'a' })),
        { src: '/uploads/nueva.jpg', alt: 'Recién subida' },
      ],
    } as never)

    expect(mockTx.photo.update).toHaveBeenCalledTimes(3)
    expect(mockTx.photo.create).toHaveBeenCalledTimes(1)
    // Photo.id no tiene @default: el id lo tenemos que poner siempre nosotros.
    expect(mockTx.photo.create.mock.calls[0][0].data.id).toMatch(/^ph_/)
    expect(sobrevivientes()).toHaveLength(4)
  })

  it('quitar una foto la excluye del notIn (se borra solo esa)', async () => {
    await updateGallery('gal-1', {
      photos: [{ id: 'ph-01', src: 'img/gallery/g01.jpg', alt: 'a' }],
    } as never)
    expect(sobrevivientes()).toEqual(['ph-01'])
  })

  it('un id que pertenece a otra galería se re-mintea en vez de robársela', async () => {
    mockTx.photo.findUnique.mockResolvedValue({ id: 'ph-de-otra' }) // ya existe en la DB
    await updateGallery('gal-1', {
      photos: [{ id: 'ph-de-otra', src: '/uploads/x.jpg', alt: 'a' }],
    } as never)
    const creado = mockTx.photo.create.mock.calls[0][0].data.id
    expect(creado).not.toBe('ph-de-otra')
    expect(creado).toMatch(/^ph_/)
  })
})

describe('updateCatalogProfile — no borra lo que el form no manda', () => {
  beforeEach(() => {
    mockTx.portfolioPiece.findMany.mockResolvedValue([
      { id: 'cat-1-1', image: 'img/a.jpg', title: 'Obra 1', caption: 'Epígrafe escrito a mano', price: 90000 },
    ])
  })

  it('hereda el caption y el precio existentes si el payload no los trae', async () => {
    await updateCatalogProfile('cat-1', {
      portfolio: [{ id: 'cat-1-1', image: 'img/a.jpg', title: 'Obra 1' }],
    } as never)

    expect(mockTx.portfolioPiece.createMany.mock.calls[0][0].data[0]).toMatchObject({
      caption: 'Epígrafe escrito a mano',
      price: 90000,
    })
  })

  it('permite borrar el caption explícitamente mandando null', async () => {
    await updateCatalogProfile('cat-1', {
      portfolio: [{ id: 'cat-1-1', image: 'img/a.jpg', title: 'Obra 1', caption: null }],
    } as never)
    expect(mockTx.portfolioPiece.createMany.mock.calls[0][0].data[0].caption).toBeNull()
  })

  it('hereda por imagen cuando la obra no trae id (obra ya existente sin id en el form)', async () => {
    await updateCatalogProfile('cat-1', {
      portfolio: [{ image: 'img/a.jpg', title: 'Obra 1' }],
    } as never)
    expect(mockTx.portfolioPiece.createMany.mock.calls[0][0].data[0].caption).toBe('Epígrafe escrito a mano')
  })
})
