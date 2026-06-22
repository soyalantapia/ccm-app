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
  if (!event) throw notFound('EVENT_NOT_FOUND', 'Evento no encontrado')

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

    // Inscripción a nivel evento (sin bloque, sin cupo).
    const existing = await tx.registration.findFirst({ where: { deviceId, eventId, blockId: null } })
    if (existing?.status === 'confirmada') {
      throw conflict('ALREADY_REGISTERED', 'Ya estás inscripto a este evento')
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
