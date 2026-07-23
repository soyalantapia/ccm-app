import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { toRegistration } from '../lib/serialize.js'
import { conflict, forbidden, notFound } from '../lib/errors.js'
import { ocupacionDeEvento } from './eventSeats.js'
import type { Registration } from '@domain/types'

const regId = () => `reg_${randomUUID()}`

export async function getRegistrations(deviceId: string): Promise<Registration[]> {
  const rows = await prisma.registration.findMany({
    where: { deviceId, status: 'confirmada' },
    orderBy: { ts: 'desc' },
  })
  return rows.map(toRegistration)
}

/**
 * Inscripción con regla de negocio (doc 10 §3). El cupo lo decide el SERVER:
 *  - Evento en borrador → 404 EVENT_NOT_FOUND (indistinguible de uno inexistente).
 *  - Gate socioOnly a nivel EVENTO (canon 17) → 403 SOCIO_ONLY.
 *  - Bloque con cupo: transacción con `SELECT ... FOR UPDATE` sobre la fila del
 *    bloque → serializa inscripciones concurrentes y evita el oversell.
 *  - Re-inscripción tras cancelar: reactiva la fila (respeta @@unique).
 */
export async function register(
  deviceId: string,
  eventId: string,
  blockId?: string,
): Promise<Registration> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    // El padre viaja en la misma consulta porque una INICIATIVA hereda dos cosas suyas: si se ve
    // (`published`) y para quiénes es (`socioOnly`). Sin esto, las dos reglas del evento grande
    // se evaporaban al colgarle un taller adentro.
    include: { parent: { select: { published: true, socioOnly: true } } },
  })
  // Un borrador no toma inscripciones y contesta lo mismo que un id inventado. El eventId lo
  // genera el cliente, así que sin este gate alcanzaba con adivinarlo para quedar CONFIRMADO —
  // con QR y ocupando cupo— en un evento que todavía no salió a la calle. Va primero, antes que
  // past y socioOnly, para no filtrar por el mensaje de error.
  //
  // La iniciativa hereda la visibilidad del padre, igual que en las lecturas (eventService
  // VISIBLE_AL_PUBLICO): un taller publicado adentro de un evento que sigue en borrador no
  // existe para el público, así que tampoco puede tomar inscripciones. La lectura ya devolvía
  // 404 y esta ruta seguía aceptando: la ficha no se veía, pero el POST entraba igual.
  if (!event || !event.published || (event.parent && !event.parent.published)) {
    throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')
  }

  // Evento finalizado: cerrar la inscripción (antes se podía inscribir a un evento pasado y
  // recibir un QR para algo que ya sucedió). El front revierte el optimista ante este 409.
  if (event.past) throw conflict('EVENT_PAST', 'Este evento ya finalizó; las inscripciones están cerradas.')

  // Evento con precio: no se entra gratis, ni por el CTA ni por un bloque de la grilla. El lugar
  // lo crea el aviso de pago de Mercado Pago (mpWebhookService.activar), no esta ruta.
  // Sin este guard, apagar el botón en la pantalla es cosmético: el POST sigue abierto y alguien
  // que sepa el id del bloque se lleva el lugar sin pagar. Y es justo lo que el precio venía a
  // evitar — el cliente lo puso como filtro, no como decoración.
  if (event.price != null) {
    throw conflict(
      'EVENT_REQUIRES_PAYMENT',
      'Este evento tiene un valor: el lugar se confirma al completar el pago.',
    )
  }

  // Gate socioOnly a nivel evento (el bloque lo hereda) y también a nivel PADRE: un taller
  // colgado de una capacitación exclusiva de Socios es parte de ella, no una puerta de atrás.
  // El alta de una iniciativa nace con socioOnly en false, así que sin heredarlo el candado del
  // evento grande se abría solo con cargarle una actividad adentro.
  if (event.socioOnly || event.parent?.socioOnly) {
    const membership = await prisma.membership.findUnique({ where: { deviceId } })
    if (membership?.tier !== 'socio') {
      throw forbidden('SOCIO_ONLY', 'Este evento es exclusivo para Socios CCM')
    }
  }

  const row = await prisma.$transaction(async (tx) => {
    if (blockId) {
      // Lock de la fila del bloque: serializa el conteo+inserción concurrentes.
      await tx.$queryRaw`SELECT id FROM "EventBlock" WHERE id = ${blockId} FOR UPDATE`
      const block = await tx.eventBlock.findUnique({ where: { id: blockId } })
      if (!block || block.eventId !== eventId) throw notFound('BLOCK_NOT_FOUND', 'Bloque no encontrado')

      const existing = await tx.registration.findFirst({ where: { deviceId, eventId, blockId } })
      if (existing?.status === 'confirmada') {
        throw conflict('ALREADY_REGISTERED', 'Ya estás inscripto a este bloque')
      }

      const confirmadas = await tx.registration.count({ where: { blockId, status: 'confirmada' } })
      if (block.seedTaken + confirmadas >= block.capacity) {
        throw conflict('BLOCK_FULL', 'El bloque está completo')
      }

      if (existing) {
        return tx.registration.update({
          where: { id: existing.id },
          data: { status: 'confirmada', ts: new Date() },
        })
      }
      return tx.registration.create({
        data: { id: regId(), deviceId, eventId, blockId, status: 'confirmada' },
      })
    }

    // Inscripción a nivel evento (sin bloque). El lock, el cupo y el buscar-reactivar-o-crear
    // viven en confirmarLugar() (eventSeats.ts), compartido con el webhook de MP. Acá el cupo
    // REBOTA con EVENT_FULL: es gratis, el lugar simplemente no está.
    // Diferencia con confirmarLugar: register() distingue "ya inscripto" (ALREADY_REGISTERED, un
    // 409 informativo hacia el usuario) de reactivar una cancelada. confirmarLugar trata la fila
    // confirmada como idempotente (no re-crea) porque a un reintento de MP no hay que gritarle.
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`
    const existing = await tx.registration.findFirst({ where: { deviceId, eventId, blockId: null } })
    if (existing?.status === 'confirmada') {
      throw conflict('ALREADY_REGISTERED', 'Ya estás inscripto a este evento')
    }

    if (event.capacity != null) {
      const confirmadas = await ocupacionDeEvento(tx, eventId)
      if (event.seedTaken + confirmadas >= event.capacity) {
        throw conflict('EVENT_FULL', 'Este evento está completo')
      }
    }
    if (existing) {
      return tx.registration.update({
        where: { id: existing.id },
        data: { status: 'confirmada', ts: new Date() },
      })
    }
    return tx.registration.create({
      data: { id: regId(), deviceId, eventId, blockId: null, status: 'confirmada' },
    })
  })

  return toRegistration(row)
}

export async function cancelRegistration(deviceId: string, registrationId: string): Promise<void> {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId } })
  if (!reg || reg.deviceId !== deviceId) throw notFound('REGISTRATION_NOT_FOUND', 'Inscripción no encontrada')
  await prisma.registration.update({ where: { id: registrationId }, data: { status: 'cancelada' } })
}
