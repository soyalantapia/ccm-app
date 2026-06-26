import { prisma } from '../lib/prisma.js'
import { toEventItem, toEventBlock, toContentItem, toSponsor, toGallery, toCatalogProfile } from '../lib/serialize.js'
import { conflict } from '../lib/errors.js'
import type { EventItem, EventBlock, ContentItem, Sponsor, Gallery, CatalogProfile, PlanId } from '@domain/types'

/* ─── Eventos ─── */
async function readEvent(id: string): Promise<EventItem> {
  const ev = await prisma.event.findUniqueOrThrow({
    where: { id },
    include: { sponsors: { select: { sponsorId: true } } },
  })
  return toEventItem(ev)
}

export async function createEvent(e: EventItem): Promise<EventItem> {
  await prisma.event.create({
    data: {
      id: e.id, slug: e.slug, type: e.type, title: e.title, subtitle: e.subtitle ?? null,
      dateLabel: e.dateLabel, startDate: new Date(e.startDate), timeLabel: e.timeLabel ?? null,
      venue: e.venue, address: e.address, mapsUrl: e.mapsUrl, description: e.description,
      cover: e.cover, price: e.price ?? null, past: e.past ?? false, socioOnly: e.socioOnly ?? false,
    },
  })
  if (e.sponsorIds?.length) {
    await prisma.eventSponsor.createMany({
      data: e.sponsorIds.map((sponsorId) => ({ eventId: e.id, sponsorId })),
      skipDuplicates: true,
    })
  }
  return readEvent(e.id)
}

export async function updateEvent(id: string, patch: Partial<EventItem>): Promise<EventItem> {
  const data: Record<string, unknown> = {}
  for (const k of ['type', 'title', 'subtitle', 'dateLabel', 'timeLabel', 'venue', 'address', 'mapsUrl', 'description', 'cover', 'price', 'past', 'socioOnly', 'slug'] as const) {
    if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  }
  if (patch.startDate) data.startDate = new Date(patch.startDate)
  await prisma.event.update({ where: { id }, data })
  if (patch.sponsorIds) {
    await prisma.eventSponsor.deleteMany({ where: { eventId: id } })
    if (patch.sponsorIds.length) {
      await prisma.eventSponsor.createMany({
        data: patch.sponsorIds.map((sponsorId) => ({ eventId: id, sponsorId })),
        skipDuplicates: true,
      })
    }
  }
  return readEvent(id)
}

export async function deleteEvent(id: string): Promise<void> {
  const regs = await prisma.registration.count({ where: { eventId: id, status: 'confirmada' } })
  if (regs > 0) throw conflict('HAS_REGISTRATIONS', `No se puede borrar: tiene ${regs} inscripciones confirmadas`)
  await prisma.event.delete({ where: { id } }) // cascade a bloques sin inscripciones
}

/* ─── Bloques ─── */
export async function createBlock(b: EventBlock): Promise<EventBlock> {
  const row = await prisma.eventBlock.create({
    data: {
      id: b.id, eventId: b.eventId, title: b.title, kind: b.kind, day: b.day, start: b.start,
      end: b.end, room: b.room, capacity: b.capacity, seedTaken: b.seedTaken ?? 0,
      speakers: b.speakers ?? [], description: b.description ?? null,
    },
  })
  return toEventBlock(row)
}

export async function updateBlock(id: string, patch: Partial<EventBlock>): Promise<EventBlock> {
  const data: Record<string, unknown> = {}
  for (const k of ['title', 'kind', 'day', 'start', 'end', 'room', 'capacity', 'seedTaken', 'speakers', 'description'] as const) {
    if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  }
  const row = await prisma.eventBlock.update({ where: { id }, data })
  return toEventBlock(row)
}

export async function deleteBlock(id: string): Promise<void> {
  const regs = await prisma.registration.count({ where: { blockId: id, status: 'confirmada' } })
  if (regs > 0) throw conflict('HAS_REGISTRATIONS', `No se puede borrar: tiene ${regs} inscripciones confirmadas`)
  await prisma.eventBlock.delete({ where: { id } })
}

/* ─── Contenido ─── */
export async function createContent(c: ContentItem): Promise<ContentItem> {
  const row = await prisma.contentItem.create({
    data: {
      id: c.id, type: c.type, title: c.title, description: c.description, youtubeId: c.youtubeId,
      duration: c.duration ?? null, platform: c.platform ?? null, sponsorId: c.sponsorId ?? null,
      publishedAt: new Date(c.publishedAt), socioOnly: c.socioOnly ?? false,
    },
  })
  return toContentItem(row)
}

export async function updateContent(id: string, patch: Partial<ContentItem>): Promise<ContentItem> {
  const data: Record<string, unknown> = {}
  for (const k of ['title', 'description', 'youtubeId', 'duration', 'platform', 'sponsorId', 'socioOnly'] as const) {
    if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  }
  if (patch.publishedAt) data.publishedAt = new Date(patch.publishedAt)
  const row = await prisma.contentItem.update({ where: { id }, data })
  return toContentItem(row)
}

export async function deleteContent(id: string): Promise<void> {
  await prisma.contentItem.delete({ where: { id } })
}

/* ─── Sponsors (+ creatives) ─── */
async function readSponsor(id: string): Promise<Sponsor> {
  const s = await prisma.sponsor.findUniqueOrThrow({ where: { id }, include: { creatives: { orderBy: { order: 'asc' } } } })
  return toSponsor(s)
}
function creativeRows(sponsorId: string, creatives: Sponsor['creatives']) {
  return creatives.map((c, i) => ({ sponsorId, slot: c.slot, headline: c.headline, sub: c.sub ?? null, cta: c.cta ?? null, order: i }))
}
export async function createSponsor(s: Sponsor): Promise<Sponsor> {
  await prisma.sponsor.create({ data: { id: s.id, name: s.name, industry: s.industry, level: s.level, exclusive: s.exclusive, tagline: s.tagline } })
  if (s.creatives?.length) await prisma.sponsorCreative.createMany({ data: creativeRows(s.id, s.creatives) })
  return readSponsor(s.id)
}
export async function updateSponsor(id: string, patch: Partial<Sponsor>): Promise<Sponsor> {
  const data: Record<string, unknown> = {}
  for (const k of ['name', 'industry', 'level', 'exclusive', 'tagline'] as const) if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  await prisma.sponsor.update({ where: { id }, data })
  if (patch.creatives) {
    await prisma.sponsorCreative.deleteMany({ where: { sponsorId: id } })
    if (patch.creatives.length) await prisma.sponsorCreative.createMany({ data: creativeRows(id, patch.creatives) })
  }
  return readSponsor(id)
}
export async function deleteSponsor(id: string): Promise<void> {
  // Borrado seguro: Gallery.sponsorId es onDelete: Restrict. Pre-chequeamos para dar
  // un 409 claro (el RESTRICT del FK surfacea como error genérico, no mapeable).
  const galleries = await prisma.gallery.count({ where: { sponsorId: id } })
  if (galleries > 0) throw conflict('HAS_GALLERIES', `No se puede borrar: tiene ${galleries} galería(s) asociada(s)`)
  await prisma.sponsor.delete({ where: { id } })
}

/* ─── Galerías (+ fotos) ─── */
async function readGallery(id: string): Promise<Gallery> {
  const g = await prisma.gallery.findUniqueOrThrow({ where: { id }, include: { photos: { orderBy: { order: 'asc' } } } })
  return toGallery(g)
}
export async function createGallery(g: Gallery): Promise<Gallery> {
  await prisma.gallery.create({ data: { id: g.id, slug: g.slug, title: g.title, eventLabel: g.eventLabel, date: g.date, cover: g.cover, sponsorId: g.sponsorId } })
  if (g.photos?.length) await prisma.photo.createMany({ data: g.photos.map((p, i) => ({ id: p.id, galleryId: g.id, src: p.src, alt: p.alt, order: i })) })
  return readGallery(g.id)
}
export async function updateGallery(id: string, patch: Partial<Gallery>): Promise<Gallery> {
  const data: Record<string, unknown> = {}
  for (const k of ['slug', 'title', 'eventLabel', 'date', 'cover', 'sponsorId'] as const) if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  await prisma.gallery.update({ where: { id }, data })
  if (patch.photos) {
    await prisma.photo.deleteMany({ where: { galleryId: id } })
    if (patch.photos.length) await prisma.photo.createMany({ data: patch.photos.map((p, i) => ({ id: p.id, galleryId: id, src: p.src, alt: p.alt, order: i })) })
  }
  return readGallery(id)
}
export async function deleteGallery(id: string): Promise<void> {
  await prisma.gallery.delete({ where: { id } })
}

/* ─── Catálogo (+ portfolio) ─── */
async function readCatalog(id: string): Promise<CatalogProfile> {
  const c = await prisma.catalogProfile.findUniqueOrThrow({ where: { id }, include: { portfolio: { orderBy: { order: 'asc' } } } })
  return toCatalogProfile(c)
}
export async function createCatalogProfile(c: CatalogProfile): Promise<CatalogProfile> {
  await prisma.catalogProfile.create({ data: { id: c.id, slug: c.slug, name: c.name, role: c.role, platform: c.platform, city: c.city, bio: c.bio, photo: c.photo, instagram: c.instagram ?? null, whatsapp: c.whatsapp ?? null, verified: c.verified, participatesIn: c.participatesIn } })
  if (c.portfolio?.length) await prisma.portfolioPiece.createMany({ data: c.portfolio.map((p, i) => ({ id: p.id, profileId: c.id, image: p.image, title: p.title, caption: p.caption ?? null, price: p.price ?? null, order: i })) })
  return readCatalog(c.id)
}
export async function updateCatalogProfile(id: string, patch: Partial<CatalogProfile>): Promise<CatalogProfile> {
  const data: Record<string, unknown> = {}
  for (const k of ['slug', 'name', 'role', 'platform', 'city', 'bio', 'photo', 'instagram', 'whatsapp', 'verified', 'participatesIn'] as const) if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  await prisma.catalogProfile.update({ where: { id }, data })
  if (patch.portfolio) {
    await prisma.portfolioPiece.deleteMany({ where: { profileId: id } })
    if (patch.portfolio.length) await prisma.portfolioPiece.createMany({ data: patch.portfolio.map((p, i) => ({ id: p.id, profileId: id, image: p.image, title: p.title, caption: p.caption ?? null, price: p.price ?? null, order: i })) })
  }
  return readCatalog(id)
}
export async function deleteCatalogProfile(id: string): Promise<void> {
  await prisma.catalogProfile.delete({ where: { id } })
}

/* ─── Planes (solo precio/mpLink) ─── */
export async function updatePlan(id: PlanId, patch: { price?: number | null; mpLink?: string }): Promise<void> {
  const data: Record<string, unknown> = {}
  if ('price' in patch) data.price = patch.price
  if ('mpLink' in patch) data.mpLink = patch.mpLink
  await prisma.ticketPlan.update({ where: { id }, data })
}
