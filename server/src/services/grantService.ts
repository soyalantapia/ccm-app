import { randomUUID, randomBytes } from 'node:crypto'
import type { Prisma, TicketGrant } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { badRequest, conflict, notFound } from '../lib/errors.js'

/**
 * Entradas de cortesía. El organizador regala una entrada a un email que puede no existir
 * todavía en la plataforma, y la persona la reclama de una de dos formas —decididas con el
 * cliente el 22/07—: **tocando el link** que le llega por mail, o **entrando a la app** y
 * poniendo su email, confirmándolo con un código de un solo uso.
 *
 * Por qué el grant es una entidad propia y no una TicketOrder de $0: la invitación existe ANTES
 * de que exista el dispositivo de la persona y sobrevive sin dueño hasta que alguien la reclama.
 * Además regalar un EVENTO no produce orden ninguna —produce inscripción—, así que meterla
 * dentro de TicketOrder obligaría a inventar órdenes fantasma para eventos gratuitos.
 *
 * Por qué el reclamo por email pide código: sin login, "poné tu email y llevate la entrada" se
 * lo lleva cualquiera que conozca el email del invitado — y en prensa y sponsors ese es el dato
 * más fácil de averiguar. El código reusa entero el módulo puro `lib/adminOtp.ts`.
 */

const grantId = () => `grant_${randomUUID()}`
const orderId = () => `ord_${randomUUID()}`
const regId = () => `reg_${randomUUID()}`

/** Secreto del link. 32 bytes en base64url: no adivinable por fuerza bruta. */
const newClaimToken = () => randomBytes(32).toString('base64url')

/**
 * Normalización del email. Es la CLAVE con la que se busca al reclamar por código, así que
 * guardarlo crudo rompería el reclamo de quien lo tipea con mayúsculas o con un espacio pegado.
 */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase()

export interface NuevoGrant {
  kind: 'ticket_plan' | 'event'
  resourceId: string
  email: string
  qty?: number
  message?: string
}

/**
 * Crear la invitación. NO materializa nada: la entrada nace sin dueño y se materializa recién
 * cuando la persona la reclama. Es lo que pidió el cliente y además evita el caso incómodo de
 * regalarle algo a un dispositivo que resulta no ser de esa persona.
 *
 * Valida que el recurso EXISTA: regalar un plan inexistente dejaría una invitación que revienta
 * al reclamarse, del lado de la persona invitada y no del organizador.
 */
export async function createGrant(input: NuevoGrant, grantedById: string): Promise<TicketGrant> {
  const email = normalizeEmail(input.email)
  if (!email.includes('@')) throw badRequest('EMAIL_INVALIDO', 'El email no parece válido')

  const qty = Math.max(1, Math.floor(input.qty ?? 1))

  if (input.kind === 'ticket_plan') {
    const plan = await prisma.ticketPlan.findUnique({ where: { id: input.resourceId }, select: { id: true } })
    if (!plan) throw badRequest('PLAN_NOT_FOUND', 'El plan de entrada no existe')
  } else {
    const ev = await prisma.event.findUnique({ where: { id: input.resourceId }, select: { id: true } })
    if (!ev) throw badRequest('EVENT_NOT_FOUND', 'El evento no existe')
  }

  return prisma.ticketGrant.create({
    data: {
      id: grantId(),
      kind: input.kind,
      resourceId: input.resourceId,
      email,
      qty,
      message: input.message?.trim() || null,
      grantedById,
      claimToken: newClaimToken(),
    },
  })
}

/**
 * Convertir la invitación en algo que la persona ve en su app.
 *
 * Los chequeos de `orderId`/`registrationId` de acá abajo son defensa redundante, NO el mecanismo:
 * la idempotencia de verdad la da `reclamar`, que toma el lock de la fila y corta apenas ve
 * `claimedAt`. Verificado por mutación: romper estos chequeos NO pone ningún test en rojo, porque
 * ningún camino llega acá con el grant ya materializado. Se dejan igual —es un camino que reparte
 * plata— pero que nadie los confunda con la garantía: si vas a tocar la idempotencia, el lugar
 * es `reclamar`.
 *
 * - `ticket_plan` → TicketOrder confirmada de total 0. NO crea Registration: "Tus entradas VIP"
 *   en Mi QR se muestra con la orden sola (`hasOrders`), sin exigir inscripción. Eso es lo que
 *   hace barata esta primera versión.
 * - `event` → Registration confirmada. No hay orden que crear: el acceso a un evento es gratis.
 */
async function materializar(
  tx: Prisma.TransactionClient,
  grant: TicketGrant,
  deviceId: string,
): Promise<{ orderId?: string; registrationId?: string }> {
  if (grant.kind === 'ticket_plan') {
    if (grant.orderId) return { orderId: grant.orderId }
    const plan = await tx.ticketPlan.findUnique({ where: { id: grant.resourceId }, select: { id: true } })
    if (!plan) throw conflict('PLAN_NOT_FOUND', 'El plan de esta invitación ya no existe')
    const orden = await tx.ticketOrder.create({
      data: {
        id: orderId(),
        planId: plan.id,
        deviceId,
        qty: grant.qty,
        // Total 0 porque es un regalo. Ojo: total 0 NO alcanza para reconocer una cortesía
        // (un plan con precio pendiente también da 0) — para eso está grantedById.
        total: 0,
        status: 'confirmada',
        buyerEmail: grant.email,
        grantedById: grant.grantedById,
      },
    })
    return { orderId: orden.id }
  }

  if (grant.registrationId) return { registrationId: grant.registrationId }

  // Una inscripción por persona y evento (@@unique). Si ya estaba inscripta —por su cuenta o
  // por una cortesía previa— se reusa la fila en vez de reventar contra el índice único.
  const previa = await tx.registration.findFirst({
    where: { deviceId, eventId: grant.resourceId, blockId: null },
  })
  if (previa) {
    if (previa.status === 'cancelada') {
      await tx.registration.update({ where: { id: previa.id }, data: { status: 'confirmada', ts: new Date() } })
    }
    return { registrationId: previa.id }
  }
  const reg = await tx.registration.create({
    data: { id: regId(), deviceId, eventId: grant.resourceId, blockId: null, status: 'confirmada' },
  })
  return { registrationId: reg.id }
}

export type ClaimVia = 'link' | 'code'

/**
 * Reclamo. Toma el lock de la fila del grant ANTES de mirar si está reclamado: sin eso, dos
 * pestañas que abren el mismo link a la vez leerían ambas "sin reclamar" y crearían dos regalos.
 * Mismo mecanismo que usa la inscripción a un bloque para no sobrevender el cupo.
 */
async function reclamar(grant: TicketGrant, deviceId: string, via: ClaimVia): Promise<TicketGrant> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TicketGrant" WHERE id = ${grant.id} FOR UPDATE`
    const fresco = await tx.ticketGrant.findUnique({ where: { id: grant.id } })
    if (!fresco) throw notFound('GRANT_NOT_FOUND', 'Esta invitación no existe')
    if (fresco.revokedAt) throw conflict('GRANT_REVOKED', 'Esta invitación ya no está disponible')

    // Ya reclamada POR ESTE MISMO dispositivo: devolverla tal cual en vez de un error. Reabrir
    // el link del propio mail es lo más normal del mundo y no puede parecer un fallo.
    if (fresco.claimedAt) {
      if (fresco.claimedByDeviceId === deviceId) return fresco
      throw conflict('GRANT_ALREADY_CLAIMED', 'Esta invitación ya fue activada')
    }

    const { orderId: oid, registrationId: rid } = await materializar(tx, fresco, deviceId)
    return tx.ticketGrant.update({
      where: { id: fresco.id },
      data: {
        claimedAt: new Date(),
        claimedVia: via,
        claimedByDeviceId: deviceId,
        orderId: oid ?? null,
        registrationId: rid ?? null,
      },
    })
  })
}

/** Camino 1: la persona tocó el link del mail. */
export async function claimByToken(token: string, deviceId: string): Promise<TicketGrant> {
  const grant = await prisma.ticketGrant.findUnique({ where: { claimToken: token } })
  // Mismo error para "no existe" que para "token mal tipeado": no se confirma la existencia
  // de un token a quien lo esté probando a ciegas.
  if (!grant) throw notFound('GRANT_NOT_FOUND', 'Esta invitación no existe o ya no está disponible')
  return reclamar(grant, deviceId, 'link')
}

/** Invitaciones vivas de un email — las que un código válido va a materializar. */
export async function grantsPendientesDe(email: string): Promise<TicketGrant[]> {
  return prisma.ticketGrant.findMany({
    where: { email: normalizeEmail(email), claimedAt: null, revokedAt: null },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Camino 2: la persona entró a la app y puso su email. Con el código ya verificado por la ruta,
 * se materializan TODAS sus invitaciones vivas de una sola vez — si le regalaron dos cosas,
 * pedirle dos códigos sería maltratarla.
 *
 * Si una falla, las demás siguen: un plan borrado no puede dejarla sin las otras entradas.
 */
export async function claimAllByEmail(
  email: string,
  deviceId: string,
): Promise<{ reclamados: TicketGrant[]; fallidos: { id: string; error: string }[] }> {
  const pendientes = await grantsPendientesDe(email)
  const reclamados: TicketGrant[] = []
  const fallidos: { id: string; error: string }[] = []
  for (const g of pendientes) {
    try {
      reclamados.push(await reclamar(g, deviceId, 'code'))
    } catch (err) {
      fallidos.push({ id: g.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { reclamados, fallidos }
}

/**
 * Revocar. Si la invitación YA fue reclamada hay que deshacer lo materializado, no sólo marcar
 * el grant: revocar a medias dejaría la entrada viva en el teléfono de la persona.
 */
export async function revokeGrant(id: string, reason: string): Promise<TicketGrant> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TicketGrant" WHERE id = ${id} FOR UPDATE`
    const g = await tx.ticketGrant.findUnique({ where: { id } })
    if (!g) throw notFound('GRANT_NOT_FOUND', 'Esta invitación no existe')
    if (g.revokedAt) return g // revocar dos veces no es un error

    if (g.orderId) {
      await tx.ticketOrder.updateMany({ where: { id: g.orderId }, data: { status: 'cancelada' } })
    }
    if (g.registrationId) {
      await tx.registration.updateMany({ where: { id: g.registrationId }, data: { status: 'cancelada' } })
    }
    return tx.ticketGrant.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason.trim().slice(0, 300) || 'Sin motivo' },
    })
  })
}

/** Vista del organizador: todo lo regalado, lo más nuevo primero. */
export async function getAllGrants(): Promise<TicketGrant[]> {
  return prisma.ticketGrant.findMany({ orderBy: { createdAt: 'desc' } })
}

/** Las invitaciones de una persona, para la ficha del CRM. Incluye las SIN reclamar, que no
 *  tienen dispositivo y por eso no aparecen por el camino de las órdenes. */
export async function getGrantsByEmail(email: string): Promise<TicketGrant[]> {
  return prisma.ticketGrant.findMany({
    where: { email: normalizeEmail(email) },
    orderBy: { createdAt: 'desc' },
  })
}
