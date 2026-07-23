import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { conflict } from '../lib/errors.js'

/**
 * Ocupar un lugar en un evento (sin bloque), de forma segura ante concurrencia.
 *
 * Esta lógica vivía copiada en DOS lados con la misma fórmula: registrationService.register()
 * para la inscripción gratis, y mpWebhookService para cuando entra el aviso de pago de un evento
 * con precio. Un tercer caller —regalar una entrada— iba a copiarla una vez más, y a la primera
 * corrección los tres se desincronizaban. Se extrae acá, SIN cambiar comportamiento.
 *
 * Lo delicado que este módulo preserva:
 *
 * 1. EL LOCK. Se bloquea la fila del Event con `SELECT ... FOR UPDATE` antes de contar y crear.
 *    El @@unique(deviceId, eventId, blockId) NO protege el caso sin bloque, porque en Postgres
 *    dos NULL son distintos dentro de un índice único: sin el lock, dos requests en carrera crean
 *    DOS inscripciones (y dos QR) para el mismo evento.
 *
 * 2. LA POLÍTICA DE CUPO ES OPUESTA según quién llame, a propósito:
 *    - register() (inscripción gratis) REBOTA con EVENT_FULL: no hay plata de por medio, el
 *      lugar simplemente no está.
 *    - el webhook de MP SOBREVENDE y avisa fuerte: la plata ya se cobró, rechazar dejaría al
 *      comprador pago y sin lugar, y MP reintentaría para siempre contra un evento que nunca se
 *      va a vaciar. El organizador lo resuelve a mano.
 *    Eso se conserva vía `alLlenar`: 'rechazar' | 'sobrevender'.
 */

export type ClienteTx = Pick<typeof prisma, 'registration' | 'event' | '$queryRaw'>

/** Inscripciones confirmadas a nivel evento (sin bloque). No incluye el seedTaken. */
export async function ocupacionDeEvento(tx: ClienteTx, eventId: string): Promise<number> {
  return tx.registration.count({ where: { eventId, blockId: null, status: 'confirmada' } })
}

export type OpcionesLugar = {
  /** Qué hacer si el evento ya está lleno cuando se intenta ocupar. */
  alLlenar: 'rechazar' | 'sobrevender'
  /** Contexto para el log de sobreventa. */
  motivoLog?: Record<string, unknown>
}

/**
 * Confirma el lugar de `deviceId` en `eventId` (sin bloque) dentro de la transacción `tx`.
 * Bloquea la fila del Event, respeta el cupo según `alLlenar`, y hace buscar-reactivar-o-crear
 * para que un reintento no duplique. Devuelve el id de la Registration confirmada.
 *
 * Precondiciones que el CALLER valida antes (existencia, published, past, socioOnly, precio):
 * esta función asume que ya se decidió que el lugar corresponde y sólo lo materializa.
 */
export async function confirmarLugar(
  tx: ClienteTx,
  deviceId: string,
  eventId: string,
  opts: OpcionesLugar,
): Promise<string> {
  // Serializa dos ocupaciones concurrentes del mismo evento.
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`

  const previa = await tx.registration.findFirst({
    where: { deviceId, eventId, blockId: null },
  })
  if (previa?.status === 'confirmada') return previa.id // ya ocupado: no se duplica

  // Cupo. Sólo aplica si el organizador cargó un tope (capacity null = sin límite).
  // Reactivar una cancelada también consume lugar, por eso el chequeo va antes de crear.
  const ev = await tx.event.findUnique({
    where: { id: eventId },
    select: { capacity: true, seedTaken: true },
  })
  if (ev?.capacity != null) {
    const confirmadas = await ocupacionDeEvento(tx, eventId)
    if (ev.seedTaken + confirmadas >= ev.capacity) {
      if (opts.alLlenar === 'rechazar') {
        throw conflict('EVENT_FULL', 'Este evento está completo')
      }
      // sobrevender: se entrega igual y se avisa. La plata ya está cobrada; el organizador
      // resuelve a mano (devolver o agrandar el cupo).
      console.error(
        '[eventSeats] SOBREVENTA: se confirma un lugar en un evento que ya está completo. ' +
          'Se entrega igual y hay que resolverlo a mano.',
        { eventId, deviceId, capacity: ev.capacity, ocupados: ev.seedTaken + confirmadas, ...opts.motivoLog },
      )
    }
  }

  if (previa) {
    await tx.registration.update({
      where: { id: previa.id },
      data: { status: 'confirmada', ts: new Date() },
    })
    return previa.id
  }
  const id = `reg_${randomUUID()}`
  await tx.registration.create({
    data: { id, deviceId, eventId, blockId: null, status: 'confirmada' },
  })
  return id
}
