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

/** Duerme `ms` milisegundos. Usado para los backoffs cortos de los defectos A y B. */
function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Prisma reporta la violación de un índice único (acá, el parcial de la migración
 * 9_mp_payment_pending_unique) con `code: 'P2002'`. Duck-typing en vez de
 * `instanceof Prisma.PrismaClientKnownRequestError` para no meter un import de valor de
 * `@prisma/client` solo para esto — mismo criterio que ya usa `middlewares/error.ts`.
 */
function esViolacionDeUnicidad(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'P2002'
}

/** Mismo `findFirst` del guard de reuso — se necesita dos veces: al entrar y al reintentar tras un P2002. */
function buscarPendienteConPreferencia(kind: PaymentKind, resourceId: string) {
  return prisma.payment.findFirst({
    where: { kind, resourceId, status: 'pending', mpPreferenceId: { not: null } },
    orderBy: { createdAt: 'desc' },
  })
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
  const existente = await buscarPendienteConPreferencia(kind, resourceId)
  if (existente?.initPoint) {
    return { initPoint: existente.initPoint, paymentId: existente.id }
  }

  // Defecto B, red de contención (punto 2): un Payment `pending` del mismo (kind, resourceId)
  // SIN mpPreferenceId, creado hace poco, es la huella de un intento anterior cuyo `update`
  // pudo haber fallado (ver `guardarPreferenciaConReintentos` más abajo) — puede haber una
  // preferencia viva en MP que la base nunca llegó a registrar. Ojo: esto NO se puede resolver
  // ampliando el `where` del `findFirst` de arriba, porque el `if (existente?.initPoint)` de
  // arriba de todas formas filtra las filas sin `initPoint` — hace falta esta consulta aparte,
  // ANTES de intentar crear, para cortar con un 409 en vez de arriesgar un segundo link pagable.
  const riesgoso = await prisma.payment.findFirst({
    where: {
      kind,
      resourceId,
      status: 'pending',
      mpPreferenceId: null,
      createdAt: { gte: new Date(Date.now() - VENTANA_RIESGO_SIN_PREFERENCIA_MS) },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (riesgoso) {
    throw conflict(
      'CHECKOUT_EN_CURSO',
      'Puede haber un cobro en curso para esto. Esperá unos minutos y volvé a intentar; si el problema sigue, contactanos.',
    )
  }

  // Defecto A: que la BASE elija un único ganador antes de llamar a MP, no el `findFirst` de
  // arriba (esa lectura sola no es atómica: dos requests concurrentes pasan las dos por ahí en
  // null, y las dos terminaban acá creando su propio Payment y su propia preferencia). El
  // índice único parcial de la migración 9_mp_payment_pending_unique
  // (`(kind, resourceId) WHERE status = 'pending'`) hace que el SEGUNDO `create` para el mismo
  // par truene con `P2002` en vez de tener éxito — ahí abajo se maneja ese caso.
  //
  // ⚠️ Efecto colateral: mientras exista un Payment `pending` para este (kind, resourceId) —
  // incluido uno abandonado (p.ej. el checkout anterior nunca llegó a fallar ni a confirmarse)
  // — este índice traba la generación de un cobro nuevo para el mismo recurso. Hoy lo único que
  // cierra un Payment `pending` es el catch de más abajo cuando falla `createPreference`; no hay
  // ningún job que expire los abandonados (deliberadamente fuera de esta tarea).
  let pago: { id: string }
  try {
    pago = await prisma.payment.create({
      data: { kind, resourceId, deviceId: deviceId ?? null, amount: monto, status: 'pending' },
    })
  } catch (err) {
    if (!esViolacionDeUnicidad(err)) throw err
    // Otra request idéntica ganó la carrera y en este momento está en pleno ida y vuelta con
    // MP: nunca hay que crear una segunda preferencia acá. Se reintenta la MISMA lectura que el
    // guard de reuso de arriba, dándole tiempo a la ganadora a terminar de guardar su initPoint.
    for (let intento = 0; intento < REINTENTOS_LECTURA_GANADOR; intento++) {
      if (intento > 0) await dormir(ESPERA_ENTRE_REINTENTOS_LECTURA_MS)
      const ganador = await buscarPendienteConPreferencia(kind, resourceId)
      if (ganador?.initPoint) {
        return { initPoint: ganador.initPoint, paymentId: ganador.id }
      }
    }
    // La ganadora todavía no terminó de guardar (o quedó trabada): no inventamos una segunda
    // preferencia a ciegas. Que el comprador reintente en un momento.
    throw conflict('CHECKOUT_EN_CURSO', 'Estamos generando tu link de pago. Reintentá en un segundo.')
  }

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
  // puede pagarla) etiquetada como rechazada. Se devuelve igual el initPoint, que es lo que el
  // comprador necesita — pero antes de resignarse, se reintenta guardar (defecto B, punto 1): la
  // mayoría de estos fallos son transitorios, y tirar el `pref.id` a la basura al primer intento
  // deja el Payment `pending`/`mpPreferenceId: null` para siempre (ver el comentario del índice
  // único en el modelo Payment sobre el efecto colateral de eso).
  const guardado = await guardarPreferenciaConReintentos(pago.id, pref)
  if (!guardado) {
    // Defecto B, punto 3: lo que reconcilia este pago es `external_reference = Payment.id`
    // (ver mpWebhookService.handleNotification), NO `mpPreferenceId` — ese campo es justo el
    // que quedó `null` acá. Un operador seleccionando "reconciliable por mpPreferenceId" en
    // pleno incidente de plata estaría buscando por un campo vacío.
    console.error(
      `[mpCheckoutService] la preferencia ${pref.id} se creó en MP pero no se pudo guardar en el Payment ${pago.id} tras reintentar (reconciliable por external_reference = Payment.id, NO por mpPreferenceId: quedó null)`,
    )
  }

  return { initPoint: pref.init_point, paymentId: pago.id }
}
