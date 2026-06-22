import { prisma } from '../lib/prisma.js'
import { toEventItem, toEventBlock, toContentItem } from '../lib/serialize.js'
import { conflict } from '../lib/errors.js'
import type { EventItem, EventBlock, ContentItem } from '@domain/types'

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
