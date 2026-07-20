/**
 * Recibe el aviso de pago de Mercado Pago.
 *
 * Tres cuidados, en este orden: (1) la firma, porque si no cualquiera avisa "esto se pagó" y se
 * lleva entradas gratis; (2) no creerle al cuerpo del mensaje — se consulta el estado real a MP;
 * (3) idempotencia, porque MP reintenta.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { becomeSocio } from './membershipService.js'

/**
 * Firma de MP: HMAC-SHA256 sobre "id:<dataId>;request-id:<reqId>;ts:<ts>;" con MP_WEBHOOK_SECRET.
 * Sin secreto configurado devuelve false: preferimos no procesar a procesar cualquier cosa.
 */
export function verificarFirma(headers: Record<string, string | undefined>, dataId: string): boolean {
  const secreto = env.MP_WEBHOOK_SECRET
  const firma = headers['x-signature']
  const requestId = headers['x-request-id']
  if (!secreto || !firma || !requestId) return false

  const partes = Object.fromEntries(
    firma.split(',').map((p) => p.split('=').map((s) => s.trim()) as [string, string]),
  )
  const ts = partes.ts
  const v1 = partes.v1
  if (!ts || !v1) return false

  const esperado = createHmac('sha256', secreto)
    .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
    .digest('hex')
  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(v1, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Activa lo que corresponda según el tipo de cobro. */
async function activar(kind: string, resourceId: string, deviceId: string | null, amount: number): Promise<void> {
  if (kind === 'ticket_order') {
    await prisma.ticketOrder.update({ where: { id: resourceId }, data: { status: 'confirmada' } })
    return
  }
  if (kind === 'membership') {
    if (deviceId) await becomeSocio(deviceId, amount)
    return
  }
  const camp = await prisma.adCampaign.findUnique({ where: { id: resourceId } })
  const horas = camp?.hours ?? 1
  const desde = new Date()
  await prisma.adCampaign.update({
    where: { id: resourceId },
    data: { status: 'activa', startsAt: desde, expiresAt: new Date(desde.getTime() + horas * 3600_000) },
  })
}

export async function handleNotification(mpPaymentId: string, firmaValida: boolean): Promise<void> {
  if (!firmaValida) return

  // Idempotencia: si ya guardamos este pago de MP, no volvemos a activar nada.
  const yaProcesado = await prisma.payment.findFirst({ where: { mpPaymentId } })
  if (yaProcesado) return

  const token = await getValidToken()
  const pagoMp = await mpApi.getPayment(token, mpPaymentId)
  const ref = pagoMp.external_reference
  if (!ref) return

  const pago = await prisma.payment.findUnique({ where: { id: ref } })
  if (!pago) return

  if (pagoMp.status !== 'approved') {
    // Efectivo/Rapipago llega como pending: se registra, pero NO se activa nada todavía.
    await prisma.payment.update({
      where: { id: pago.id },
      data: { mpPaymentId, status: pagoMp.status === 'rejected' ? 'rejected' : 'pending', raw: pagoMp as never },
    })
    return
  }

  await prisma.payment.update({
    where: { id: pago.id },
    data: { mpPaymentId, status: 'approved', raw: pagoMp as never },
  })
  await activar(pago.kind, pago.resourceId, pago.deviceId, pago.amount)
}
