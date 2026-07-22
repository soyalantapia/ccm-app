import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { toRegistration } from '../lib/serialize.js'
import { conflict, forbidden, notFound } from '../lib/errors.js'
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
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  // Un borrador no toma inscripciones y contesta lo mismo que un id inventado. El eventId lo
  // genera el cliente, así que sin este gate alcanzaba con adivinarlo para quedar CONFIRMADO —
  // con QR y ocupando cupo— en un evento que todavía no salió a la calle. Va primero, antes que
  // past y socioOnly, para no filtrar por el mensaje de error.
  if (!event || !event.published) throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')

  // Un borrador no acepta inscripciones. `published` se filtraba SOLO en las lecturas de
  // eventService (getEvents, getEvent, getEventsWithBlocks) y no acá, así que con el id de un
  // evento sin publicar —que no es secreto: lo genera el cliente y está a la vista en el panel—
  // se podía crear una Registration CONFIRMADA y quedarse con un QR de algo que el público ni ve.
  // Responde igual que un evento inexistente, por la misma razón que getEvent: si el error fuera
  // distinto, la existencia de un borrador sería adivinable desde afuera.
  if (!event.published) throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')

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

  // Gate socioOnly a nivel evento (el bloque lo hereda).
  if (event.socioOnly) {
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

    // Inscripción a nivel evento (sin bloque, sin cupo). Lock de la fila del Event para
    // serializar dos POST concurrentes del mismo device: el @@unique(deviceId,eventId,blockId)
    // NO protege acá porque en Postgres dos NULL son distintos en un índice único → sin lock,
    // dos requests en carrera crean DOS inscripciones (y dos QR) para el mismo evento.
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`
    const existing = await tx.registration.findFirst({ where: { deviceId, eventId, blockId: null } })
    if (existing?.status === 'confirmada') {
      throw conflict('ALREADY_REGISTERED', 'Ya estás inscripto a este evento')
    }

    // Cupo del evento. El lock de arriba ya existía pero no se comparaba contra nada: el
    // comentario original decía "sin bloque, sin cupo". Mientras todo era gratis no dolía; con
    // un evento que se cobra, sobrevender obliga a devolver plata. Sólo aplica si el organizador
    // cargó un tope: capacity null = como siempre, sin límite.
    // Reactivar una inscripción cancelada también consume lugar, por eso el chequeo va antes.
    if (event.capacity != null) {
      const confirmadas = await tx.registration.count({
        where: { eventId, blockId: null, status: 'confirmada' },
      })
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
