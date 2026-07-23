/**
 * Arma el cobro de Checkout Pro. Calcula el monto DESDE LA BASE: el navegador nunca dice cuánto
 * cuesta algo. Cada preferencia lleva external_reference = Payment.id, que es lo que después
 * permite reconciliar el webhook sin ambigüedad.
 *
 * Un cobro cubre N recursos (N líneas = N filas PaymentItem, UNA sola preferencia de MP): el
 * comprador que elige dos planes VIP paga una vez el total que ve en pantalla. Antes había una
 * preferencia por orden y el front solo podía mandar a MP un link, así que se cobraba la primera
 * orden y se regalaban las demás.
 */
import { prisma } from '../lib/prisma.js'
import { publicBase } from '../lib/publicUrl.js'
import { ApiError, notFound, conflict, badRequest } from '../lib/errors.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { cerrarPago } from './mpPaymentState.js'
import { ESTADOS_MP_CON_PLATA_VIVA } from './mpEstados.js'
import { SOCIO_PRICE, priceForCampaign } from '../../../src/lib/pricing.js'
import type { AdSlot } from '@domain/types'

export type PaymentKind = 'ticket_order' | 'membership' | 'ad_campaign' | 'event'

/** Lo que pide el comprador: qué recursos quiere pagar. Sin monto (lo calcula el server). */
export interface LineaPedida {
  kind: PaymentKind
  resourceId: string
}

/** Una línea ya resuelta contra la base: con su título y su monto reales. */
export interface LineaResuelta extends LineaPedida {
  titulo: string
  amount: number
}

export interface ResultadoCheckout {
  paymentId: string
  initPoint: string
  /**
   * Lo que MP va a cobrar. Se devuelve a propósito: es la red de contención barata contra esta
   * misma clase de bug — si el server cobra distinto de lo que el comprador vio en pantalla, el
   * front NO redirige. Cuando se reusa un cobro ya vivo, este `amount` es el de ESE cobro (lo
   * que la preferencia realmente cobra), no la suma recalculada: si los precios cambiaron en el
   * medio, lo correcto es que el front frene, no que le mintamos.
   */
  amount: number
  items: LineaResuelta[]
}

/** Tope de líneas por cobro. Más que esto no es un carrito, es un abuso del endpoint. */
export const MAX_LINEAS = 10

/**
 * Qué se cobra y cuánto, según el tipo. Única función que decide montos, y también dónde se
 * verifica de quién es el recurso: `deviceId` es el device autenticado (dueño del token), no
 * algo que mande el body. POST /devices emite tokens sin credenciales, así que sin este chequeo
 * cualquiera podía generar un cobro para la orden de otra persona.
 */
async function resolverCobro(kind: PaymentKind, resourceId: string, deviceId?: string): Promise<LineaResuelta> {
  const linea = await resolverCrudo(kind, resourceId, deviceId)
  // Un `unit_price: 0` lo rechaza MP con un 400 genérico, y lo que ve el comprador es un
  // "no pudimos crear el cobro" sin explicación. Puede pasar de verdad: `plan.price` es opcional
  // en el dominio (`plan.price ?? 0`) y una campaña de 0 horas también daría 0.
  if (!Number.isFinite(linea.amount) || linea.amount <= 0) {
    throw new ApiError(502, 'MP_API_ERROR', 'No pudimos crear el cobro en Mercado Pago')
  }
  return linea
}

async function resolverCrudo(kind: PaymentKind, resourceId: string, deviceId?: string): Promise<LineaResuelta> {
  if (kind === 'ticket_order') {
    const orden = await prisma.ticketOrder.findUnique({ where: { id: resourceId } })
    // Mismo patrón que orderService.setOrderStatus (parámetro soloPropia): si la orden es de
    // otro device, respondemos EXACTAMENTE lo mismo que si no existiera. Si distinguiéramos
    // "no existe" de "no es tuya", cualquiera podría enumerar qué órdenes existen mirando cuál
    // de los dos errores le llega.
    if (!orden || orden.deviceId !== deviceId) throw notFound('RESOURCE_NOT_FOUND', 'La orden no existe')
    if (orden.status === 'confirmada') throw conflict('ALREADY_PAID', 'Esa orden ya está paga')
    return { kind, resourceId, titulo: `Entradas CCM · ${orden.qty}`, amount: orden.total }
  }
  if (kind === 'membership') {
    // El resourceId ES el device que paga (no hay una fila de "membresía" separada donde
    // mirar pertenencia): si no coincide con el device autenticado, no se deja pagar la
    // membresía de otro.
    if (resourceId !== deviceId) throw notFound('RESOURCE_NOT_FOUND', 'La membresía no existe')
    // Guard de "ya sos socio", que hasta ahora no existía (ticket_order y ad_campaign sí tenían
    // el suyo): sin esto, un socio activo podía generarse un cobro de membresía y pagar dos
    // veces lo mismo.
    const membresia = await prisma.membership.findUnique({ where: { deviceId: resourceId } })
    if (membresia?.tier === 'socio') throw conflict('ALREADY_PAID', 'Ya sos Socio CCM')
    return { kind, resourceId, titulo: 'Membresía Socio CCM', amount: SOCIO_PRICE }
  }
  if (kind === 'event') {
    // Un evento con precio se vende solo, sin fila de TicketPlan. Los guards son los mismos que
    // los de register(), y en el mismo orden, para que comprar y anotarse no digan cosas
    // distintas sobre el mismo evento.
    const ev = await prisma.event.findUnique({ where: { id: resourceId } })
    // Borrador o inexistente responden igual: un evento sin publicar no se puede comprar ni
    // sondear desde afuera.
    if (!ev || !ev.published) throw notFound('RESOURCE_NOT_FOUND', 'El evento no existe')
    if (ev.past) throw conflict('EVENT_PAST', 'Este evento ya finalizó')
    // Sin precio NO es gratis: es "todavía no está a la venta". Dejarlo pasar generaría un cobro
    // de $0 que MP rechaza con un 400 genérico, y el comprador vería un error sin explicación.
    if (ev.price == null) throw conflict('EVENT_NOT_FOR_SALE', 'Este evento todavía no está a la venta')
    if (!deviceId) throw notFound('RESOURCE_NOT_FOUND', 'El evento no existe')
    // Ya inscripto = ya pago: mismo patrón de guard que ticket_order y membership. Sin esto,
    // alguien podía pagar dos veces el mismo workshop.
    const yaInscripto = await prisma.registration.findFirst({
      where: { deviceId, eventId: resourceId, blockId: null, status: 'confirmada' },
    })
    if (yaInscripto) throw conflict('ALREADY_PAID', 'Ya tenés tu lugar en este evento')
    return { kind, resourceId, titulo: ev.title, amount: ev.price }
  }
  // ad_campaign: el modelo AdCampaign NO tiene deviceId en el schema, así que acá no hay
  // pertenencia que verificar — es un gap conocido (decisión explícita, no un olvido): con el
  // modelo actual, cualquier device autenticado puede generar el cobro de cualquier campaña
  // existente. Por eso, además, `normalizarLineas` rechaza `ad_campaign` en carritos de más de
  // una línea: la forma multi-línea vuelve ese gap más explotable (meter la campaña de otro
  // adentro del propio carrito y activársela de paso). Cuando AdCampaign tenga deviceId se puede
  // levantar esa restricción.
  const camp = await prisma.adCampaign.findUnique({ where: { id: resourceId } })
  if (!camp) throw notFound('RESOURCE_NOT_FOUND', 'La campaña no existe')
  if (camp.status === 'activa') throw conflict('ALREADY_PAID', 'Esa campaña ya está paga')
  return {
    kind,
    resourceId,
    titulo: `Espacio publicitario ${camp.slot} · ${camp.hours} h`,
    amount: priceForCampaign(camp.slot as AdSlot, camp.hours),
  }
}

/** Base pública del server, para armar las URLs de vuelta y de aviso. Ver lib/publicUrl.ts. */
const baseUrl = publicBase

/** Duerme `ms` milisegundos. Usado para los backoffs cortos de los defectos A y B. */
function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Prisma reporta la violación de un índice único (acá, el parcial de la migración
 * 9_ticket_multi_order_payment sobre PaymentItem) con `code: 'P2002'`. Duck-typing en vez de
 * `instanceof Prisma.PrismaClientKnownRequestError` para no meter un import de valor de
 * `@prisma/client` solo para esto — mismo criterio que ya usa `middlewares/error.ts`.
 */
function esViolacionDeUnicidad(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'P2002'
}

/** Clave estable de una línea, para comparar conjuntos sin depender del orden. */
function clave(l: { kind: string; resourceId: string }): string {
  return `${l.kind}:${l.resourceId}`
}

/** Firma de un conjunto de líneas: ordenada, así dos carritos iguales dan el mismo string. */
function firmaConjunto(lineas: { kind: string; resourceId: string }[]): string {
  return lineas.map(clave).sort().join('|')
}

// Cuántas veces reintentar la LECTURA tras perder la carrera de `create` (defecto A) y cuánto
// esperar entre intento e intento: 300ms le sobra de margen a los ~50-300ms que tarda un
// `createPreference` real contra MP, así que el que perdió la carrera casi siempre alcanza a
// leer el `initPoint` que guardó el que ganó, en vez de cortar con 409.
const REINTENTOS_LECTURA_GANADOR = 3
const ESPERA_ENTRE_REINTENTOS_LECTURA_MS = 300

// Backoff corto para reintentar GUARDAR mpPreferenceId/initPoint (defecto B, punto 1): la
// mayoría de estos fallos son transitorios (un blip de conexión a la base), así que vale la
// pena un par de reintentos antes de resignarse a tirar el `pref.id` a la basura para siempre.
const ESPERAS_GUARDADO_PREFERENCIA_MS = [0, 50, 150]

// Ventana en la que un Payment `pending` SIN mpPreferenceId cuenta como "recién creado, puede
// tener una preferencia viva en MP que todavía no llegamos a guardar" (defecto B, punto 2). Es
// deliberadamente generosa ("unos minutos"): mejor pedirle al comprador que reintente un rato
// después que arriesgarse a generarle un segundo link pagable.
const VENTANA_RIESGO_SIN_PREFERENCIA_MS = 5 * 60_000

// Umbral de vencimiento para un Payment `pending` abandonado: cierra el efecto colateral del
// índice único parcial. Sale de la vida útil acotada de las preferencias de Checkout Pro: pasada
// esta ventana no vale la pena seguir tratando la preferencia vieja como "todavía puede
// completarse en cualquier momento". Subirlo alarga cuánto tiempo un comprador legítimo que
// volvió tarde sigue viendo "hay un cobro en curso" en vez de un link nuevo; bajarlo arriesga
// vencer una preferencia que el comprador todavía tiene abierta en otra pestaña.
const UMBRAL_VENCIMIENTO_PENDIENTE_MS = 30 * 60_000

/**
 * Cuántos candidatos consulta contra MP UN checkout. El barrido corre en el CAMINO CALIENTE de la
 * compra —el comprador está esperando su link— así que su costo tiene que estar acotado por
 * diseño, no por suerte.
 *
 * Por qué 3: el índice único parcial garantiza como mucho UNA línea viva por recurso, así que la
 * cantidad de candidatos está acotada por el tamaño del carrito (≤ MAX_LINEAS = 10). El carrito
 * real es de 1 o 2 líneas casi siempre; 3 cubre esa distribución entera y deja el peor caso en 3
 * consultas en vez de 10. Lo que queda sin barrer no se pierde: este barrido es PEREZOSO —el
 * próximo intento de compra sobre esos recursos lo vuelve a intentar— así que "no terminar en una
 * pasada" es un retraso, no una falla.
 */
export const TOPE_CANDIDATOS_POR_CHECKOUT = 3

/**
 * Timeout propio para la consulta de vencimiento, mucho más corto que el general de 10 s de mpApi.
 *
 * Por qué 3 s: acá del otro lado hay una persona esperando el link de pago, y el valor de esperar
 * cae a plomo con el tiempo. `/v1/payments/search` normalmente contesta en cientos de ms; 3 s ya
 * es ~10× eso, o sea que si no contestó es que algo anda mal, no que está por contestar. Y el
 * costo de cortar es bajo: fail-closed significa que el cobro viejo no se vence esta vez —se
 * reintenta en el próximo checkout— mientras que esperar 10 s le arruina la compra a alguien que
 * no tiene nada que ver. El tope general de 10 s se mantiene donde la latencia no la sufre nadie
 * (OAuth, createPreference, el getPayment del webhook).
 *
 * Combinado con el tope y el paralelismo: peor caso 3 s de demora agregada, contra los 10 s × N
 * secuenciales de antes (hasta 100 s con un carrito de 10).
 */
export const TIMEOUT_CONSULTA_VENCIMIENTO_MS = 3_000

/**
 * Cuántas consultas fallidas SEGUIDAS hacen falta para considerar que esto es un incidente y no un
 * blip. Una sola falla es ruido (un timeout suelto, un 500 de MP); tres seguidas significan que
 * `/v1/payments/search` está caído de forma sostenida — y ESA es la condición peligrosa, porque el
 * fail-closed (correcto) deja de vencer NADA y va trabando recursos en silencio, uno por comprador
 * que abandona. Sin este contador, el único rastro era un `console.error` por incidente, que es
 * exactamente igual de visible que el de una falla aislada e inofensiva.
 */
export const FALLOS_CONSECUTIVOS_PARA_ALERTAR = 3

/**
 * Salud de la consulta de vencimiento contra MP. Objeto MUTABLE exportado a propósito (mismo
 * criterio que `webhookConfig` en routes/mp.ts): es estado de proceso, y así los tests pueden
 * ponerlo en cero sin recargar el módulo.
 */
export const saludDeLaConsultaAMp = {
  /** Consultas fallidas SEGUIDAS. Una sola consulta exitosa lo vuelve a 0. */
  fallosConsecutivos: 0,
  /** Desde cuándo viene fallando: sin esto, "3 fallos" no distingue 3 segundos de 3 días. */
  desde: null as Date | null,
}

/** Registra el resultado de una consulta y grita si el fail-closed se volvió sostenido. */
function registrarConsultaAMp(ok: boolean, paymentId: string): void {
  if (ok) {
    saludDeLaConsultaAMp.fallosConsecutivos = 0
    saludDeLaConsultaAMp.desde = null
    return
  }
  saludDeLaConsultaAMp.fallosConsecutivos += 1
  saludDeLaConsultaAMp.desde ??= new Date()
  if (saludDeLaConsultaAMp.fallosConsecutivos < FALLOS_CONSECUTIVOS_PARA_ALERTAR) return
  console.error(
    '[mpCheckoutService] ALERTA: la consulta de pagos a Mercado Pago viene fallando de forma sostenida. El vencimiento de pendientes está fail-closed, así que los recursos abandonados NO se están liberando y los compradores van a empezar a ver "ya tenés un pago en curso" sin poder comprar. Revisar credenciales/estado de MP.',
    {
      fallosConsecutivos: saludDeLaConsultaAMp.fallosConsecutivos,
      desde: saludDeLaConsultaAMp.desde,
      ultimoPaymentId: paymentId,
    },
  )
}

/**
 * Vence los Payment `pending` abandonados que toquen alguno de estos recursos, para que dejen de
 * trabar el índice único parcial de PaymentItem.
 *
 * ⚠️ EL COMENTARIO QUE ESTABA ACÁ ANTES ERA FALSO, Y LA MENTIRA COSTABA PLATA. Afirmaba que
 * filtrar por `mpPaymentId: null` alcanzaba para no tocar nunca un pago en efectivo en curso,
 * "porque el webhook setea mpPaymentId apenas MP reporta cualquier estado". El error: `mpPaymentId`
 * se puebla RECIÉN cuando el aviso de MP se procesa. Entre que el comprador genera el cupón de
 * Rapipago y que ese aviso llega —segundos en el caso feliz, HORAS si el webhook falla y MP lo
 * reintenta con backoff, o nunca si el secreto está mal configurado— la fila sigue con
 * `mpPaymentId: null` y era candidata a vencer a los 30 minutos. Consecuencia real: se liberaba
 * el índice, el comprador generaba un segundo cobro, y cuando MP acreditaba el efectivo quedaba
 * plata cobrada contra un Payment muerto y sin entregar.
 *
 * Por eso el vencimiento ya NO se decide solo con lo que tenemos en la base: antes de vencer se
 * le PREGUNTA A MP si conoce algún pago vivo para ese `external_reference` (= Payment.id). MP es
 * la fuente de verdad de si hay plata en juego; nuestro espejo puede estar atrasado. Si la
 * consulta a MP falla, NO se vence (fail-closed): trabar un recurso un rato más es recuperable,
 * cobrar dos veces no.
 *
 * `mpPaymentId: null` se mantiene como filtro, pero ahora por lo que realmente es: un atajo
 * barato — si YA sabemos de un pago concreto, ni hace falta preguntar.
 *
 * El vencimiento es por Payment ENTERO, nunca por línea suelta: si un cobro de 2 órdenes se
 * abandona, vencen las 2 líneas juntas y quedan libres las 2. Vencer una sola dejaría un Payment
 * pending cuya suma ya no corresponde a lo que MP va a cobrar.
 *
 * Perezoso a propósito, no un job de fondo: este server corre en un solo contenedor de Railway
 * sin scheduler — un `setInterval` se pierde en cada redeploy y se duplicaría con más de una
 * réplica. El propio intento de compra siguiente es el momento natural para esta limpieza.
 */
async function vencerPendientesAbandonados(pares: LineaPedida[], token: string): Promise<void> {
  const candidatos = await prisma.payment.findMany({
    where: {
      status: 'pending',
      mpPaymentId: null,
      createdAt: { lt: new Date(Date.now() - UMBRAL_VENCIMIENTO_PENDIENTE_MS) },
      items: { some: { closedAt: null, OR: pares } },
    },
    select: { id: true },
    // Los más VIEJOS primero: son los que con más probabilidad están realmente abandonados, y son
    // los que conviene atacar si el tope de abajo deja alguno afuera.
    orderBy: { createdAt: 'asc' },
    take: TOPE_CANDIDATOS_POR_CHECKOUT,
  })

  // En PARALELO, no en un `for` secuencial: cada vuelta puede costar hasta un timeout entero, y
  // encadenarlas convertía el peor caso en 10 s × N con el comprador esperando el link. Son
  // consultas independientes sobre Payments distintos, así que no hay ningún orden que respetar.
  await Promise.all(candidatos.map(({ id }) => vencerSiMpNoConoceNingunPagoVivo(id, token)))
}

/** Un candidato: pregunta a MP y, solo si no hay plata en juego, lo vence. */
async function vencerSiMpNoConoceNingunPagoVivo(id: string, token: string): Promise<void> {
  let pagosEnMp: { id: number; status: string }[]
  try {
    pagosEnMp = await mpApi.searchPaymentsByExternalReference(token, id, TIMEOUT_CONSULTA_VENCIMIENTO_MS)
    registrarConsultaAMp(true, id)
  } catch (err) {
    // Fail-closed: si no podemos confirmar con MP que no hay plata en juego, no vencemos.
    console.error(
      '[mpCheckoutService] no se pudo consultar a MP si el cobro tiene pagos vivos: NO se vence (se prefiere trabar el recurso un rato antes que arriesgar un doble cobro)',
      { paymentId: id },
      err instanceof Error ? err.message : err,
    )
    // El fail-closed en sí está bien; lo que no puede pasar es que sea INVISIBLE cuando se vuelve
    // sostenido (ahí deja de liberar recursos y nadie se entera hasta que un comprador se queja de
    // que no puede comprar).
    registrarConsultaAMp(false, id)
    return
  }

  const vivo = pagosEnMp.find((p) => ESTADOS_MP_CON_PLATA_VIVA.has(p.status))
  if (vivo) {
    // Hay un pago real dando vueltas que nuestro webhook nunca llegó a registrar (el caso típico:
    // cupón de Rapipago generado y aviso todavía en vuelo). Se anota el mpPaymentId para que la
    // próxima vez ni haga falta preguntar, y el cobro queda VIVO.
    await prisma.payment.updateMany({
      where: { id, status: 'pending', mpPaymentId: null },
      data: { mpPaymentId: String(vivo.id) },
    })
    if (vivo.status === 'approved') {
      console.error(
        '[mpCheckoutService] MP tiene un pago APROBADO para un cobro que acá figura pending: se perdió un aviso del webhook, hay que entregar a mano o forzar el reenvío',
        { paymentId: id, mpPaymentId: vivo.id },
      )
    }
    return
  }

  // Ningún pago vivo en MP: el comprador se fue. Cabecera y líneas se cierran JUNTAS, y el `where`
  // vuelve a exigir las mismas condiciones para que una carrera contra el webhook la pierda este
  // vencimiento, no el pago.
  await prisma.$transaction(async (tx) => {
    const cabecera = await tx.payment.updateMany({
      where: { id, status: 'pending', mpPaymentId: null },
      data: { status: 'expired' },
    })
    if (cabecera.count !== 1) return
    await tx.paymentItem.updateMany({ where: { paymentId: id, closedAt: null }, data: { closedAt: new Date() } })
  })
}

/**
 * Barrido de reparación defensivo del espejo `closedAt`. El invariante
 * (`closedAt IS NULL` ⟺ `Payment.status = 'pending'`) lo sostiene el código, no la base: si
 * alguna vez se rompe, una línea viva sobre un cobro ya muerto traba ese recurso PARA SIEMPRE, y
 * el síntoma es un comprador que no puede pagar nunca más sin ningún error visible. Corregirlo
 * acá cuesta una consulta y saca a esa clase entera de bug de la categoría "irrecuperable".
 */
async function repararEspejo(pares: LineaPedida[]): Promise<void> {
  const huerfanas = await prisma.paymentItem.findMany({
    where: { closedAt: null, OR: pares, payment: { status: { not: 'pending' } } },
    select: { id: true, paymentId: true },
  })
  if (huerfanas.length === 0) return
  console.error(
    '[mpCheckoutService] líneas de cobro VIVAS sobre un Payment que ya no está pending: el espejo closedAt se desincronizó, se repara',
    huerfanas,
  )
  await prisma.paymentItem.updateMany({
    where: { id: { in: huerfanas.map((h) => h.id) }, closedAt: null },
    data: { closedAt: new Date() },
  })
}

/**
 * Cobros `pending` que tocan alguno de estos recursos con una línea VIVA. Devuelve como mucho N
 * filas: el índice único parcial garantiza una sola línea viva por recurso.
 */
function buscarCobrosVivos(pares: LineaPedida[]) {
  return prisma.payment.findMany({
    where: { status: 'pending', items: { some: { closedAt: null, OR: pares } } },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Reintenta el `update` que guarda mpPreferenceId/initPoint con backoff corto. Devuelve `true`
 * si algún intento guardó con éxito, `false` si los agotó todos. Nunca tira: quien llama decide
 * qué hacer si no se pudo guardar (la preferencia YA está viva en MP, así que no hay que marcar
 * nada como rechazado — ver comentario más abajo).
 */
async function guardarPreferenciaConReintentos(paymentId: string, pref: { id: string; init_point: string }): Promise<boolean> {
  for (const espera of ESPERAS_GUARDADO_PREFERENCIA_MS) {
    if (espera > 0) await dormir(espera)
    try {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { mpPreferenceId: pref.id, initPoint: pref.init_point },
      })
      return true
    } catch {
      // Sigue al próximo intento (o se resigna si este era el último) — se loguea afuera, una
      // sola vez, para no ensuciar el log con cada intento fallido.
    }
  }
  return false
}

/** Las líneas VIVAS de un cobro (las que el índice está protegiendo ahora mismo). */
function lineasVivas(pago: { items: { kind: string; resourceId: string; closedAt: Date | null }[] }) {
  return pago.items.filter((i) => i.closedAt === null)
}

/** 409 con el link del cobro que está trabando: el front puede ofrecer "retomar el pago en curso". */
function cobroSolapado(pago: { id: string; initPoint: string | null }): ApiError {
  return conflict(
    'COBRO_SOLAPADO',
    'Ya tenés un pago en curso que incluye alguna de estas entradas. Terminá ese pago o esperá unos minutos para armar uno nuevo.',
    { paymentId: pago.id, initPoint: pago.initPoint },
  )
}

/**
 * Normaliza y valida el pedido: 1..MAX_LINEAS líneas, sin duplicados, ordenadas ASC.
 *
 * El ORDEN determinístico no es cosmético: es lo que evita deadlocks entre dos carritos que se
 * solapan. Si un request inserta (o1, o2) y otro (o2, o1) al mismo tiempo, cada uno toma el
 * índice de la línea que el otro necesita y Postgres tiene que matar a uno. Insertando siempre
 * en el mismo orden, el segundo choca contra la primera línea y falla limpio con P2002.
 *
 * Los duplicados dentro del MISMO request son 400, no deduplicación silenciosa: si se dedujeran,
 * el comprador podría pedir "esta orden dos veces" y recibir un cobro por una sola sin enterarse.
 * Y sin este chequeo, el índice chocaría contra vos mismo y el error parecería una carrera.
 */
export function normalizarLineas(items: LineaPedida[]): LineaPedida[] {
  if (items.length === 0) throw badRequest('VALIDATION_ERROR', 'No hay nada para cobrar')
  if (items.length > MAX_LINEAS) {
    throw badRequest('VALIDATION_ERROR', `No se pueden pagar más de ${MAX_LINEAS} cosas en un mismo cobro`)
  }
  const vistas = new Set<string>()
  for (const it of items) {
    const k = clave(it)
    if (vistas.has(k)) throw badRequest('VALIDATION_ERROR', 'Hay un ítem repetido en el pedido')
    vistas.add(k)
  }
  if (items.length > 1 && items.some((i) => i.kind === 'ad_campaign')) {
    // Ver el comentario de `resolverCrudo`: AdCampaign no tiene dueño en el modelo, así que
    // dejarla entrar a un carrito multi-línea permitiría pagar (y activar) la campaña de otro
    // como efecto colateral de la compra propia.
    throw badRequest('VALIDATION_ERROR', 'Un espacio publicitario se paga solo, en su propio cobro')
  }
  return [...items].sort((a, b) =>
    a.kind === b.kind ? a.resourceId.localeCompare(b.resourceId) : a.kind.localeCompare(b.kind),
  )
}

export async function createCheckout(items: LineaPedida[], deviceId?: string): Promise<ResultadoCheckout> {
  // Primero el token: si no hay conexión, no queremos dejar un Payment huérfano en la base.
  const token = await getValidToken()

  const pares = normalizarLineas(items)
  // Secuencial y no `Promise.all`: `resolverCobro` tira ante el primer problema, y así el error
  // que le llega al comprador es siempre el de la primera línea EN ORDEN, no el de la consulta
  // que resolvió más rápido (dos ejecuciones del mismo pedido devolvían códigos distintos).
  const lineas: LineaResuelta[] = []
  for (const p of pares) lineas.push(await resolverCobro(p.kind, p.resourceId, deviceId))
  const total = lineas.reduce((acc, l) => acc + l.amount, 0)

  // Antes de mirar qué hay vivo: reparar el espejo (por si un bug dejó una línea trabada) y
  // vencer lo abandonado. Las dos cosas son "limpiar antes de decidir".
  await repararEspejo(pares)
  await vencerPendientesAbandonados(pares, token)

  // Reusar la preferencia existente si ya hay un cobro vivo por EXACTAMENTE este mismo carrito:
  // sin esto, pedir el link dos veces (doble clic, dos pestañas, un reintento del navegador)
  // crea DOS preferencias distintas en MP — si el comprador termina pagando ambas, se le cobra
  // dos veces de verdad. El guard ALREADY_PAID de resolverCobro llega tarde: recién actúa cuando
  // la orden ya quedó confirmada.
  const reusable = await decidirSobreCobrosVivos(pares)
  if (reusable) return { ...reusable, items: lineas }

  // Que la BASE elija un único ganador antes de llamar a MP, no la lectura de arriba (esa
  // lectura sola no es atómica: dos requests concurrentes pasan las dos por ahí en vacío). El
  // índice único parcial `PaymentItem(kind,resourceId) WHERE "closedAt" IS NULL` hace que el
  // SEGUNDO `create` que toque cualquiera de estos recursos truene con `P2002` en vez de tener
  // éxito. `create` anidado = una sola transacción implícita: si una línea choca, no queda ni el
  // Payment ni las otras líneas a medio armar (con el modelo viejo sí quedaba basura).
  let pago: { id: string }
  try {
    pago = await prisma.payment.create({
      data: {
        deviceId: deviceId ?? null,
        amount: total,
        status: 'pending',
        items: {
          create: lineas.map((l) => ({ kind: l.kind, resourceId: l.resourceId, amount: l.amount, titulo: l.titulo })),
        },
      },
    })
  } catch (err) {
    if (!esViolacionDeUnicidad(err)) throw err
    // Otro request se llevó alguno de estos recursos. Puede ser el MISMO carrito (carrera de
    // doble clic: hay que devolverle el link del ganador) o uno SOLAPADO (carrito distinto que
    // comparte una orden: nunca se le puede dar ese link, cobra otro monto) — `decidirSobreCobrosVivos`
    // distingue los dos casos y tira COBRO_SOLAPADO en el segundo.
    for (let intento = 0; intento < REINTENTOS_LECTURA_GANADOR; intento++) {
      if (intento > 0) await dormir(ESPERA_ENTRE_REINTENTOS_LECTURA_MS)
      // `esperandoAlGanador`: acá el 409 de "existe pero todavía sin initPoint" NO se tira, se
      // sigue esperando — es justamente lo que estamos reintentando. Si al final de los intentos
      // sigue sin aparecer, el `throw` de abajo lo convierte en CHECKOUT_EN_CURSO igual.
      const ganador = await decidirSobreCobrosVivos(pares, { esperandoAlGanador: true })
      if (ganador) return { ...ganador, items: lineas }
    }
    // La ganadora todavía no terminó de guardar (o quedó trabada): no inventamos una segunda
    // preferencia a ciegas. Que el comprador reintente en un momento.
    throw conflict('CHECKOUT_EN_CURSO', 'Estamos generando tu link de pago. Reintentá en un segundo.')
  }

  let pref: { id: string; init_point: string }
  try {
    pref = await mpApi.createPreference(token, {
      // UNA línea de MP por cada PaymentItem: el comprador ve el detalle de lo que paga en la
      // pantalla de Checkout Pro y el total le cierra con lo que vio en CCM.
      items: lineas.map((l) => ({ title: l.titulo, quantity: 1, unit_price: l.amount, currency_id: 'ARS' })),
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
    // marcar rechazado sin miedo a etiquetar mal un cobro que en realidad existe. Va por
    // `cerrarPago` (no un `update` suelto) para que las LÍNEAS se liberen junto con la cabecera:
    // si solo se moviera la cabecera, los recursos quedarían trabados por un cobro que no existe.
    try {
      await cerrarPago(pago.id, 'rejected')
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
  // puede pagarla) etiquetada como rechazada. Se devuelve igual el initPoint, que es lo que el
  // comprador necesita — pero antes de resignarse, se reintenta guardar: la mayoría de estos
  // fallos son transitorios, y tirar el `pref.id` a la basura al primer intento deja el Payment
  // `pending`/`mpPreferenceId: null` para siempre.
  const guardado = await guardarPreferenciaConReintentos(pago.id, pref)
  if (!guardado) {
    // Lo que reconcilia este pago es `external_reference = Payment.id` (ver
    // mpWebhookService.handleNotification), NO `mpPreferenceId` — ese campo es justo el que
    // quedó `null` acá. Un operador seleccionando "reconciliable por mpPreferenceId" en pleno
    // incidente de plata estaría buscando por un campo vacío.
    console.error(
      `[mpCheckoutService] la preferencia ${pref.id} se creó en MP pero no se pudo guardar en el Payment ${pago.id} tras reintentar (reconciliable por external_reference = Payment.id, NO por mpPreferenceId: quedó null)`,
    )
  }

  return { paymentId: pago.id, initPoint: pref.init_point, amount: total, items: lineas }
}

/**
 * Mira los cobros vivos que tocan estos recursos y decide:
 *  · devuelve el cobro reusable (mismo carrito EXACTO, con initPoint) → el comprador recibe el
 *    mismo link de siempre;
 *  · tira `COBRO_SOLAPADO` si hay un cobro vivo con OTRO conjunto de líneas. Nunca se devuelve su
 *    initPoint como si fuera el de este carrito: cobraría un monto distinto del que el comprador
 *    ve, que es exactamente el bug que este cambio viene a arreglar;
 *  · tira `CHECKOUT_EN_CURSO` si el conjunto coincide pero todavía no tiene preferencia y es
 *    reciente (puede haber una preferencia viva en MP que la base nunca llegó a registrar);
 *  · devuelve `null` si no hay nada vivo y hay que crear.
 */
async function decidirSobreCobrosVivos(
  pares: LineaPedida[],
  { esperandoAlGanador = false }: { esperandoAlGanador?: boolean } = {},
): Promise<{ paymentId: string; initPoint: string; amount: number } | null> {
  const vivos = await buscarCobrosVivos(pares)
  if (vivos.length === 0) return null

  const buscada = firmaConjunto(pares)
  const exacto = vivos.find((p) => firmaConjunto(lineasVivas(p)) === buscada)

  if (exacto?.initPoint) {
    return { paymentId: exacto.id, initPoint: exacto.initPoint, amount: exacto.amount }
  }

  // Alguno de estos recursos está tomado por un carrito DISTINTO: no hay link que darle.
  const solapado = vivos.find((p) => firmaConjunto(lineasVivas(p)) !== buscada)
  if (solapado) throw cobroSolapado(solapado)

  // Mismo carrito, sin preferencia guardada. Si es reciente, es la huella de un intento anterior
  // cuyo `update` pudo haber fallado: puede haber una preferencia viva en MP que la base nunca
  // llegó a registrar. Cortar con 409 en vez de arriesgar un segundo link pagable.
  if (!esperandoAlGanador && exacto && exacto.createdAt.getTime() >= Date.now() - VENTANA_RIESGO_SIN_PREFERENCIA_MS) {
    throw conflict(
      'CHECKOUT_EN_CURSO',
      'Puede haber un cobro en curso para esto. Esperá unos minutos y volvé a intentar; si el problema sigue, contactanos.',
    )
  }
  return null
}
