import { prisma } from '../lib/prisma.js'
import { conflict, notFound, badRequest } from '../lib/errors.js'
import { derivarTokenGrant } from '../lib/grantToken.js'
import { publicBase } from '../lib/publicUrl.js'

/**
 * Regalar entradas desde el CRM.
 *
 * El organizador se para sobre una persona (que puede no haber abierto nunca la app) y le otorga
 * N entradas a un evento, tenga precio o no. Sale un mail con un link; el invitado lo abre en su
 * teléfono y ahí la entrada se materializa (eso vive en el servicio de reclamo, aparte).
 *
 * CUPO — se reserva al OTORGAR, no al reclamar. Si se chequeara al reclamar, el organizador
 * mandaría 20 invitaciones a un taller de 5 lugares y se enterarían los invitados de a uno, con
 * el mail ya en la mano. Así que las cortesías PENDIENTES cuentan contra capacity desde que se
 * crean. (Detalle: una cortesía RECLAMADA ya produjo su Registration, que se cuenta por el lado
 * de las inscripciones; por eso el cupo suma inscripciones + grants pendientes, sin doble conteo.
 * Para el caso qty>1 —un regalo que admite varias personas— eso subestima por (qty-1) asientos
 * DESPUÉS del reclamo; es un residuo acotado y conocido, aceptable con cupos de 30-50 y cortesías
 * de a puñados. Si mañana se necesita exactitud, se traza con un grantId en Registration.)
 */

export type NuevoGrant = {
  personId: string
  eventId: string
  qty: number
  note?: string
  grantedById: string | null
}

/** El link que se le manda al invitado. El token se DERIVA, no se guarda (ver grantToken.ts). */
export function linkDeGrant(grantId: string, tokenVersion: number): string {
  const token = derivarTokenGrant(grantId, tokenVersion)
  return `${publicBase()}/i/${grantId}.${token}`
}

/** Ocupación de un evento contando lo que reservan las cortesías activas. */
async function ocupacionConGrants(
  tx: Pick<typeof prisma, 'event' | 'registration' | 'ticketGrant'>,
  eventId: string,
): Promise<{ capacity: number | null; ocupados: number }> {
  const ev = await tx.event.findUnique({
    where: { id: eventId },
    select: { capacity: true, seedTaken: true },
  })
  if (!ev) return { capacity: null, ocupados: 0 }
  const [inscriptos, grantsPendientes] = await Promise.all([
    tx.registration.count({ where: { eventId, blockId: null, status: 'confirmada' } }),
    tx.ticketGrant.aggregate({
      where: { eventId, status: 'pendiente' },
      _sum: { qty: true },
    }),
  ])
  const reservadoPorGrants = grantsPendientes._sum.qty ?? 0
  return { capacity: ev.capacity, ocupados: ev.seedTaken + inscriptos + reservadoPorGrants }
}

export type GrantCreado = {
  id: string
  personId: string
  eventId: string
  qty: number
  note: string | null
  status: 'pendiente' | 'reclamado' | 'revocado'
  createdAt: string
  link: string
}

/**
 * Otorga una cortesía. Valida como el organizador, no como un comprador:
 * - el evento tiene que estar publicado (un borrador no se puede regalar: el link 404earía) y no
 *   haber pasado;
 * - NO se chequea socioOnly ni precio a propósito: regalar es justamente saltarse el peaje;
 * - el cupo se reserva acá (ver arriba);
 * - una persona no recibe dos cortesías ACTIVAS para el mismo evento.
 */
export async function crearGrant(input: NuevoGrant): Promise<GrantCreado> {
  const qty = Math.trunc(input.qty)
  if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
    throw badRequest('GRANT_QTY_INVALIDA', 'La cantidad de entradas tiene que estar entre 1 y 20.')
  }

  const grant = await prisma.$transaction(async (tx) => {
    const persona = await tx.person.findUnique({ where: { id: input.personId } })
    if (!persona) throw notFound('PERSON_NOT_FOUND', 'No encontramos a esa persona.')

    const evento = await tx.event.findUnique({ where: { id: input.eventId } })
    if (!evento || !evento.published) {
      // Igual que register(): un borrador responde como inexistente para no filtrar que existe.
      throw notFound('EVENT_NOT_FOUND', 'Ese evento no existe o todavía no está publicado.')
    }
    if (evento.past) {
      throw conflict('EVENT_PAST', 'Ese evento ya pasó: no se pueden regalar entradas.')
    }

    // Una cortesía activa por persona y evento. Regalar dos veces lo mismo es casi siempre un
    // error de dedo; si de verdad quiere más lugares, edita la cantidad del regalo que ya existe.
    const yaTiene = await tx.ticketGrant.findFirst({
      where: { personId: input.personId, eventId: input.eventId, status: { in: ['pendiente', 'reclamado'] } },
    })
    if (yaTiene) {
      throw conflict('GRANT_DUPLICADO', 'Esta persona ya tiene una entrada regalada para este evento.')
    }

    // Cupo reservado al otorgar.
    const { capacity, ocupados } = await ocupacionConGrants(tx, input.eventId)
    if (capacity != null && ocupados + qty > capacity) {
      throw conflict(
        'EVENT_FULL',
        `No hay lugar: quedan ${Math.max(0, capacity - ocupados)} de ${capacity} y estás regalando ${qty}.`,
      )
    }

    return tx.ticketGrant.create({
      data: {
        personId: input.personId,
        eventId: input.eventId,
        qty,
        note: input.note?.trim() || null,
        grantedById: input.grantedById,
      },
    })
  })

  return {
    id: grant.id,
    personId: grant.personId,
    eventId: grant.eventId,
    qty: grant.qty,
    note: grant.note,
    status: grant.status,
    createdAt: grant.createdAt.toISOString(),
    link: linkDeGrant(grant.id, grant.tokenVersion),
  }
}

/**
 * Revoca una cortesía. Si todavía no se reclamó, alcanza con marcarla. Si YA se reclamó, hay que
 * cancelar también la Registration que creó, en la misma transacción — si no, se le saca la
 * cortesía pero la persona sigue inscripta con su QR. (El reclamo todavía no existe, así que hoy
 * la rama del reclamado no se ejercita; queda escrita para cuando exista.)
 */
export async function revocarGrant(grantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const grant = await tx.ticketGrant.findUnique({ where: { id: grantId } })
    if (!grant) throw notFound('GRANT_NOT_FOUND', 'Esa entrada regalada no existe.')
    if (grant.status === 'revocado') return // idempotente

    if (grant.status === 'reclamado' && grant.claimedByDeviceId) {
      await tx.registration.updateMany({
        where: { deviceId: grant.claimedByDeviceId, eventId: grant.eventId, blockId: null },
        data: { status: 'cancelada' },
      })
    }
    await tx.ticketGrant.update({ where: { id: grantId }, data: { status: 'revocado' } })
  })
}

/** Las cortesías de una persona, para pintarlas en su ficha. La más nueva primero. */
export async function grantsDePersona(personId: string): Promise<
  { id: string; eventId: string; eventTitle: string; qty: number; status: string; createdAt: string; link: string | null }[]
> {
  const grants = await prisma.ticketGrant.findMany({
    where: { personId },
    orderBy: { createdAt: 'desc' },
    include: { event: { select: { title: true } } },
  })
  return grants.map((g) => ({
    id: g.id,
    eventId: g.eventId,
    eventTitle: g.event.title,
    qty: g.qty,
    status: g.status,
    createdAt: g.createdAt.toISOString(),
    // El link sólo tiene sentido mientras se pueda usar; una revocada no lo muestra.
    link: g.status === 'revocado' ? null : linkDeGrant(g.id, g.tokenVersion),
  }))
}
