import { prisma } from '../lib/prisma.js'
import { toCatalogProfile, toGallery, toContentItem } from '../lib/serialize.js'
import { notFound } from '../lib/errors.js'
import type { CatalogProfile, Gallery, ContentItem } from '@domain/types'

/* ─── Catálogo de expositores ─── */
export async function getCatalog(): Promise<CatalogProfile[]> {
  const rows = await prisma.catalogProfile.findMany({
    orderBy: { name: 'asc' },
    include: { portfolio: { orderBy: { order: 'asc' } } },
  })
  return rows.map(toCatalogProfile)
}

export async function getCatalogProfile(slug: string): Promise<CatalogProfile> {
  const row = await prisma.catalogProfile.findUnique({
    where: { slug },
    include: { portfolio: { orderBy: { order: 'asc' } } },
  })
  if (!row) throw notFound('CATALOG_NOT_FOUND', 'Perfil no encontrado')
  return toCatalogProfile(row)
}

/* ─── Galerías de fotos ─── */
export async function getGalleries(): Promise<Gallery[]> {
  const rows = await prisma.gallery.findMany({
    orderBy: { createdAt: 'asc' },
    include: { photos: { orderBy: { order: 'asc' } } },
  })
  return rows.map(toGallery)
}

export async function getGallery(slug: string): Promise<Gallery> {
  const row = await prisma.gallery.findUnique({
    where: { slug },
    include: { photos: { orderBy: { order: 'asc' } } },
  })
  if (!row) throw notFound('GALLERY_NOT_FOUND', 'Galería no encontrada')
  return toGallery(row)
}

/* ─── Contenido (videos) ─── */
export async function getContents(): Promise<ContentItem[]> {
  const rows = await prisma.contentItem.findMany({ orderBy: { publishedAt: 'desc' } })
  return rows.map(toContentItem)
}
