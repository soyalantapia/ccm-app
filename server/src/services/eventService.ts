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

/** Inscripciones GENERALES (sin bloque) confirmadas de un evento, server-wide (todos los devices).
 *  El admin lo necesita porque getRegistrations del front es device-scoped (solo las del admin ≈0). */
export async function generalRegistrationCount(eventId: string): Promise<number> {
  return prisma.registration.count({ where: { eventId, blockId: null, status: 'confirmada' } })
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

export type BlockAvailabilityWithId = Availability & { id: string }
export interface EventAvailabilitySummary {
  blocks: BlockAvailabilityWithId[]
  generals: number
}

/**
 * Cupo de TODOS los bloques de un evento + inscriptos generales en 3 queries paralelas
 * (vs N queries per-bloque de blockAvailability). Usado por AdminEventos/Dashboard
 * para evitar el fan-out N+1 de las 18+ requests individuales.
 */
export async function getEventAvailability(eventId: string): Promise<EventAvailabilitySummary> {
  const blocks = await prisma.eventBlock.findMany({ where: { eventId } })
  // Agrupamos por blockId IN (bloques del evento) — NO por eventId. blockAvailability (el
  // individual) cuenta por blockId sin mirar eventId; filtrar por eventId acá haría que batch e
  // individual divergieran si alguna registration tuviera eventId inconsistente con su bloque.
  const [regByBlock, generals] = await Promise.all([
    prisma.registration.groupBy({
      by: ['blockId'],
      where: { blockId: { in: blocks.map((b) => b.id) }, status: 'confirmada' },
      _count: { _all: true },
    }),
    prisma.registration.count({ where: { eventId, blockId: null, status: 'confirmada' } }),
  ])
  const countByBlock = new Map(regByBlock.map((r) => [r.blockId!, r._count._all]))
  const avail: BlockAvailabilityWithId[] = blocks.map((b) => {
    const confirmadas = countByBlock.get(b.id) ?? 0
    const taken = Math.min(b.capacity, b.seedTaken + confirmadas)
    const left = Math.max(0, b.capacity - taken)
    return { id: b.id, capacity: b.capacity, taken, left, full: left === 0 }
  })
  return { blocks: avail, generals }
}

/** Eventos con sus bloques embebidos: 1 query en lugar de 1+N (fix N+1 bootstrap). */
export async function getEventsWithBlocks(): Promise<(EventItem & { blocks: EventBlock[] })[]> {
  const rows = await prisma.event.findMany({
    orderBy: { startDate: 'asc' },
    include: {
      sponsors: { select: { sponsorId: true } },
      blocks: { orderBy: [{ day: 'asc' }, { start: 'asc' }] },
    },
  })
  return rows.map((r) => ({ ...toEventItem(r), blocks: r.blocks.map(toEventBlock) }))
}
