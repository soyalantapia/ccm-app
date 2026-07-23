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
import { notFound, badRequest, conflict } from '../lib/errors.js'
import type { TicketOrder, AdCampaign, OrderStatus } from '@domain/types'
import { priceForCampaign } from '../../../src/lib/pricing.js'

/* ─── Órdenes de entradas ─── */

// El nombre y el tipo de la entrada viajan con la orden: del lado del comprador una entrada
// retirada de la venta no se resuelve contra /plans (que la excluye), y sin esto vería el id
// crudo y su credencial VIP bajaría a "Entrada general". El server sí ve las retiradas.
const CON_PLAN = { plan: { select: { name: true, kind: true } } } as const

/** Órdenes del device (lo que el usuario ve en "Mis entradas"). */
export async function getOrders(deviceId?: string): Promise<TicketOrder[]> {
  if (!deviceId) return []
  const rows = await prisma.ticketOrder.findMany({
    where: { deviceId },
    orderBy: { ts: 'desc' },
    include: CON_PLAN,
  })
  return rows.map(toTicketOrder)
}

/** TODAS las órdenes: es la vista del organizador. */
export async function getAllOrders(): Promise<TicketOrder[]> {
  const rows = await prisma.ticketOrder.findMany({ orderBy: { ts: 'desc' }, include: CON_PLAN })
  return rows.map(toTicketOrder)
}

interface NuevaOrden {
  id: string
  planId: string
  qty: number
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
  // Una entrada RETIRADA de la venta no toma órdenes nuevas. El selector ya la esconde, pero
  // apagar el botón es cosmético: el POST /orders sigue abierto y con el id del plan —que no es
  // secreto— se crearía una orden igual, y después un cobro. Es el mismo agujero que el precio y
  // el candado de Socios venían a tapar en la inscripción. Las órdenes creadas ANTES de retirar
  // siguen siendo pagables (el comprador ya estaba en el flujo): el corte es sobre las nuevas.
  if (plan.archived) throw conflict('PLAN_ARCHIVED', 'Esta entrada ya no está a la venta.')
  const qty = Math.max(1, Math.floor(input.qty || 1))
  const unit = (plan.price ?? 0) + (plan.serviceCharge ?? 0)

  const row = await prisma.ticketOrder.create({
    data: {
      id: input.id,
      planId: plan.id,
      deviceId: deviceId ?? null,
      qty,
      total: unit * qty,
      status: 'iniciada',
      buyerName: input.buyerName ?? null,
      buyerEmail: input.buyerEmail ?? null,
    },
  })
  // Ya tenemos el plan cargado: la orden vuelve con su nombre y tipo, para que la vista optimista
  // del comprador no dependa de re-resolverlo (y no rompa si después se retira).
  return toTicketOrder({ ...row, plan: { name: plan.name, kind: plan.kind } })
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
  const row = await prisma.ticketOrder.update({
    where: { id: orderId },
    data: { status },
    include: CON_PLAN,
  })
  return toTicketOrder(row)
}

/* ─── Campañas de publicidad ─── */

/**
 * Las campañas que van AL AIRE. Alimenta `GET /api/v1/campaigns`, que es público.
 *
 * Filtra por estado a propósito: `createCampaign` deja toda campaña nueva en `pendiente_pago` y
 * recién el webhook de Mercado Pago la pasa a `activa`. Sin este `where`, ese circuito de cobro
 * no servía de nada — cualquier visitante hacía un POST y su aviso ocupaba el splash de apertura
 * al instante, gratis, desplazando al sponsor que sí había pagado (el front se queda con la
 * última campaña de cada slot).
 *
 * El vencimiento va en el mismo filtro: una campaña que compró 24 h no puede seguir al aire al
 * tercer día. `expiresAt` null significa "sin vencimiento", no "ya venció".
 */
export async function getCampaigns(): Promise<AdCampaign[]> {
  const rows = await prisma.adCampaign.findMany({
    where: {
      status: 'activa',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { ts: 'asc' },
  })
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
