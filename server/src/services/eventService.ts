import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { toEventItem, toEventBlock } from '../lib/serialize.js'
import { notFound } from '../lib/errors.js'
import type { EventItem, EventBlock } from '@domain/types'

/**
 * Un evento es visible para el público si está publicado Y, si es una INICIATIVA, su evento
 * padre también lo está. Sin la segunda mitad, publicar un taller adentro de un evento que
 * todavía es borrador lo saca al aire igual: se llegaba a la ficha del taller —y aparecía en el
 * listado— de algo que el organizador ni siquiera había anunciado.
 */
const VISIBLE_AL_PUBLICO: Prisma.EventWhereInput = {
  published: true,
  OR: [{ parentId: null }, { parent: { published: true } }],
}

export async function getEvents(): Promise<EventItem[]> {
  const rows = await prisma.event.findMany({
    where: VISIBLE_AL_PUBLICO,
    orderBy: { startDate: 'asc' },
    include: { sponsors: { select: { sponsorId: true } } },
  })
  return rows.map(toEventItem)
}

/** TODOS los eventos, borradores incluidos. Sólo para el panel (va detrás del guard de permisos). */
export async function getAllEvents(): Promise<EventItem[]> {
  const rows = await prisma.event.findMany({
    orderBy: { startDate: 'asc' },
    include: { sponsors: { select: { sponsorId: true } } },
  })
  return rows.map(toEventItem)
}

export async function getEvent(slug: string): Promise<EventItem> {
  const ev = await prisma.event.findUnique({
    where: { slug },
    include: { sponsors: { select: { sponsorId: true } }, parent: { select: { published: true } } },
  })
  // Un borrador responde igual que un evento inexistente: si diera un error distinto, la ficha
  // de un evento sin publicar sería adivinable desde afuera probando slugs.
  // Y una iniciativa hereda la visibilidad de su padre: publicada adentro de un borrador, sigue
  // sin existir para el público.
  if (!ev || !ev.published || (ev.parent && !ev.parent.published)) {
    throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')
  }
  return toEventItem(ev)
}

/** Un borrador responde exactamente igual que un evento inexistente. El id de un evento lo genera
 *  el cliente y viaja en claro, así que si el borrador diera un error distinto —o un 200 vacío—
 *  alcanzaría con probar ids para confirmar qué se está preparando sin anunciar.
 *
 *  Sin puerta de escape a propósito: acá hubo un `opts.includeUnpublished` que no pasaba ningún
 *  call site (sólo su propio test). Cuando el panel necesite leer borradores va por una función
 *  aparte —getAllEvents acá arriba, getAllNotas en notaService—, que es como este repo resuelve
 *  "el admin ve borradores": un getAllX no se prende de casualidad desde una ruta pública, un
 *  flag sí, alcanza con reenviarle un req.query sin castear. */
async function requireVisibleEvent(eventId: string): Promise<void> {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { published: true, parent: { select: { published: true } } },
  })
  // Ídem para las rutas hijas (agenda, cupo, inscripción): una iniciativa dentro de un borrador
  // no expone su grilla ni acepta gente.
  if (!ev || !ev.published || (ev.parent && !ev.parent.published)) {
    throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')
  }
}

async function leerBloques(eventId: string): Promise<EventBlock[]> {
  // orderBy determinístico: sin él Postgres devuelve heap-order (agenda barajada en prod; en la
  // demo salía cronológica porque el seed preserva el array). day='19/09'/start='17:00' son
  // strings zero-padded del mismo mes → el sort lexical coincide con el cronológico del evento.
  const rows = await prisma.eventBlock.findMany({
    where: { eventId },
    orderBy: [{ day: 'asc' }, { start: 'asc' }],
  })
  return rows.map(toEventBlock)
}

export async function getBlocks(eventId: string): Promise<EventBlock[]> {
  // Padre inexistente → 404 (antes devolvía 200 [], rompiendo la convención notFound del backend).
  // Y padre en borrador también: antes este chequeo traía `select: { id: true }`, o sea que ni
  // miraba published y la agenda completa de un evento sin publicar se leía con sólo tener el id.
  await requireVisibleEvent(eventId)
  return leerBloques(eventId)
}

/** La agenda de CUALQUIER evento, borradores incluidos. Sólo para el panel, detrás del guard de
 *  permisos — misma convención que getAllEvents: una función aparte y no un flag, porque un
 *  getAllX no se prende de casualidad desde una ruta pública y un flag sí (alcanza con
 *  reenviarle un req.query sin castear). El panel la necesita para armar la grilla del evento
 *  que todavía no publicó: sin esto, su propio borrador le aparece sin agenda. */
export async function getAllBlocks(eventId: string): Promise<EventBlock[]> {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!ev) throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')
  return leerBloques(eventId)
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
  await requireVisibleEvent(eventId)
  return prisma.registration.count({ where: { eventId, blockId: null, status: 'confirmada' } })
}

/** Cupo real = seedTaken (baseline) + inscripciones confirmadas. Lo calcula el SERVER. */
export async function blockAvailability(blockId: string): Promise<Availability> {
  const block = await prisma.eventBlock.findUnique({
    where: { id: blockId },
    include: { event: { select: { published: true, parent: { select: { published: true } } } } },
  })
  // Bloque de un borrador → el MISMO BLOCK_NOT_FOUND que un id inventado. Acá el 404 habla de
  // bloque y no de evento a propósito: contestar EVENT_NOT_FOUND delataría que el bloque existe.
  // Y si el evento es una iniciativa, hereda del padre: dentro de un borrador tampoco se ve.
  if (!block || !block.event.published || (block.event.parent && !block.event.parent.published)) {
    throw notFound('BLOCK_NOT_FOUND', 'Bloque no encontrado')
  }
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
 * Cupo de TODOS los bloques de un evento + inscriptos generales en 4 queries repartidas en 2
 * round-trips (vs las N queries per-bloque de blockAvailability). Lo sirve
 * GET /events/:id/blocks-availability, que el front pide desde RemoteDataStore.fetchEventAvailability
 * para no disparar el fan-out N+1 de 18+ requests individuales por evento.
 */
export async function getEventAvailability(eventId: string): Promise<EventAvailabilitySummary> {
  // El gate corre EN PARALELO con los bloques: es un findUnique por PK y encadenarlo le sumaba un
  // round-trip entero justo al endpoint que existe para no hacer fan-out. No lo afloja: si el
  // evento es borrador el Promise.all rechaza y los conteos —lo que revela cupos— no llegan a correr.
  const [, blocks] = await Promise.all([
    requireVisibleEvent(eventId),
    prisma.eventBlock.findMany({ where: { eventId } }),
  ])
  return calcularAvailability(eventId, blocks)
}

/** Ídem para el panel: el cupo de un evento que todavía es borrador. Misma convención getAllX. */
export async function getAllEventAvailability(eventId: string): Promise<EventAvailabilitySummary> {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!ev) throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')
  const blocks = await prisma.eventBlock.findMany({ where: { eventId } })
  return calcularAvailability(eventId, blocks)
}

async function calcularAvailability(
  eventId: string,
  blocks: { id: string; capacity: number; seedTaken: number }[],
): Promise<EventAvailabilitySummary> {
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
    // Ruta pública: mismos eventos que devuelve getEvents(). Si acá no se filtrara, el bootstrap
    // del front —que usa este endpoint— se traería los borradores igual.
    where: VISIBLE_AL_PUBLICO,
    orderBy: { startDate: 'asc' },
    include: {
      sponsors: { select: { sponsorId: true } },
      blocks: { orderBy: [{ day: 'asc' }, { start: 'asc' }] },
    },
  })
  return rows.map((r) => ({ ...toEventItem(r), blocks: r.blocks.map(toEventBlock) }))
}
/** Una inscripción tal como la ve el panel: quién, a qué, cuándo. */
export interface InscriptoAdmin {
  id: string
  deviceId: string
  blockId: string | null
  blockTitle: string | null
  status: string
  ts: string
  nombre: string | null
  email: string | null
  telefono: string | null
}

/**
 * Los inscriptos REALES de un evento, de todos los dispositivos.
 *
 * Existe porque el panel los leía de `getRegistrations()` del front, que es DEVICE-SCOPED (lo
 * dice el propio docstring de DataStore): la ficha del evento mostraba únicamente las
 * inscripciones del teléfono desde el que se estaba mirando. Para el organizador eso se lee como
 * "no se anotó nadie", que es la peor forma de equivocarse — no da ningún síntoma técnico y hace
 * tomar decisiones sobre un número inventado.
 *
 * Devuelve PII (nombre, email, teléfono), así que va detrás de `people:read`, el mismo permiso
 * que gobierna el CRM de personas.
 */
export async function getInscriptos(eventId: string): Promise<InscriptoAdmin[]> {
  const rows = await prisma.registration.findMany({
    where: { eventId, status: 'confirmada' },
    orderBy: { ts: 'desc' },
    include: {
      block: { select: { title: true } },
      device: { select: { fields: { select: { key: true, value: true } } } },
    },
  })
  return rows.map((r) => {
    const campos = new Map(r.device?.fields.map((f) => [f.key as string, f.value]) ?? [])
    const nombre = [campos.get('firstName'), campos.get('lastName')].filter(Boolean).join(' ')
    return {
      id: r.id,
      deviceId: r.deviceId,
      blockId: r.blockId,
      blockTitle: r.block?.title ?? null,
      status: r.status,
      ts: r.ts.toISOString(),
      nombre: nombre || null,
      email: campos.get('email') ?? null,
      telefono: campos.get('phone') ?? null,
    }
  })
}
