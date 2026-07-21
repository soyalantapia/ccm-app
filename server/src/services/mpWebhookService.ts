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
 * P0-B: orden de avance de la vida de un cobro. Los avisos de MP NO llegan ordenados (reintentos
 * superpuestos, un rechazo de un intento anterior que sale tarde, dos payment_id distintos sobre
 * la MISMA preferencia), así que "el último aviso que llegó" no es "lo último que pasó". La única
 * regla que hace falta para no perder plata es: un pago NUNCA retrocede. Concretamente, un
 * `approved` (que ya entregó la entrada / la membresía / la campaña) no puede volver a
 * `pending` ni a `rejected` — solo puede avanzar a `refunded`.
 *
 * `expired` y `rejected` comparten rango: los dos son "este intento terminó sin acreditarse" y
 * los dos liberan el índice único parcial Payment(kind,resourceId) WHERE status='pending'. Que
 * `pending` NO pueda pisar a `expired` es a propósito: si pudiera, un aviso tardío volvería a
 * trabar ese índice y el comprador no podría generar un cobro nuevo. Si ese pago igual termina
 * acreditándose, el `approved` entra igual (rango mayor) y se entrega.
 */
const RANGO_ESTADO: Record<string, number> = {
  pending: 0,
  expired: 1,
  rejected: 1,
  approved: 2,
  refunded: 3,
}

/** ¿La transición `actual → nuevo` avanza (o se queda igual), o es un retroceso que hay que descartar? */
function transicionPermitida(actual: string, nuevo: EstadoPago): boolean {
  return (RANGO_ESTADO[nuevo] ?? 0) >= (RANGO_ESTADO[actual] ?? 0)
}

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

    // P0-B: antes acá había un `update` INCONDICIONAL. Un aviso de OTRO payment_id de la misma
    // preferencia (el intento con la tarjeta que rebotó) o un aviso en vuelo que llega
    // desordenado pisaba un Payment `approved` YA ENTREGADO y lo dejaba en `rejected`/`pending`:
    // el cobro figuraba como fallido con la entrada en la mano, y encima volvía a trabar el
    // índice único de pendientes. Un pago aprobado no retrocede.
    if (!transicionPermitida(pago.status, estado)) {
      console.error(
        '[mpWebhookService] aviso descartado por retroceso de estado (llegó tarde o es de otro intento de pago)',
        { paymentId: pago.id, estadoActual: pago.status, estadoDelAviso: estado, mpPaymentId, estadoMp: pagoMp.status },
      )
      return
    }

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
    // `updateMany` gateado por el estado que acabamos de leer (bloqueo optimista), no `update`
    // por id: entre el `findUnique` de arriba y esta escritura puede colarse el aviso APROBADO
    // (otro request, en paralelo) y dejar el pago entregado. Con el estado en el `WHERE`, esa
    // carrera la pierde este aviso viejo en vez de pisar un `approved` — el chequeo de
    // `transicionPermitida` solo, sobre una lectura ya rancia, no alcanza.
    const escrito = await prisma.payment.updateMany({
      where: { id: pago.id, status: pago.status },
      data: { mpPaymentId, status: estado, raw: pagoMp as never },
    })
    if (escrito.count !== 1) {
      console.error(
        '[mpWebhookService] el estado del pago cambió mientras procesábamos este aviso: no se pisa nada',
        { paymentId: pago.id, estadoLeido: pago.status, estadoDelAviso: estado, mpPaymentId },
      )
    }
    return
  }

  // Defecto B.3: el guard de idempotencia y la decisión de QUIÉN activa son la MISMA operación
  // atómica — un `updateMany` (en vez de `findFirst` + `update` por `id`). Dos avisos
  // concurrentes del mismo pago (dos reintentos de MP superpuestos, o un reintento que llega
  // mientras el primero todavía está en vuelo) pueden pasar los dos por la misma lectura; con un
  // único `UPDATE ... WHERE` la base deja pasar a UNO SOLO (`count === 1`), el resto ve
  // `count === 0` y no activa nada.
  //
  // P0-A: el `WHERE` ya NO es `mpPaymentId IS NULL`, y lo que se reclama ya NO es el campo
  // `mpPaymentId` sino la TRANSICIÓN A `approved`. El guard viejo confundía "hay algún
  // mpPaymentId" con "este aviso ya se procesó", y son cosas distintas: una MISMA preferencia
  // (mismo external_reference = Payment.id) genera VARIOS payment_id en MP cuando el comprador
  // reintenta — la tarjeta rebota (payment_id 900, rechazado, ocupa el campo), después paga con
  // otra (payment_id 901, aprobado) y el aprobado se descartaba en silencio: plata cobrada,
  // entrada nunca entregada.
  //
  // Ojo con el arreglo "obvio" de gatear por `mpPaymentId <> este`: NO alcanza, porque el mismo
  // payment_id cambia de estado legítimamente. Un pago en efectivo llega primero como `pending`
  // (y esa rama YA guarda su mpPaymentId) y días después se acredita como `approved` con el
  // MISMO id: con ese guard, el aviso que acredita la plata quedaría afuera. La pregunta correcta
  // no es "¿conozco este payment_id?" sino "¿ESTA COMPRA ya se entregó?", y eso lo dice el
  // estado: `status notIn [approved, refunded]`.
  //
  // Ese mismo `WHERE` sigue siendo el gate de concurrencia (defecto B.3): un único
  // `UPDATE ... WHERE status NOT IN (...)` deja pasar a UNO SOLO de dos avisos superpuestos.
  //
  // Contrapartida asumida: como el claim marca `approved` ANTES de entregar, si el proceso se
  // CAE justo entre el claim y la entrega, el Payment queda `approved` sin entregar y los
  // reintentos de MP lo ven entregado. Es la misma ventana que ya tenía el claim por
  // `mpPaymentId` (un reintento tampoco podía volver a pasar), y toda falla que no sea una caída
  // dura se revierte abajo, en el `catch`.
  const claim = await prisma.payment.updateMany({
    where: { id: ref, status: { notIn: ['approved', 'refunded'] } },
    data: { mpPaymentId, status: 'approved' },
  })
  if (claim.count !== 1) {
    // No se pudo reclamar. Hay tres motivos posibles y solo uno amerita despertar a alguien.
    const actual = await prisma.payment.findUnique({ where: { id: ref } })
    if (actual && actual.status === 'approved' && actual.mpPaymentId !== mpPaymentId) {
      // DOS pagos aprobados distintos contra la misma compra: MP cobró dos veces de verdad (p.ej.
      // el comprador pagó el cupón de efectivo y además con tarjeta). No re-entregamos —eso está
      // bien— pero alguien tiene que devolver esa plata, así que no puede pasar en silencio.
      console.error(
        '[mpWebhookService] llegó un SEGUNDO pago aprobado para una compra ya entregada: revisar y devolver',
        { paymentId: ref, kind: actual.kind, resourceId: actual.resourceId, mpPaymentIdEntregado: actual.mpPaymentId, mpPaymentIdNuevo: mpPaymentId },
      )
    }
    // Los otros dos motivos son normales y no se loguean: (1) reintento de MP del MISMO aviso ya
    // procesado, (2) un aviso gemelo que en este instante está en vuelo y ya tomó el claim.
    return
  }

  const pago = await prisma.payment.findUnique({ where: { id: ref } })
  if (!pago) return // no debería pasar: el updateMany de arriba matcheó justo esta fila

  try {
    // Defecto B.1: lo que NO se puede es dar el pago por cerrado sin haber entregado. El claim de
    // arriba marcó `approved`, pero si `activar` falla (el recurso ya no existe → Prisma tira
    // P2025, o una membresía sin deviceId — ver el comentario en `activar`) el `catch` DESHACE
    // ese estado. Lo prohibido es que un fallo de entrega quede grabado como entregado: ahí
    // ningún reintento de MP volvería a intentar, y sería plata cobrada con producto jamás
    // entregado.
    await activar(pago.kind, pago.resourceId, pago.deviceId, pago.amount)
  } catch (err) {
    // No se pudo entregar: se deshace el claim (vuelve a `pending`, y `mpPaymentId` a null) para
    // que el PRÓXIMO reintento de MP —que llega porque la ruta devuelve 5xx, ver mp.ts, P0-C—
    // pueda volver a intentarlo, en vez de quedar trabado para siempre. Vuelve a `pending` y no a
    // `expired`: hay un pago aprobado de verdad dando vueltas, así que el comprador NO debería
    // poder generarse un segundo cobro para este recurso mientras tanto (índice único parcial).
    console.error(
      '[mpWebhookService] no se pudo activar un pago aprobado — se deshace el claim para que MP pueda reintentar',
      { paymentId: pago.id, kind: pago.kind, resourceId: pago.resourceId, deviceId: pago.deviceId, mpPaymentId },
      err instanceof Error ? err.stack : err,
    )
    await prisma.payment.updateMany({
      where: { id: pago.id, mpPaymentId },
      data: { mpPaymentId: null, status: 'pending' },
    })
    throw err
  }

  // Entregado. El estado ya quedó en `approved` con el claim; esto guarda el detalle del pago tal
  // como lo devolvió MP (queda para reconciliar a mano si alguna vez hay que discutir un cobro).
  await prisma.payment.update({
    where: { id: pago.id },
    data: { status: 'approved', raw: pagoMp as never },
  })
}
