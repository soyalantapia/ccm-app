/**
 * Recibe el aviso de pago de Mercado Pago.
 *
 * Cuidados, en este orden: (1) la firma, porque si no cualquiera avisa "esto se pagó" y se
 * lleva entradas gratis — probando los dos candidatos de request-id (ver `verificarFirma`,
 * defecto A del informe de la Tarea 5); (2) no creerle al cuerpo del mensaje — se consulta el
 * estado real a MP; (3) idempotencia, porque MP reintenta: el guard y la decisión de activar son
 * la MISMA operación atómica (ver el `updateMany` en `handleNotification`, defecto B); (4) activar
 * ANTES de marcar aprobado — si activar falla, el Payment no puede quedar en un estado que
 * bloquee el reintento (defecto B); (5) los estados de MP se mapean con intención, no por
 * descarte — un reverso o un vencimiento NO son "pendiente" (defecto C).
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
 *
 * Defecto A: este server corre DETRÁS DEL PROXY DE RAILWAY (ver el comentario "1 hop" en
 * app.ts). Railway reescribe el header entrante `X-Request-Id` y expone el valor ORIGINAL —el
 * que Mercado Pago usó para calcular la firma— como `X-Railway-Request-Id`. Si acá solo
 * mirásemos `x-request-id`, el `request-id` que ve el código NUNCA coincidiría con el que firmó
 * MP y la verificación fallaría para el 100% del tráfico real (síntoma silencioso: MP cobra,
 * nada se activa, cero rastro en el log). Por eso se prueban los DOS candidatos —cada uno con su
 * propia comparación tiempo-constante— y alcanza con que UNO valide. No "simplificar" esto a un
 * solo header sin releer este comentario: en local (sin proxy) solo existe `x-request-id`, así
 * que sigue andando igual ahí.
 */
export function verificarFirma(headers: Record<string, string | undefined>, dataId: string): boolean {
  const secreto = env.MP_WEBHOOK_SECRET
  const firma = headers['x-signature']
  if (!secreto || !firma) return false

  const partes = Object.fromEntries(
    firma.split(',').map((p) => p.split('=').map((s) => s.trim()) as [string, string]),
  )
  const ts = partes.ts
  const v1 = partes.v1
  if (!ts || !v1) return false

  const candidatosRequestId = [headers['x-request-id'], headers['x-railway-request-id']].filter(
    (v): v is string => !!v,
  )
  if (candidatosRequestId.length === 0) return false

  const b = Buffer.from(v1, 'utf8')
  for (const requestId of candidatosRequestId) {
    const esperado = createHmac('sha256', secreto)
      .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
      .digest('hex')
    const a = Buffer.from(esperado, 'utf8')
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}

type EstadoPago = 'approved' | 'pending' | 'rejected' | 'refunded'

/**
 * Mapea el estado de MP con INTENCIÓN, no por descarte (defecto C). Antes, todo lo que no era
 * 'approved'/'rejected' cayó en 'pending' — eso incluía reversos YA ENTREGADOS (refunded,
 * charged_back) y pagos en efectivo VENCIDOS (cancelled), con dos consecuencias reales: (1) un
 * pago aprobado y activado que se revierte quedaba re-etiquetado 'pending' sin que nadie lo note
 * (se entregó el producto habiendo devuelto la plata), y (2) un pago vencido quedaba 'pending'
 * para siempre y, por el índice único parcial Payment(kind,resourceId) WHERE status='pending',
 * ese comprador no podía generar un cobro nuevo NUNCA MÁS para ese recurso.
 */
function mapearEstado(estadoMp: string): EstadoPago {
  if (estadoMp === 'approved') return 'approved'
  if (estadoMp === 'rejected' || estadoMp === 'cancelled') return 'rejected'
  if (estadoMp === 'refunded' || estadoMp === 'charged_back') return 'refunded'
  // pending, in_process, authorized, in_mediation, y cualquier estado nuevo que MP sume mañana:
  // mejor pecar de conservador (pendiente) que inventarle un estado que no pedimos.
  return 'pending'
}

/**
 * Activa lo que corresponda según el tipo de cobro. TIRA si no pudo entregar de verdad — quien
 * llama (`handleNotification`) es el que decide qué hacer con eso (defecto B): soltar el claim
 * para que MP pueda reintentar, y dejar un log con contexto.
 */
async function activar(kind: string, resourceId: string, deviceId: string | null, amount: number): Promise<void> {
  if (kind === 'ticket_order') {
    // El pago puede cubrir varias órdenes: si el comprador eligió más de un tipo de entrada, se
    // creó una orden por tipo, todas con el mismo groupId, y mpCheckoutService cobró la SUMA en
    // un único pago registrado contra la orden ancla. Confirmar sólo el ancla dejaría las
    // hermanas sin entregar aunque estén pagas.
    const ancla = await prisma.ticketOrder.findUnique({ where: { id: resourceId } })
    if (!ancla) {
      // Que tire: el caller suelta el claim y loguea con contexto, así MP puede reintentar.
      throw new Error(`ticket_order ${resourceId} no existe: no se puede confirmar lo que se pagó`)
    }
    if (ancla.groupId) {
      const { count } = await prisma.ticketOrder.updateMany({
        where: { groupId: ancla.groupId, deviceId: ancla.deviceId, status: { not: 'confirmada' } },
        data: { status: 'confirmada' },
      })
      // Si el grupo ya estaba confirmado entero (reintento de MP), `count` da 0 y está bien.
      if (count === 0) await prisma.ticketOrder.update({ where: { id: resourceId }, data: { status: 'confirmada' } })
      return
    }
    await prisma.ticketOrder.update({ where: { id: resourceId }, data: { status: 'confirmada' } })
    return
  }
  if (kind === 'membership') {
    // Antes esto pasaba en silencio (`if (deviceId) await becomeSocio(...)` SIN `else`). Caso
    // real y concreto: Payment.device tiene `onDelete: SetNull` — si el Device se borra entre el
    // checkout y el aviso, `deviceId` queda null acá y la membresía nunca se activaba, sin dejar
    // ni un rastro. Ahora se trata como cualquier otra falla de activación: tira, y el caller
    // loguea con contexto y NO marca el pago como entregado.
    if (!deviceId) {
      throw new Error(`membership sin deviceId para resourceId=${resourceId}: no se puede activar (¿Device borrado?)`)
    }
    await becomeSocio(deviceId, amount)
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

  const token = await getValidToken()
  const pagoMp = await mpApi.getPayment(token, mpPaymentId)
  const ref = pagoMp.external_reference
  if (!ref) return

  const estado = mapearEstado(pagoMp.status)

  if (estado !== 'approved') {
    const pago = await prisma.payment.findUnique({ where: { id: ref } })
    if (!pago) return

    if (estado === 'refunded' && pago.status === 'approved') {
      // Defecto C: se revierte un pago que YA fue entregado. NO revocamos el recurso
      // automáticamente (es una decisión de negocio que no está definida — ver el informe de la
      // Tarea 5, queda pendiente del dueño del producto). Lo mínimo indispensable es dejar un
      // rastro accionable de qué quedó entregado con la plata devuelta.
      console.error(
        '[mpWebhookService] pago revertido DESPUÉS de haber sido entregado: el recurso sigue activo, alguien tiene que decidir si se revoca',
        { paymentId: pago.id, kind: pago.kind, resourceId: pago.resourceId, deviceId: pago.deviceId, mpPaymentId, estadoMp: pagoMp.status },
      )
    }

    // Efectivo/Rapipago llega como pending; un rechazo o un vencimiento liberan el índice único
    // de "pending" (pueden reintentar la compra); un reverso deja constancia de 'refunded'. En
    // ningún caso de esta rama se activa nada.
    //
    // ⚠️ NO escribir `mpPaymentId` acá. Ese campo es el candado de ENTREGA: el claim atómico de
    // más abajo activa sólo si está en null. Si esta rama lo llena, el `approved` que llega
    // después POR EL MISMO PAGO encuentra el candado tomado, sale por el `return` silencioso y no
    // entrega nunca. Eso rompía el 100% de los pagos en efectivo/Rapipago —MP avisa `pending` al
    // generar el cupón y `approved` cuando se acredita, sobre la misma fila— y también
    // `in_process` → `approved` de tarjeta en revisión: plata cobrada, entrada jamás entregada, y
    // ni una línea de log. El id de MP igual queda registrado (en `externalRef`, y entero dentro
    // de `raw`), así que no se pierde rastro para reconciliar.
    await prisma.payment.update({
      where: { id: pago.id },
      data: { externalRef: mpPaymentId, status: estado, raw: pagoMp as never },
    })
    return
  }

  // Defecto B.3: el guard de idempotencia y la decisión de QUIÉN activa son la MISMA operación
  // atómica — un `updateMany` gateado por `mpPaymentId: null` (en vez de `findFirst` + `update`
  // por `id`). Dos avisos concurrentes del mismo pago (dos reintentos de MP superpuestos, o un
  // reintento que llega mientras el primero todavía está en vuelo) pueden pasar los dos por una
  // lectura en null; con un único `UPDATE ... WHERE mpPaymentId IS NULL` la base deja pasar a
  // UNO SOLO (`count === 1`), el resto ve `count === 0` y no activa nada.
  const claim = await prisma.payment.updateMany({
    where: { id: ref, mpPaymentId: null },
    data: { mpPaymentId },
  })
  if (claim.count !== 1) return // ya reclamado: por este mismo aviso repetido o por uno concurrente

  const pago = await prisma.payment.findUnique({ where: { id: ref } })
  if (!pago) return // no debería pasar: el updateMany de arriba matcheó justo esta fila

  try {
    // Defecto B.1: ACTIVAR ANTES de marcar aprobado. Antes era al revés (primero
    // `status: 'approved'`, después `activar`) — si `activar` fallaba (el recurso ya no existe →
    // Prisma tira P2025) o no hacía nada en silencio (ver el comentario en `activar` sobre
    // membership), el Payment YA había quedado `approved`, y como el guard de idempotencia miraba
    // ese mismo estado, ningún reintento de MP volvía a intentar activar. Nunca: plata cobrada,
    // producto jamás entregado.
    await activar(pago.kind, pago.resourceId, pago.deviceId, pago.amount)
  } catch (err) {
    // No se pudo entregar: soltamos el claim (mpPaymentId vuelve a null) para que el PRÓXIMO
    // reintento de MP pueda volver a intentarlo, en vez de quedar trabado para siempre.
    console.error(
      '[mpWebhookService] no se pudo activar un pago aprobado — se libera el claim para que MP pueda reintentar',
      { paymentId: pago.id, kind: pago.kind, resourceId: pago.resourceId, deviceId: pago.deviceId, mpPaymentId },
      err instanceof Error ? err.stack : err,
    )
    await prisma.payment.updateMany({ where: { id: pago.id, mpPaymentId }, data: { mpPaymentId: null } })
    throw err
  }

  await prisma.payment.update({
    where: { id: pago.id },
    data: { status: 'approved', raw: pagoMp as never },
  })
}
