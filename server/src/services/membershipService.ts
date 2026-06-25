import { prisma } from '../lib/prisma.js'
import { toMembership } from '../lib/serialize.js'
import type { Membership } from '@domain/types'

/** Membresía del device (free por defecto si no hay fila). */
export async function getMembership(deviceId: string): Promise<Membership> {
  const m = await prisma.membership.findUnique({ where: { deviceId } })
  return m ? toMembership(m) : { tier: 'free', since: '', paid: 0 }
}

/**
 * Alta de Socio CCM. Persiste la membresía server-side (antes vivía solo en localStorage,
 * por eso el gate socioOnly del backend rechazaba a TODOS). 🔶 El cobro real entra con la
 * Fase D (Mercado Pago); por ahora `paid` es el monto declarado por el flujo demo.
 */
export async function becomeSocio(deviceId: string, paid: number): Promise<Membership> {
  const m = await prisma.membership.upsert({
    where: { deviceId },
    create: { deviceId, tier: 'socio', since: new Date(), paid },
    update: { tier: 'socio', since: new Date(), paid },
  })
  return toMembership(m)
}
