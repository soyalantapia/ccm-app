/**
 * Arma el cobro de Checkout Pro. Calcula el monto DESDE LA BASE: el navegador nunca dice cuánto
 * cuesta algo. Cada preferencia lleva external_reference = Payment.id, que es lo que después
 * permite reconciliar el webhook sin ambigüedad.
 */
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { ApiError, notFound, conflict } from '../lib/errors.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { SOCIO_PRICE, priceForCampaign } from '../../../src/lib/pricing.js'
import type { AdSlot } from '@domain/types'

type PaymentKind = 'ticket_order' | 'membership' | 'ad_campaign'

interface Cobro {
  titulo: string
  monto: number
}

/** Qué se cobra y cuánto, según el tipo. Única función que decide montos. */
async function resolverCobro(kind: PaymentKind, resourceId: string): Promise<Cobro> {
  if (kind === 'ticket_order') {
    const orden = await prisma.ticketOrder.findUnique({ where: { id: resourceId } })
    if (!orden) throw notFound('RESOURCE_NOT_FOUND', 'La orden no existe')
    if (orden.status === 'confirmada') throw conflict('ALREADY_PAID', 'Esa orden ya está paga')
    return { titulo: `Entradas CCM · ${orden.qty}`, monto: orden.total }
  }
  if (kind === 'membership') {
    return { titulo: 'Membresía Socio CCM', monto: SOCIO_PRICE }
  }
  const camp = await prisma.adCampaign.findUnique({ where: { id: resourceId } })
  if (!camp) throw notFound('RESOURCE_NOT_FOUND', 'La campaña no existe')
  if (camp.status === 'activa') throw conflict('ALREADY_PAID', 'Esa campaña ya está paga')
  return {
    titulo: `Espacio publicitario ${camp.slot} · ${camp.hours} h`,
    monto: priceForCampaign(camp.slot as AdSlot, camp.hours),
  }
}

/** Base pública del server, para armar las URLs de vuelta y de aviso. */
function baseUrl(): string {
  return (env.MP_REDIRECT_URI ?? '').replace(/\/api\/v1\/mp\/callback$/, '')
}

export async function createCheckout(
  kind: PaymentKind,
  resourceId: string,
  deviceId?: string,
): Promise<{ initPoint: string; paymentId: string }> {
  // Primero el token: si no hay conexión, no queremos dejar un Payment huérfano en la base.
  const token = await getValidToken()
  const { titulo, monto } = await resolverCobro(kind, resourceId)

  const pago = await prisma.payment.create({
    data: { kind, resourceId, deviceId: deviceId ?? null, amount: monto, status: 'pending' },
  })

  try {
    const pref = await mpApi.createPreference(token, {
      items: [{ title: titulo, quantity: 1, unit_price: monto, currency_id: 'ARS' }],
      external_reference: pago.id,
      notification_url: `${baseUrl()}/api/v1/mp/webhook`,
      back_urls: {
        success: `${baseUrl()}/entradas?pago=ok`,
        pending: `${baseUrl()}/entradas?pago=pendiente`,
        failure: `${baseUrl()}/entradas?pago=error`,
      },
      auto_return: 'approved',
    })
    await prisma.payment.update({ where: { id: pago.id }, data: { mpPreferenceId: pref.id } })
    return { initPoint: pref.init_point, paymentId: pago.id }
  } catch (err) {
    // La preferencia no se creó: el Payment queda rechazado en vez de pendiente para siempre.
    await prisma.payment.update({ where: { id: pago.id }, data: { status: 'rejected' } }).catch(() => {})
    if (err instanceof ApiError) throw err
    throw new ApiError(502, 'MP_API_ERROR', 'No pudimos crear el cobro en Mercado Pago')
  }
}
