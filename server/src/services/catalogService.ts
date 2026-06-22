import { prisma } from '../lib/prisma.js'
import { toCatalogProfile, toGallery, toContentItem, toSponsor, toConvocatoria } from '../lib/serialize.js'
import { notFound } from '../lib/errors.js'
import type { CatalogProfile, Gallery, ContentItem, Sponsor, TicketPlan, Convocatoria } from '@domain/types'

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

/* ─── Sponsors ─── */
export async function getSponsors(): Promise<Sponsor[]> {
  const rows = await prisma.sponsor.findMany({
    orderBy: { createdAt: 'asc' },
    include: { creatives: { orderBy: { order: 'asc' } } },
  })
  return rows.map(toSponsor)
}

/* ─── Planes de entrada ─── */
export async function getPlans(): Promise<TicketPlan[]> {
  const rows = await prisma.ticketPlan.findMany()
  return rows.map((p) => ({
    id: p.id as TicketPlan['id'],
    name: p.name,
    tagline: p.tagline,
    price: p.price,
    serviceCharge: p.serviceCharge,
    mpLink: p.mpLink,
    perks: p.perks,
    featured: p.featured,
    day: p.day,
    kind: p.kind,
    preventa: p.preventa,
  }))
}

/* ─── Convocatoria ─── */
export async function getConvocatoria(slug: string): Promise<Convocatoria> {
  const cv = await prisma.convocatoria.findUnique({
    where: { slug },
    include: { fields: { orderBy: { order: 'asc' } } },
  })
  if (!cv) throw notFound('CONVOCATORIA_NOT_FOUND', 'Convocatoria no encontrada')
  return toConvocatoria(cv)
}
