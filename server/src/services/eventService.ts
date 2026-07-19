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
  // Padre inexistente → 404 (antes devolvía 200 [], rompiendo la convención notFound del backend).
  const parent = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!parent) throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')
  // orderBy determinístico: sin él Postgres devuelve heap-order (agenda barajada en prod; en la
  // demo salía cronológica porque el seed preserva el array). day='19/09'/start='17:00' son
  // strings zero-padded del mismo mes → el sort lexical coincide con el cronológico del evento.
  const rows = await prisma.eventBlock.findMany({
    where: { eventId },
    orderBy: [{ day: 'asc' }, { start: 'asc' }],
  })
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
