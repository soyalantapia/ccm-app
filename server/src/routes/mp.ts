import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../middlewares/admin.js'
import { requireDevice } from '../middlewares/device.js'
import * as oauth from '../services/mpOAuthService.js'
import { createCheckout, MAX_LINEAS } from '../services/mpCheckoutService.js'
import { handleNotification, verificarFirma } from '../services/mpWebhookService.js'

export const mpRouter = Router()

/** Estado de la conexión (sin tokens). */
mpRouter.get('/admin/mp/status', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    res.json(await oauth.getStatus())
  } catch (err) {
    next(err)
  }
})

/** Devuelve la URL de autorización; el panel abre esa URL. */
mpRouter.post('/admin/mp/connect', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    res.json({ url: await oauth.buildAuthUrl() })
  } catch (err) {
    next(err)
  }
})

mpRouter.post('/admin/mp/disconnect', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    await oauth.disconnect()
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/**
 * Vuelta de Mercado Pago. Es PÚBLICA porque la invoca el navegador volviendo de MP, no el panel:
 * la seguridad la da el state de un solo uso, no un token de admin. Siempre redirige al panel
 * (nunca devuelve JSON): del otro lado hay una persona mirando, no un fetch.
 */
mpRouter.get('/mp/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!code || !state) return res.redirect('/admin/configuracion?mp=error')
  try {
    await oauth.exchangeCode(code, state)
    res.redirect('/admin/configuracion?mp=ok')
  } catch (err) {
    // Esta ruta SIEMPRE redirige (nunca pasa por errorHandler), así que si no logueamos acá
    // el motivo del fallo se pierde para siempre: el organizador solo ve "no puedo conectar
    // Mercado Pago" y no queda ni una línea para saber si fue MP caído, state vencido o
    // credenciales mal. Mismo formato que middlewares/error.ts.
    console.error('[mp.callback]', err instanceof Error ? err.stack : err)
    res.redirect('/admin/configuracion?mp=error')
  }
})

/** Una línea del carrito. El monto NO se acepta: lo calcula el server. */
const lineaSchema = z.object({
  kind: z.enum(['ticket_order', 'membership', 'ad_campaign']),
  resourceId: z.string().min(1),
})

/**
 * Un cobro cubre N recursos. Se acepta la forma NUEVA (`{ items: [...] }`) y también la VIEJA
 * (`{ kind, resourceId }`) a propósito: durante el deploy hay clientes ya cargados en el
 * navegador que siguen mandando la forma vieja, y romperles el checkout significa perder ventas
 * reales por unos minutos. La vieja se normaliza a un carrito de una línea.
 */
const checkoutSchema = z.union([
  z.object({ items: z.array(lineaSchema).min(1).max(MAX_LINEAS) }),
  lineaSchema.transform((l) => ({ items: [l] })),
])

/**
 * POST /api/v1/payments/preference — devuelve el link de pago de esta compra.
 * Device-scoped (la usa el comprador, no el panel): requireDevice, no requirePermission.
 *
 * Respuesta 201: { paymentId, initPoint, amount, items: [{ kind, resourceId, amount, titulo }] }.
 * `amount` viaja de vuelta a propósito: si el server cobra distinto de lo que el comprador vio en
 * pantalla, el front no redirige. Es la red de contención barata contra la clase de bug que este
 * endpoint viene a cerrar.
 *
 * Errores 409, que NO significan lo mismo: `CHECKOUT_EN_CURSO` es una carrera contra un pedido
 * idéntico y se resuelve sola (el front reintenta); `COBRO_SOLAPADO` es un cobro vivo con OTRO
 * conjunto de líneas y no se resuelve nunca solo (el front NO reintenta y ofrece retomar ese
 * pago, con el `details.initPoint` que viaja en el error).
 */
mpRouter.post('/payments/preference', requireDevice, async (req, res, next) => {
  try {
    const { items } = checkoutSchema.parse(req.body)
    res.status(201).json(await createCheckout(items, req.deviceId!))
  } catch (err) {
    next(err)
  }
})

/**
 * Configuración del webhook, exportada como objeto MUTABLE a propósito: es la única forma de que
 * el test del timeout no tenga que esperar el timeout real (ver mp.test.ts). No se toca en runtime.
 */
export const webhookConfig = {
  /**
   * Cuánto esperamos a que termine el procesamiento antes de contestarle a MP. MP corta la
   * conexión bastante después (del orden de los 20 s), así que este tope es DELIBERADAMENTE más
   * corto: preferimos cortar nosotros —con un 5xx explícito, que MP registra como fallido y
   * reintenta— antes que quedar colgados hasta que corte MP, que es un final mucho más ambiguo.
   */
  timeoutMs: 10_000,
}

/** Corre `promesa` con un tope de tiempo. Si se pasa, rechaza (y no deja el timer colgado). */
function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout
  const corte = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`el procesamiento del webhook superó ${ms}ms`)), ms)
  })
  return Promise.race([promesa, corte]).finally(() => clearTimeout(timer)) as Promise<T>
}

/**
 * POST /api/v1/mp/webhook — aviso de pago de Mercado Pago.
 *
 * P0-C — CRITERIO: para MP, el código de estado ES el mecanismo de reintento. Un 2xx significa
 * "lo procesé, no vuelvas a avisar"; cualquier otra cosa significa "reintentá" (MP reprograma el
 * aviso con backoff durante horas). Antes esta ruta contestaba 200 ANTES de procesar y se comía
 * toda excepción: el `catch` de `handleNotification` suelta el claim "para que MP reintente",
 * pero MP ya tenía su 200 y no reintentaba NUNCA. El pago quedaba cobrado y sin entregar, sin
 * ningún camino de recuperación (no hay job de fondo en este server: corre en un solo contenedor
 * de Railway sin scheduler).
 *
 * Ahora se procesa PRIMERO y se responde DESPUÉS, con este mapeo:
 *   · procesado OK, o nada que hacer (sin data.id) → 200, MP no reintenta.
 *   · firma inválida → 401. No lo procesamos. Y pedimos reintento a propósito: si es un atacante
 *     no cuesta nada (MP no está del otro lado), y si lo que está roto es la configuración
 *     (MP_WEBHOOK_SECRET, o el header del proxy) los reintentos de MP son la ÚNICA red que nos
 *     da tiempo a arreglarlo sin perder el aviso.
 *   · excepción o timeout → 500. Es exactamente el caso que tiene que volver.
 *
 * Que un reintento sea seguro no es un supuesto: la idempotencia del servicio es por payment_id
 * concreto y un pago ya entregado no se vuelve a entregar (ver mpWebhookService.handleNotification).
 * Entre "cobrar y no entregar" y "recibir el mismo aviso dos veces", el segundo no cuesta nada.
 *
 * Lo que NO se hace: mantener la conexión abierta indefinidamente. El tope de `webhookConfig`
 * corta antes que MP y devuelve 5xx (el procesamiento que quedó en vuelo termina solo; si llegó a
 * entregar, el reintento lo ve entregado y no duplica).
 */
mpRouter.post('/mp/webhook', async (req, res) => {
  const dataId = String((req.body as { data?: { id?: string } })?.data?.id ?? req.query['data.id'] ?? '')
  // Sin identificador no hay nada que procesar NI que reintentar: 200 y listo (un 5xx acá solo
  // le pediría a MP que nos vuelva a mandar el mismo mensaje vacío).
  if (!dataId) return void res.status(200).end()

  const headers = req.headers as Record<string, string | undefined>
  if (!verificarFirma(headers, dataId)) {
    // Defecto D: antes esto no dejaba NINGÚN rastro. Sin este log, un ataque (alguien probando
    // dataIds con una firma trucha) y una configuración rota (MP_WEBHOOK_SECRET mal seteado, o
    // el problema del proxy del defecto A) se ven EXACTAMENTE igual: nada. Mismo formato que
    // /mp/callback más arriba.
    console.error('[mp.webhook] firma inválida', { dataId })
    return void res.status(401).end()
  }

  try {
    await conTimeout(handleNotification(dataId, true), webhookConfig.timeoutMs)
    res.status(200).end()
  } catch (err) {
    // Se loguea Y se devuelve 5xx: el log es para el operador, el 5xx es para que MP lo vuelva a
    // mandar. Mismo formato que /mp/callback y middlewares/error.ts.
    console.error('[mp.webhook]', err instanceof Error ? err.stack : err)
    res.status(500).end()
  }
})
