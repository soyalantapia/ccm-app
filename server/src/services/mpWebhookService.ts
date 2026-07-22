/**
 * Recibe el aviso de pago de Mercado Pago.
 *
 * Cuidados, en este orden: (1) la firma, porque si no cualquiera avisa "esto se pagó" y se
 * lleva entradas gratis — probando los dos candidatos de request-id (ver `verificarFirma`,
 * defecto A del informe de la Tarea 5); (2) no creerle al cuerpo del mensaje — se consulta el
 * estado real a MP; (3) idempotencia, porque MP reintenta: el guard y la decisión de activar son
 * la MISMA operación atómica (ver el `updateMany` en `handleNotification`, defecto B); (4) un
 * fallo de entrega NUNCA queda grabado como entregado — el claim marca `approved` para elegir un
 * único procesador, pero si activar falla se DESHACE (vuelve a `pending`) y la ruta devuelve 5xx
 * para que MP reintente (defecto B); (5) los estados de MP se mapean con intención, no por
 * descarte — un reverso o un vencimiento NO son "pendiente" (defecto C); (6) un cobro cubre N
 * líneas y se entregan de a una, marcando `PaymentItem.deliveredAt`, así una entrega parcial es
 * reanudable y el reintento no re-activa lo ya entregado.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { becomeSocio } from './membershipService.js'
import { cerrarPago, cerrarPagoSiSigueEn } from './mpPaymentState.js'
import { ESTADOS_MP_CON_PLATA_VIVA } from './mpEstados.js'
// Type-only: se borra en la compilación (verbatimModuleSyntax), así que NO crea dependencia de
// runtime con el checkout ni afecta a los mocks de los tests.
import type { PaymentKind } from './mpCheckoutService.js'

/** Log del bloqueo optimista: el estado del pago cambió mientras procesábamos este aviso. */
function avisarCarreraDeEstado(paymentId: string, estadoLeido: string, estadoDelAviso: string, mpPaymentId: string): void {
  console.error(
    '[mpWebhookService] el estado del pago cambió mientras procesábamos este aviso: no se pisa nada',
    { paymentId, estadoLeido, estadoDelAviso, mpPaymentId },
  )
}

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
 * Los valores del enum PaymentStatus de la base (los de `EstadoPago` más `expired`). Se escribe a
 * mano en vez de importar el tipo generado por Prisma para no meterle a este módulo un import de
 * `@prisma/client` — mismo criterio que `EstadoCerrado` en mpPaymentState.ts.
 */
type EstadoEnBase = EstadoPago | 'expired'

/** Una línea del cobro, con lo mínimo que necesitan los helpers de abajo. */
type LineaDelCobro = { kind: PaymentKind; resourceId: string; amount: number }

/** Cabecera + líneas, tal como la devuelve el `findUnique ... include: { items: true }`. */
type CobroConLineas = { id: string; deviceId: string | null; items: LineaDelCobro[] }

/**
 * P0-B: orden de avance de la vida de un cobro. Los avisos de MP NO llegan ordenados (reintentos
 * superpuestos, un rechazo de un intento anterior que sale tarde, dos payment_id distintos sobre
 * la MISMA preferencia), así que "el último aviso que llegó" no es "lo último que pasó". La única
 * regla que hace falta para no perder plata es: un pago NUNCA retrocede. Concretamente, un
 * `approved` (que ya entregó la entrada / la membresía / la campaña) no puede volver a
 * `pending` ni a `rejected` — solo puede avanzar a `refunded`.
 *
 * `expired` y `rejected` comparten rango: los dos son "este intento terminó sin acreditarse" y
 * los dos liberan el índice único parcial PaymentItem(kind,resourceId) WHERE "closedAt" IS NULL. Que
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
 * para siempre y, por el índice único parcial PaymentItem(kind,resourceId) WHERE "closedAt" IS NULL,
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

/** Subconjunto del cliente Prisma que usa `activar` — así acepta tanto `prisma` como un `tx`. */
type ClientePrisma = Pick<
  typeof prisma,
  'ticketOrder' | 'adCampaign' | 'membership' | 'registration' | '$queryRaw'
>

/**
 * Activa lo que corresponda según el tipo de cobro. TIRA si no pudo entregar de verdad — quien
 * llama (`handleNotification`) es el que decide qué hacer con eso (defecto B): soltar el claim
 * para que MP pueda reintentar, y dejar un log con contexto.
 *
 * Recibe el cliente por parámetro para poder correr dentro de la MISMA transacción que marca la
 * línea como entregada (`PaymentItem.deliveredAt`): si se entregara fuera de la transacción,
 * una caída en el medio dejaría el recurso activo y la línea sin marcar, y el reintento de MP
 * volvería a activar (en `ad_campaign` eso regala horas de aire, porque pisa startsAt/expiresAt).
 */
async function activar(
  tx: ClientePrisma,
  kind: string,
  resourceId: string,
  deviceId: string | null,
  amount: number,
): Promise<void> {
  if (kind === 'ticket_order') {
    await tx.ticketOrder.update({ where: { id: resourceId }, data: { status: 'confirmada' } })
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
    await becomeSocio(deviceId, amount, tx)
    return
  }
  if (kind === 'event') {
    // Entregar un evento pago = crear la inscripción. Dos cosas que NO se pueden hacer acá:
    //
    // 1. Llamar a register(): abre su propia transacción y no vería esta, así que la inscripción
    //    quedaría fuera del mismo commit que marca la línea como entregada. Si algo falla en el
    //    medio, el comprador queda pago y sin lugar (o al revés).
    // 2. Un create pelado: MP reenvía el aviso seguido, y el @@unique(deviceId,eventId,blockId)
    //    NO protege este caso porque blockId es null y en Postgres dos NULL se consideran
    //    distintos dentro de un índice único. Dos avisos = dos inscripciones = dos QR.
    //
    // Por eso se replica el lock que ya usa register() para el camino sin bloque: se bloquea la
    // fila del Event, se busca una inscripción previa del device y recién ahí se crea o reactiva.
    if (!deviceId) {
      throw new Error(`event sin deviceId para resourceId=${resourceId}: no se puede inscribir (¿Device borrado?)`)
    }
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${resourceId} FOR UPDATE`
    const previa = await tx.registration.findFirst({
      where: { deviceId, eventId: resourceId, blockId: null },
    })
    if (previa?.status === 'confirmada') return // ya entregado: el reintento de MP no duplica
    if (previa) {
      await tx.registration.update({
        where: { id: previa.id },
        data: { status: 'confirmada', ts: new Date() },
      })
      return
    }
    await tx.registration.create({
      data: {
        id: `reg_${randomUUID()}`,
        deviceId,
        eventId: resourceId,
        blockId: null,
        status: 'confirmada',
      },
    })
    return
  }
  const camp = await tx.adCampaign.findUnique({ where: { id: resourceId } })
  const horas = camp?.hours ?? 1
  const desde = new Date()
  await tx.adCampaign.update({
    where: { id: resourceId },
    data: { status: 'activa', startsAt: desde, expiresAt: new Date(desde.getTime() + horas * 3600_000) },
  })
}

/**
 * ¿MP conoce algún pago VIVO para esta preferencia? Tres respuestas, no dos: `no_se` (la consulta
 * falló) NO es `no`. Quien llama tiene que tratar `no_se` como `si` — fail-closed: trabar un
 * recurso un rato es recuperable, cobrar dos veces no.
 */
async function hayPlataVivaEnMp(token: string, paymentId: string): Promise<'si' | 'no' | 'no_se'> {
  try {
    const pagos = await mpApi.searchPaymentsByExternalReference(token, paymentId)
    return pagos.some((p) => ESTADOS_MP_CON_PLATA_VIVA.has(p.status)) ? 'si' : 'no'
  } catch (err) {
    console.error(
      '[mpWebhookService] no se pudo consultar a MP si quedan pagos vivos para este cobro: NO se liberan las líneas (fail-closed)',
      { paymentId },
      err instanceof Error ? err.message : err,
    )
    return 'no_se'
  }
}

/**
 * Reclama la entrega de este cobro y devuelve EL ESTADO QUE TENÍA ANTES del claim (o `null` si no
 * lo pudo reclamar).
 *
 * Devolver el estado previo no es un detalle: es lo que permite DESHACER bien si la entrega falla.
 * Antes el claim era un `updateMany ... WHERE status NOT IN (approved, refunded)` y el `catch`
 * revertía a `pending` FIJO, sin saber de dónde venía; si el cobro estaba `rejected`/`expired`
 * —líneas ya cerradas— eso dejaba la cabecera viva con las líneas muertas, que es el lado
 * peligroso de romper el invariante del espejo (ver `deshacerClaim`).
 *
 * Y se lee DENTRO de la misma transacción que reclama, gateando el `UPDATE` por ese estado exacto:
 * un `findUnique` suelto de antes podría estar rancio y hacernos revertir al estado equivocado.
 * Como gate de concurrencia es igual de fuerte que el `notIn` anterior — un único
 * `UPDATE ... WHERE status = <el que leí>` deja pasar a UNO SOLO de dos avisos superpuestos.
 */
async function reclamarParaEntregar(ref: string, mpPaymentId: string): Promise<EstadoEnBase | null> {
  return prisma.$transaction(async (tx) => {
    const actual = await tx.payment.findUnique({ where: { id: ref } })
    if (!actual) return null
    // La pregunta correcta no es "¿conozco este payment_id?" sino "¿ESTA COMPRA ya se entregó?",
    // y eso lo dice el estado (ver el comentario largo de P0-A más abajo).
    if (actual.status === 'approved' || actual.status === 'refunded') return null
    const claim = await tx.payment.updateMany({
      where: { id: ref, status: actual.status },
      data: { mpPaymentId, status: 'approved' },
    })
    return claim.count === 1 ? actual.status : null
  })
}

/**
 * Deshace el claim cuando la entrega falló. La regla es una sola: **la cabecera sigue a las
 * líneas**, nunca al revés.
 *
 * Por qué así y no "revertir al estado previo y punto" (las dos opciones que había sobre la mesa):
 * el estado previo puede haber dejado de ser compatible con las líneas mientras entregábamos. Dos
 * caminos reales llegan ahí:
 *   1. el cobro venía de `rejected`/`expired` (líneas YA cerradas) y llegó el `approved` tarde;
 *   2. por CARRERA: entre el claim (cabecera `approved`, líneas todavía vivas) y el cierre final,
 *      un checkout concurrente corre `repararEspejo` y cierra esas líneas.
 * En los dos, volver a `pending` a ciegas deja cabecera VIVA con líneas MUERTAS — y esa
 * combinación es la peor de todas: `buscarCobrosVivos` y `vencerPendientesAbandonados` filtran por
 * `closedAt: null` y no la ven, `repararEspejo` solo sabe cerrar líneas (no reabrirlas) y no la
 * repara, y el recurso queda libre mientras hay un pago aprobado de verdad en MP. Doble cobro en
 * silencio.
 *
 * La otra alternativa —forzar las líneas a que sigan a la cabecera— exigiría REABRIR líneas
 * (`closedAt: null`), y eso puede violar el índice único parcial si en el medio otro cobro ya se
 * quedó con el recurso: un P2002 en pleno camino de recuperación, justo cuando menos podemos
 * darnos el lujo de fallar. Derivar la cabecera de las líneas nunca puede fallar por unicidad.
 *
 * Resultado: el invariante `closedAt IS NULL ⟺ status = 'pending'` se cumple SIEMPRE, y el
 * reintento de MP puede volver a entregar desde cualquiera de los dos estados de salida (ni
 * `pending` ni los terminales bloquean el próximo claim).
 */
async function deshacerClaim(
  pago: CobroConLineas,
  estadoPrevio: EstadoEnBase,
  mpPaymentId: string,
): Promise<void> {
  const vivas = await prisma.paymentItem.count({ where: { paymentId: pago.id, closedAt: null } })
  // Con líneas vivas el cobro sigue vivo (`pending`) y el recurso queda reservado: es lo que
  // impide que el comprador se genere un segundo cobro mientras hay plata aprobada dando vueltas.
  // Sin líneas vivas la cabecera tiene que ser terminal; se respeta la etiqueta original
  // (`rejected`/`expired`) y solo se inventa `expired` si venía de `pending`, que ya no aplica.
  const destino: EstadoEnBase = vivas > 0 ? 'pending' : estadoPrevio === 'pending' ? 'expired' : estadoPrevio

  const cabecera = await prisma.payment.updateMany({
    where: { id: pago.id, mpPaymentId, status: 'approved' },
    data: { mpPaymentId: null, status: destino },
  })
  // Si no matcheó, otro proceso ya movió esta fila: no se pisa nada.
  if (cabecera.count !== 1) return

  if (destino !== 'pending') {
    // Quedó un recurso LIBRE con un pago aprobado de verdad en MP. No es un estado corrupto (el
    // invariante se cumple) pero sí uno que alguien tiene que mirar: el reintento de MP puede
    // entregar, y hasta que eso pase el recurso se puede vender de nuevo.
    console.error(
      '[mpWebhookService] ALERTA DOBLE COBRO: se soltó el claim de un pago APROBADO y las líneas ya estaban cerradas, así que el recurso quedó libre con plata cobrada en MP',
      {
        paymentId: pago.id,
        estadoPrevio,
        estadoFinal: destino,
        mpPaymentId,
        deviceId: pago.deviceId,
        recursos: pago.items.map((i) => ({ kind: i.kind, resourceId: i.resourceId, amount: i.amount })),
      },
    )
    return
  }

  // Cinturón y tirantes para la ventana entre el conteo y la escritura de arriba: si justo ahí un
  // checkout concurrente cerró las líneas, la cabecera acaba de quedar `pending` sobre líneas
  // muertas — el estado que este arreglo existe para impedir, y el único que nadie más repara. Se
  // vuelve a mirar, se corrige moviendo la cabecera a terminal, y se grita.
  const vivasDespues = await prisma.paymentItem.count({ where: { paymentId: pago.id, closedAt: null } })
  if (vivasDespues > 0) return
  await prisma.payment.updateMany({ where: { id: pago.id, status: 'pending' }, data: { status: 'expired' } })
  console.error(
    '[mpWebhookService] ALERTA DOBLE COBRO: las líneas se cerraron mientras se soltaba el claim de un pago aprobado; se cierra también la cabecera para no dejar el espejo roto',
    { paymentId: pago.id, mpPaymentId, recursos: pago.items.map((i) => ({ kind: i.kind, resourceId: i.resourceId })) },
  )
}

/**
 * Detección del DOBLE COBRO REPARTIDO EN DOS FILAS Payment.
 *
 * El grito de "SEGUNDO pago aprobado" que ya existía solo salta cuando los dos `approved` caen en
 * la MISMA fila Payment. Pero el caso más probable es el otro: el comprador reintenta dentro de la
 * misma preferencia después de un rechazo, y como el rechazo liberó las líneas también se armó un
 * cobro NUEVO. Terminan dos filas Payment aprobadas sobre el mismo recurso, cada una con su claim
 * impecable, y hoy eso no dispara absolutamente nada.
 *
 * Acá se pregunta lo único que importa: ¿alguno de estos recursos ya lo entregó OTRA fila? Es
 * puro rastro — no cambia lo que se entrega (revocar o no es una decisión de negocio, igual que
 * en el caso `refunded`), pero deja el incidente escrito con nombre y apellido para poder
 * devolver la plata. Nunca tira: un fallo del detector no puede frenar una entrega legítima.
 */
async function avisarSiOtroCobroYaEntrego(pago: CobroConLineas, mpPaymentId: string): Promise<void> {
  try {
    const yaEntregadas = await prisma.paymentItem.findMany({
      where: {
        paymentId: { not: pago.id },
        deliveredAt: { not: null },
        OR: pago.items.map((i) => ({ kind: i.kind, resourceId: i.resourceId })),
      },
      select: { paymentId: true, kind: true, resourceId: true, amount: true, deliveredAt: true },
    })
    if (yaEntregadas.length === 0) return
    console.error(
      '[mpWebhookService] ALERTA DOBLE COBRO: llegó un pago aprobado por recursos que OTRO cobro ya entregó — hay dos cobros distintos sobre lo mismo, alguien tiene que devolver esa plata',
      {
        paymentId: pago.id,
        mpPaymentId,
        deviceId: pago.deviceId,
        yaEntregadoPorOtroCobro: yaEntregadas,
      },
    )
  } catch (err) {
    console.error('[mpWebhookService] no se pudo chequear si otro cobro ya entregó estos recursos', { paymentId: pago.id }, err)
  }
}

export async function handleNotification(mpPaymentId: string, firmaValida: boolean): Promise<void> {
  if (!firmaValida) return

  const token = await getValidToken()
  const pagoMp = await mpApi.getPayment(token, mpPaymentId)
  const ref = pagoMp.external_reference
  if (!ref) return

  const estado = mapearEstado(pagoMp.status)

  if (estado !== 'approved') {
    const pago = await prisma.payment.findUnique({ where: { id: ref }, include: { items: true } })
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
        '[mpWebhookService] pago revertido DESPUÉS de haber sido entregado: los recursos siguen activos, alguien tiene que decidir si se revocan',
        {
          paymentId: pago.id,
          deviceId: pago.deviceId,
          mpPaymentId,
          estadoMp: pagoMp.status,
          // TODAS las líneas entregadas, no una sola: un cobro puede cubrir varias órdenes y el
          // operador necesita la lista completa de lo que hay que revocar (o no).
          entregado: pago.items
            .filter((i) => i.deliveredAt !== null)
            .map((i) => ({ kind: i.kind, resourceId: i.resourceId, amount: i.amount })),
        },
      )
    }

    if (estado === 'pending') {
      // Efectivo/Rapipago: el cobro sigue VIVO. Se escribe SOLO la cabecera (nunca `cerrarPago`):
      // las líneas quedan con `closedAt = null` y el recurso sigue reservado hasta que se
      // acredite o venza. Cerrarlas acá liberaría el índice y el comprador podría generarse un
      // segundo cobro por lo mismo.
      //
      // `updateMany` gateado por el estado que acabamos de leer (bloqueo optimista), no `update`
      // por id: entre el `findUnique` de arriba y esta escritura puede colarse el aviso APROBADO
      // (otro request, en paralelo) y dejar el pago entregado. Con el estado en el `WHERE`, esa
      // carrera la pierde este aviso viejo en vez de pisar un `approved` — el chequeo de
      // `transicionPermitida` solo, sobre una lectura ya rancia, no alcanza.
      const escrito = await prisma.payment.updateMany({
        where: { id: pago.id, status: pago.status },
        data: { mpPaymentId, status: 'pending', raw: pagoMp as never },
      })
      if (escrito.count !== 1) avisarCarreraDeEstado(pago.id, pago.status, estado, mpPaymentId)
      return
    }

    // HUECO HERMANO: un `rejected` NO alcanza para dar el cobro por muerto. En Checkout Pro el
    // comprador puede reintentar DENTRO DE LA MISMA PREFERENCIA después de que le rebota una
    // tarjeta. Si al primer rechazo liberamos las líneas, ese mismo comprador puede además armarse
    // un cobro NUEVO por lo mismo y terminar pagando los dos: dos filas Payment aprobadas sobre el
    // mismo recurso. Antes de liberar se le pregunta a MP —la única fuente que sabe si quedó plata
    // en juego— igual que hace `vencerPendientesAbandonados` antes de vencer.
    //
    // Solo aplica cuando el cobro está `pending`, que es el único estado en el que las líneas
    // están vivas: sobre un cobro ya terminal, "mantenerlo vivo" rompería el espejo.
    if (estado === 'rejected' && pago.status === 'pending') {
      const plataViva = await hayPlataVivaEnMp(token, pago.id)
      if (plataViva !== 'no') {
        // Se guarda el detalle de MP y NADA MÁS: la cabecera sigue `pending` y las líneas vivas,
        // así el recurso queda reservado hasta que el intento en curso se acredite o venza.
        //
        // ⚠️ NO se graba `mpPaymentId`. `vencerPendientesAbandonados` filtra por `mpPaymentId: null`
        // para elegir candidatos: anotarle acá el id del pago RECHAZADO sacaría esta fila de esa
        // lista para siempre y el recurso quedaría trabado sin nada que lo destrabe. Dejándolo en
        // null, el próximo checkout vuelve a preguntarle a MP y el caso se resuelve solo.
        const escrito = await prisma.payment.updateMany({
          where: { id: pago.id, status: 'pending' },
          data: { raw: pagoMp as never },
        })
        if (escrito.count !== 1) avisarCarreraDeEstado(pago.id, pago.status, estado, mpPaymentId)
        return
      }
    }

    // rejected / refunded: el cobro terminó. Cabecera y líneas se cierran JUNTAS (`cerrarPago…`),
    // que es lo que libera el índice único parcial y deja al comprador reintentar la compra.
    const cerrado = await cerrarPagoSiSigueEn(pago.id, pago.status, estado, { mpPaymentId, raw: pagoMp as never })
    if (!cerrado) avisarCarreraDeEstado(pago.id, pago.status, estado, mpPaymentId)
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
  //
  // El claim devuelve EL ESTADO PREVIO (ver `reclamarParaEntregar`), que es lo que le permite a
  // `deshacerClaim` no romper el espejo si la entrega falla.
  const estadoPrevio = await reclamarParaEntregar(ref, mpPaymentId)
  if (estadoPrevio === null) {
    // No se pudo reclamar. Hay tres motivos posibles y solo uno amerita despertar a alguien.
    const actual = await prisma.payment.findUnique({ where: { id: ref }, include: { items: true } })
    if (actual && actual.status === 'approved' && actual.mpPaymentId !== mpPaymentId) {
      // DOS pagos aprobados distintos contra la misma compra: MP cobró dos veces de verdad (p.ej.
      // el comprador pagó el cupón de efectivo y además con tarjeta). No re-entregamos —eso está
      // bien— pero alguien tiene que devolver esa plata, así que no puede pasar en silencio.
      console.error(
        '[mpWebhookService] llegó un SEGUNDO pago aprobado para una compra ya entregada: revisar y devolver',
        {
          paymentId: ref,
          items: actual.items.map((i) => ({ kind: i.kind, resourceId: i.resourceId, amount: i.amount })),
          mpPaymentIdEntregado: actual.mpPaymentId,
          mpPaymentIdNuevo: mpPaymentId,
        },
      )
    }
    // Los otros dos motivos son normales y no se loguean: (1) reintento de MP del MISMO aviso ya
    // procesado, (2) un aviso gemelo que en este instante está en vuelo y ya tomó el claim.
    return
  }

  const pago = await prisma.payment.findUnique({ where: { id: ref }, include: { items: true } })
  if (!pago) return // no debería pasar: el updateMany de arriba matcheó justo esta fila

  // Antes de entregar: ¿estos recursos ya los entregó OTRA fila Payment? Si sí, esto es un doble
  // cobro repartido y no puede pasar en silencio.
  await avisarSiOtroCobroYaEntrego(pago, mpPaymentId)

  // Entrega LÍNEA POR LÍNEA (un cobro puede cubrir varias órdenes). Cada línea se entrega y se
  // marca en la MISMA transacción, así que una entrega parcial queda registrada: el reintento de
  // MP saltea lo ya entregado en vez de re-activarlo. Antes de `deliveredAt`, un reintento sobre
  // `ad_campaign` volvía a pisar startsAt/expiresAt (regalando horas de aire) y `becomeSocio`
  // volvía a pisar `since`.
  const noEntregadas = pago.items.filter((i) => i.deliveredAt === null)
  for (const linea of noEntregadas) {
    try {
      // Defecto B.1: lo que NO se puede es dar el pago por cerrado sin haber entregado. El claim
      // de arriba marcó `approved`, pero si `activar` falla (el recurso ya no existe → Prisma
      // tira P2025, o una membresía sin deviceId — ver el comentario en `activar`) el `catch`
      // DESHACE ese estado. Lo prohibido es que un fallo de entrega quede grabado como entregado:
      // ahí ningún reintento de MP volvería a intentar, y sería plata cobrada con producto jamás
      // entregado.
      await prisma.$transaction(async (tx) => {
        await activar(tx, linea.kind, linea.resourceId, pago.deviceId, linea.amount)
        await tx.paymentItem.update({ where: { id: linea.id }, data: { deliveredAt: new Date() } })
      })
    } catch (err) {
      // No se pudo entregar ESTA línea: se deshace el claim (se suelta `mpPaymentId` y la
      // cabecera sale de `approved`) para que el PRÓXIMO reintento de MP —que llega porque la
      // ruta devuelve 5xx, ver mp.ts, P0-C— pueda volver a intentarlo, en vez de quedar trabado
      // para siempre. A qué estado vuelve NO es fijo: lo decide `deshacerClaim` mirando las
      // líneas, para que el espejo `closedAt` nunca quede roto (ahí está el porqué completo).
      //
      // Las líneas que YA se entregaron en esta pasada conservan su `deliveredAt`: son entregas
      // reales, no hay que deshacerlas ni repetirlas.
      console.error(
        '[mpWebhookService] no se pudo activar una línea de un pago aprobado — se deshace el claim para que MP pueda reintentar',
        {
          paymentId: pago.id,
          lineaQueFalló: { kind: linea.kind, resourceId: linea.resourceId },
          entregadas: pago.items.filter((i) => i.deliveredAt !== null).map((i) => `${i.kind}:${i.resourceId}`),
          sinEntregar: noEntregadas.map((i) => `${i.kind}:${i.resourceId}`),
          deviceId: pago.deviceId,
          mpPaymentId,
        },
        err instanceof Error ? err.stack : err,
      )
      await deshacerClaim(pago, estadoPrevio, mpPaymentId)
      throw err
    }
  }

  // Todo entregado. `cerrarPago` (y no un `update` suelto) porque además de guardar el detalle
  // que devolvió MP hay que SELLAR las líneas (`closedAt`): el claim de arriba dejó la cabecera
  // en `approved` con las líneas todavía vivas, y ese hueco es la única ventana en la que el
  // invariante del espejo queda abierto. Si el proceso se cae justo acá, lo repara el barrido de
  // `repararEspejo` en el próximo checkout de esos recursos.
  await cerrarPago(pago.id, 'approved', { raw: pagoMp as never })
}
