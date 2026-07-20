import { prisma } from '../lib/prisma.js'
import { toMembership } from '../lib/serialize.js'
import type { Membership } from '@domain/types'
import { SOCIO_PRICE } from '../../../src/lib/pricing.js'

/** Membresía del device (free por defecto si no hay fila). */
export async function getMembership(deviceId: string): Promise<Membership> {
  const m = await prisma.membership.findUnique({ where: { deviceId } })
  return m ? toMembership(m) : { tier: 'free', since: '', paid: 0 }
}

/**
 * Alta de Socio. El monto NO llega del cliente: antes `paid` venía en el body y alguien podía
 * hacerse Socio declarando que pagó 0. Cuando el cobro por MP esté activo, el webhook es quien
 * llama acá tras confirmar el pago real.
 */
export async function becomeSocio(deviceId: string, paid: number = SOCIO_PRICE): Promise<Membership> {
  const m = await prisma.membership.upsert({
    where: { deviceId },
    create: { deviceId, tier: 'socio', since: new Date(), paid },
    update: { tier: 'socio', since: new Date(), paid },
  })
  return toMembership(m)
}
