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

/**
 * Qué se cobra y cuánto, según el tipo. Única función que decide montos, y también dónde se
 * verifica de quién es el recurso: `deviceId` es el device autenticado (dueño del token), no
 * algo que mande el body. POST /devices emite tokens sin credenciales, así que sin este chequeo
 * cualquiera podía generar un cobro para la orden de otra persona.
 */
async function resolverCobro(kind: PaymentKind, resourceId: string, deviceId?: string): Promise<Cobro> {
  if (kind === 'ticket_order') {
    const orden = await prisma.ticketOrder.findUnique({ where: { id: resourceId } })
    // Mismo patrón que orderService.setOrderStatus (parámetro soloPropia): si la orden es de
    // otro device, respondemos EXACTAMENTE lo mismo que si no existiera. Si distinguiéramos
    // "no existe" de "no es tuya", cualquiera podría enumerar qué órdenes existen mirando cuál
    // de los dos errores le llega.
    if (!orden || orden.deviceId !== deviceId) throw notFound('RESOURCE_NOT_FOUND', 'La orden no existe')
    if (orden.status === 'confirmada') throw conflict('ALREADY_PAID', 'Esa orden ya está paga')
    return { titulo: `Entradas CCM · ${orden.qty}`, monto: orden.total }
  }
  if (kind === 'membership') {
    // El resourceId ES el device que paga (no hay una fila de "membresía" separada donde
    // mirar pertenencia): si no coincide con el device autenticado, no se deja pagar la
    // membresía de otro.
    if (resourceId !== deviceId) throw notFound('RESOURCE_NOT_FOUND', 'La membresía no existe')
    return { titulo: 'Membresía Socio CCM', monto: SOCIO_PRICE }
  }
  // ad_campaign: el modelo AdCampaign NO tiene deviceId en el schema, así que acá no hay
  // pertenencia que verificar — es un gap conocido (decisión explícita, no un olvido): con el
  // modelo actual, cualquier device autenticado puede generar el cobro de cualquier campaña
  // existente. Si más adelante hace falta restringirlo, primero hay que sumarle deviceId a
  // AdCampaign.
  const camp = await prisma.adCampaign.findUnique({ where: { id: resourceId } })
  if (!camp) throw notFound('RESOURCE_NOT_FOUND', 'La campaña no existe')
  if (camp.status === 'activa') throw conflict('ALREADY_PAID', 'Esa campaña ya está paga')
  return {
    titulo: `Espacio publicitario ${camp.slot} · ${camp.hours} h`,
    monto: priceForCampaign(camp.slot as AdSlot, camp.hours),
  }
}

/**
 * Base pública del server, para armar las URLs de vuelta y de aviso. Mismo patrón que
 * adminAuth.ts (publicBase): PUBLIC_BASE_URL ya existe en el proyecto para esto exacto. Antes
 * se recortaba un sufijo de MP_REDIRECT_URI con un regex anclado — fragil (si la variable no
 * estaba seteada la base quedaba vacía, y con otra forma el regex no matcheaba) y la
 * consecuencia real era que MP nunca podía entregar el aviso de pago.
 */
function baseUrl(): string {
  return (env.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
}

export async function createCheckout(
  kind: PaymentKind,
  resourceId: string,
  deviceId?: string,
): Promise<{ initPoint: string; paymentId: string }> {
  // Primero el token: si no hay conexión, no queremos dejar un Payment huérfano en la base.
  const token = await getValidToken()
  const { titulo, monto } = await resolverCobro(kind, resourceId, deviceId)

  // Reusar preferencia existente si ya hay una viva: sin esto, pedir el link dos veces (doble
  // clic, dos pestañas, un reintento del navegador) crea DOS preferencias distintas en MP — si
  // el comprador termina pagando ambas, se le cobra dos veces de verdad. El guard ALREADY_PAID
  // de resolverCobro llega tarde: recién actúa cuando la orden ya quedó confirmada.
  const existente = await prisma.payment.findFirst({
    where: { kind, resourceId, status: 'pending', mpPreferenceId: { not: null } },
    orderBy: { createdAt: 'desc' },
  })
  if (existente?.initPoint) {
    return { initPoint: existente.initPoint, paymentId: existente.id }
  }

  const pago = await prisma.payment.create({
    data: { kind, resourceId, deviceId: deviceId ?? null, amount: monto, status: 'pending' },
  })

  let pref: { id: string; init_point: string }
  try {
    pref = await mpApi.createPreference(token, {
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
  } catch (err) {
    // Acá sí falló CREAR la preferencia: no quedó nada vivo en MP, así que el Payment se puede
    // marcar rechazado sin miedo a etiquetar mal un cobro que en realidad existe.
    try {
      await prisma.payment.update({ where: { id: pago.id }, data: { status: 'rejected' } })
    } catch (marcarErr) {
      // Si ni esto se pudo guardar, el Payment queda pending para siempre sin una sola línea
      // de rastro — lo mínimo es dejar constancia en el log.
      console.error('[mpCheckoutService] no se pudo marcar el Payment como rejected tras el fallo de MP', pago.id, marcarErr)
    }
    if (err instanceof ApiError) throw err
    throw new ApiError(502, 'MP_API_ERROR', 'No pudimos crear el cobro en Mercado Pago')
  }

  // La preferencia YA se creó y está viva en MP. Si de acá para abajo algo falla, NO hay que
  // marcar el Payment como rechazado: quedaría plata cobrable (la preferencia sigue ahí, alguien
  // puede pagarla) etiquetada como rechazada. Es reconciliable — existe mpPreferenceId — así que
  // alcanza con loguearlo y devolver igual el initPoint, que es lo que el comprador necesita.
  try {
    await prisma.payment.update({
      where: { id: pago.id },
      data: { mpPreferenceId: pref.id, initPoint: pref.init_point },
    })
  } catch (guardarErr) {
    console.error(
      `[mpCheckoutService] la preferencia ${pref.id} se creó en MP pero no se pudo guardar en el Payment ${pago.id} (reconciliable por mpPreferenceId)`,
      guardarErr,
    )
  }

  return { initPoint: pref.init_point, paymentId: pago.id }
}
