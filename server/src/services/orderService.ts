/**
 * Órdenes de entradas y campañas de publicidad autogestionada.
 *
 * Las tablas (TicketOrder, AdCampaign) existían en el esquema desde el diseño, pero no tenían
 * ni servicio ni rutas: el front las guardaba SOLO en localStorage. Resultado: cada visitante
 * veía sus propias compras y el panel del organizador mostraba las del navegador donde estaba
 * abierto, no las reales. Esto las conecta a la base.
 *
 * La confirmación de pago sigue siendo MANUAL (el organizador marca confirmada/cancelada desde
 * el panel). La conciliación automática por webhook de Mercado Pago es una fase aparte: no
 * cambia este modelo, agrega quién dispara el cambio de estado.
 */
import { prisma } from '../lib/prisma.js'
import { toTicketOrder, toAdCampaign } from '../lib/serialize.js'
import { notFound, badRequest } from '../lib/errors.js'
import type { TicketOrder, AdCampaign, OrderStatus } from '@domain/types'
import { priceForCampaign } from '../../../src/lib/pricing.js'

/* ─── Órdenes de entradas ─── */

/** Órdenes del device (lo que el usuario ve en "Mis entradas"). */
export async function getOrders(deviceId?: string): Promise<TicketOrder[]> {
  if (!deviceId) return []
  const rows = await prisma.ticketOrder.findMany({ where: { deviceId }, orderBy: { ts: 'desc' } })
  return rows.map(toTicketOrder)
}

/** TODAS las órdenes: es la vista del organizador. */
export async function getAllOrders(): Promise<TicketOrder[]> {
  const rows = await prisma.ticketOrder.findMany({ orderBy: { ts: 'desc' } })
  return rows.map(toTicketOrder)
}

interface NuevaOrden {
  id: string
  planId: string
  qty: number
  /** Compartido por las órdenes de una misma compra, para cobrarlas y confirmarlas juntas. */
  groupId?: string
  buyerName?: string
  buyerEmail?: string
}

/**
 * Alta de una orden. El TOTAL se calcula acá con el precio vigente en la base — nunca se toma
 * el que manda el cliente: si no, bastaba con editar el request para comprar una entrada VIP
 * a cualquier precio.
 */
export async function createOrder(input: NuevaOrden, deviceId?: string): Promise<TicketOrder> {
  const plan = await prisma.ticketPlan.findUnique({ where: { id: input.planId } })
  if (!plan) throw badRequest('PLAN_NOT_FOUND', 'El plan de entrada no existe')
  const qty = Math.max(1, Math.floor(input.qty || 1))
  const unit = (plan.price ?? 0) + (plan.serviceCharge ?? 0)

  const row = await prisma.ticketOrder.create({
    data: {
      id: input.id,
      planId: plan.id,
      deviceId: deviceId ?? null,
      groupId: input.groupId ?? null,
      qty,
      total: unit * qty,
      status: 'iniciada',
      buyerName: input.buyerName ?? null,
      buyerEmail: input.buyerEmail ?? null,
    },
  })
  return toTicketOrder(row)
}

/** Cambia el estado. `soloPropia` restringe al device dueño (el usuario solo marca "redirigida"). */
export async function setOrderStatus(
  orderId: string,
  status: OrderStatus,
  soloPropia?: { deviceId?: string },
): Promise<TicketOrder> {
  const actual = await prisma.ticketOrder.findUnique({ where: { id: orderId } })
  if (!actual) throw notFound('ORDER_NOT_FOUND', 'Orden no encontrada')
  if (soloPropia && actual.deviceId !== soloPropia.deviceId) {
    throw notFound('ORDER_NOT_FOUND', 'Orden no encontrada')
  }
  const row = await prisma.ticketOrder.update({ where: { id: orderId }, data: { status } })
  return toTicketOrder(row)
}

/* ─── Campañas de publicidad ─── */

export async function getCampaigns(): Promise<AdCampaign[]> {
  const rows = await prisma.adCampaign.findMany({ orderBy: { ts: 'asc' } })
  return rows.map(toAdCampaign)
}

interface NuevaCampania {
  id: string
  slot: AdCampaign['slot']
  brand: string
  headline: string
  cta?: string
  tagline?: string
  hours: number
  total: number
}

/** Compra de un espacio publicitario. Queda pendiente_pago hasta que el organizador confirme. */
export async function createCampaign(input: NuevaCampania): Promise<AdCampaign> {
  const row = await prisma.adCampaign.create({
    data: {
      id: input.id,
      slot: input.slot,
      brand: input.brand,
      headline: input.headline,
      cta: input.cta ?? null,
      tagline: input.tagline ?? null,
      hours: Math.max(1, Math.floor(input.hours || 1)),
      // El total lo recalcula el server: el que manda el cliente se ignora (mismo criterio que
      // las órdenes de entrada, donde se compraba una VIP a $1 editando el request).
      total: priceForCampaign(input.slot, input.hours),
      status: 'pendiente_pago',
    },
  })
  return toAdCampaign(row)
}
