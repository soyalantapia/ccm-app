import { prisma } from '../lib/prisma.js'
import { toEventItem, toEventBlock } from '../lib/serialize.js'
import { notFound } from '../lib/errors.js'
import type { EventItem, EventBlock } from '@domain/types'

export async function getEvents(): Promise<EventItem[]> {
  const rows = await prisma.event.findMany({
    orderBy: { startDate: 'asc' },
    include: { sponsors: { select: { sponsorId: true } } },
  })
  return rows.map(toEventItem)
}

export async function getEvent(slug: string): Promise<EventItem> {
  const ev = await prisma.event.findUnique({
    where: { slug },
    include: { sponsors: { select: { sponsorId: true } } },
  })
  if (!ev) throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')
  return toEventItem(ev)
}

export async function getBlocks(eventId: string): Promise<EventBlock[]> {
  const rows = await prisma.eventBlock.findMany({ where: { eventId } })
  return rows.map(toEventBlock)
}

export interface Availability {
  capacity: number
  taken: number
  left: number
  full: boolean
}

/** Cupo real = seedTaken (baseline) + inscripciones confirmadas. Lo calcula el SERVER. */
export async function blockAvailability(blockId: string): Promise<Availability> {
  const block = await prisma.eventBlock.findUnique({ where: { id: blockId } })
  if (!block) throw notFound('BLOCK_NOT_FOUND', 'Bloque no encontrado')
  const confirmadas = await prisma.registration.count({ where: { blockId, status: 'confirmada' } })
  const taken = Math.min(block.capacity, block.seedTaken + confirmadas)
  const left = Math.max(0, block.capacity - taken)
  return { capacity: block.capacity, taken, left, full: left === 0 }
}
