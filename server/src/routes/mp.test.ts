import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../services/mpOAuthService.js', () => ({
  buildAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  getStatus: vi.fn(),
  disconnect: vi.fn(),
}))
vi.mock('../services/mpWebhookService.js', () => ({
  handleNotification: vi.fn(),
  verificarFirma: vi.fn(),
}))
vi.mock('../services/mpCheckoutService.js', () => ({ createCheckout: vi.fn(), MAX_LINEAS: 10 }))

import * as oauth from '../services/mpOAuthService.js'
import * as webhook from '../services/mpWebhookService.js'
import { createCheckout } from '../services/mpCheckoutService.js'
import { signDeviceToken } from '../lib/deviceToken.js'
import { createApp } from '../app.js'
import { webhookConfig } from './mp.js'

const app = createApp()

beforeEach(() => vi.clearAllMocks())

describe('rutas de conexión — exigen sesión con permiso', () => {
  it('GET /admin/mp/status sin sesión → 401', async () => {
    await request(app).get('/api/v1/admin/mp/status').expect(401)
    expect(oauth.getStatus).not.toHaveBeenCalled()
  })

  it('POST /admin/mp/connect sin sesión → 401', async () => {
    await request(app).post('/api/v1/admin/mp/connect').expect(401)
    expect(oauth.buildAuthUrl).not.toHaveBeenCalled()
  })

  it('POST /admin/mp/disconnect sin sesión → 401', async () => {
    await request(app).post('/api/v1/admin/mp/disconnect').expect(401)
    expect(oauth.disconnect).not.toHaveBeenCalled()
  })

  it('un token de sesión inventado → 401, no 403', async () => {
    await request(app)
      .get('/api/v1/admin/mp/status')
      .set('Authorization', 'Bearer token-inventado')
      .expect(401)
  })
})

describe('vuelta de Mercado Pago', () => {
  it('/mp/callback es público (lo abre el navegador, no el panel) y redirige al panel', async () => {
    vi.mocked(oauth.exchangeCode).mockResolvedValue(undefined)
    const res = await request(app).get('/api/v1/mp/callback?code=C1&state=S1').expect(302)
    expect(oauth.exchangeCode).toHaveBeenCalledWith('C1', 'S1')
    expect(res.headers.location).toContain('/admin/configuracion')
  })

  it('si falta el code, redirige con error en vez de romper', async () => {
    const res = await request(app).get('/api/v1/mp/callback').expect(302)
    expect(res.headers.location).toContain('mp=error')
    expect(oauth.exchangeCode).not.toHaveBeenCalled()
  })
})

/**
 * POST /payments/preference. Un cobro cubre N recursos, así que el contrato pasó de
 * `{ kind, resourceId }` a `{ items: [{ kind, resourceId }] }`. La forma VIEJA se sigue
 * aceptando a propósito: durante el deploy hay clientes ya cargados en el navegador que la
 * mandan, y romperles el checkout es perder ventas reales.
 */
describe('POST /payments/preference — contrato multi-línea', () => {
  const tokenDevice = signDeviceToken('dev_interno_1', 'pub_1')

  beforeEach(() => {
    vi.mocked(createCheckout).mockResolvedValue({
      paymentId: 'pay_1',
      initPoint: 'https://mp/checkout/pref_1',
      amount: 75000,
      items: [
        { kind: 'ticket_order', resourceId: 'ord_a', amount: 30000, titulo: 'Entradas CCM · 1' },
        { kind: 'ticket_order', resourceId: 'ord_b', amount: 45000, titulo: 'Entradas CCM · 2' },
      ],
    })
  })

  it('sin X-Device-Token no se puede pedir un cobro', async () => {
    await request(app).post('/api/v1/payments/preference').send({ items: [{ kind: 'ticket_order', resourceId: 'ord_a' }] }).expect(401)
    expect(createCheckout).not.toHaveBeenCalled()
  })

  it('acepta un carrito de N líneas y devuelve paymentId, initPoint, amount e items', async () => {
    const res = await request(app)
      .post('/api/v1/payments/preference')
      .set('X-Device-Token', tokenDevice)
      .send({
        items: [
          { kind: 'ticket_order', resourceId: 'ord_a' },
          { kind: 'ticket_order', resourceId: 'ord_b' },
        ],
      })
      .expect(201)

    expect(createCheckout).toHaveBeenCalledWith(
      [
        { kind: 'ticket_order', resourceId: 'ord_a' },
        { kind: 'ticket_order', resourceId: 'ord_b' },
      ],
      'dev_interno_1',
    )
    expect(res.body).toMatchObject({ paymentId: 'pay_1', initPoint: 'https://mp/checkout/pref_1', amount: 75000 })
    expect(res.body.items).toHaveLength(2)
  })

  it('la forma VIEJA { kind, resourceId } sigue andando: se normaliza a un carrito de una línea', async () => {
    await request(app)
      .post('/api/v1/payments/preference')
      .set('X-Device-Token', tokenDevice)
      .send({ kind: 'membership', resourceId: 'dev_interno_1' })
      .expect(201)

    expect(createCheckout).toHaveBeenCalledWith([{ kind: 'membership', resourceId: 'dev_interno_1' }], 'dev_interno_1')
  })

  it('el monto NUNCA se acepta del body: aunque lo manden, no llega al servicio', async () => {
    await request(app)
      .post('/api/v1/payments/preference')
      .set('X-Device-Token', tokenDevice)
      .send({ items: [{ kind: 'ticket_order', resourceId: 'ord_a', amount: 1 }] })
      .expect(201)

    expect(createCheckout).toHaveBeenCalledWith([{ kind: 'ticket_order', resourceId: 'ord_a' }], 'dev_interno_1')
  })

  it('un carrito vacío no llega al servicio', async () => {
    await request(app)
      .post('/api/v1/payments/preference')
      .set('X-Device-Token', tokenDevice)
      .send({ items: [] })
      .expect(400)
    expect(createCheckout).not.toHaveBeenCalled()
  })
})

/**
 * El código de estado del webhook ES el mecanismo de reintento de MP: 2xx = "listo, no vuelvas a
 * avisar"; cualquier otra cosa = "reintentá". Por eso la ruta procesa PRIMERO y responde DESPUÉS
 * (P0-C). handleNotification/verificarFirma van mockeadas acá: lo que se ejercita es el
 * comportamiento de la RUTA (mp.ts), no la lógica de negocio del servicio (ya cubierta en
 * mpWebhookService.test.ts).
 */
describe('POST /mp/webhook — el 200 significa "procesado"', () => {
  it('es pública: sin sesión ni device, igual procesa', async () => {
    vi.mocked(webhook.verificarFirma).mockReturnValue(true)
    vi.mocked(webhook.handleNotification).mockResolvedValue(undefined)
    await request(app).post('/api/v1/mp/webhook').send({ data: { id: '111' } }).expect(200)
    expect(webhook.handleNotification).toHaveBeenCalledWith('111', true)
  })

  it('sin data.id (ni en el body ni en la query) responde 200 y no llama al servicio', async () => {
    await request(app).post('/api/v1/mp/webhook').send({}).expect(200)
    expect(webhook.handleNotification).not.toHaveBeenCalled()
    expect(webhook.verificarFirma).not.toHaveBeenCalled()
  })

  it('acepta data.id por query string (variante que también manda MP)', async () => {
    vi.mocked(webhook.verificarFirma).mockReturnValue(true)
    vi.mocked(webhook.handleNotification).mockResolvedValue(undefined)
    await request(app).post('/api/v1/mp/webhook?data.id=222&type=payment').send({}).expect(200)
    expect(webhook.handleNotification).toHaveBeenCalledWith('222', true)
  })

  it('un dataId no-string en el body (ej. objeto) no rompe la ruta', async () => {
    vi.mocked(webhook.verificarFirma).mockReturnValue(false)
    vi.mocked(webhook.handleNotification).mockResolvedValue(undefined)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await request(app).post('/api/v1/mp/webhook').send({ data: { id: { raro: true } } }).expect(401)
    errSpy.mockRestore()
  })
})

/**
 * REGRESIÓN de la tanda anterior: al reescribir la ruta para procesar-primero-responder-después,
 * se perdió el filtro por TIPO de aviso. En el panel de MP se pueden habilitar varios topics
 * además de "Pagos" (el típico es "Órdenes comerciales"): entonces llega
 * `{ type: 'merchant_order', data: { id } }`, la firma valida IGUAL (se firma sobre data.id, no
 * sobre el tipo), `getPayment` da 404 sobre un id que no es de pago → ApiError 502 → la ruta
 * responde 500 → MP reintenta con backoff DURANTE HORAS un aviso que no puede tener éxito nunca.
 * Y ese canal de reintentos es justo la red de seguridad del arreglo P0-C: si se lo llena de
 * avisos condenados, deja de servir para lo que importa.
 */
describe('POST /mp/webhook — solo se procesan los avisos de PAGO', () => {
  beforeEach(() => {
    vi.mocked(webhook.verificarFirma).mockReturnValue(true)
    // Lo que pasa de verdad si un merchant_order llega a handleNotification: getPayment busca un
    // id que no es de pago, MP contesta 404 y sale un ApiError 502.
    vi.mocked(webhook.handleNotification).mockRejectedValue(new Error('Mercado Pago respondió 404 al consultar el pago'))
  })

  it('un merchant_order (type en el body) responde 200 y NO se procesa: MP no tiene que reintentarlo', async () => {
    await request(app)
      .post('/api/v1/mp/webhook')
      .send({ type: 'merchant_order', data: { id: '555' } })
      .expect(200)

    expect(webhook.handleNotification).not.toHaveBeenCalled()
  })

  it('un merchant_order por query string (topic=, el canal IPN) tampoco se procesa', async () => {
    await request(app)
      .post('/api/v1/mp/webhook?topic=merchant_order&data.id=556')
      .send({})
      .expect(200)

    expect(webhook.handleNotification).not.toHaveBeenCalled()
  })

  it('cualquier otro topic que MP sume mañana se descarta igual (lista blanca, no lista negra)', async () => {
    await request(app)
      .post('/api/v1/mp/webhook')
      .send({ type: 'topic_claims_integration_wh', data: { id: '557' } })
      .expect(200)

    expect(webhook.handleNotification).not.toHaveBeenCalled()
  })

  it('type=payment sí se procesa', async () => {
    vi.mocked(webhook.handleNotification).mockResolvedValue(undefined)
    await request(app)
      .post('/api/v1/mp/webhook')
      .send({ type: 'payment', data: { id: '558' } })
      .expect(200)

    expect(webhook.handleNotification).toHaveBeenCalledWith('558', true)
  })

  it('sin type ni topic se procesa IGUAL: un campo ausente no puede costarnos un aviso de pago', async () => {
    vi.mocked(webhook.handleNotification).mockResolvedValue(undefined)
    await request(app)
      .post('/api/v1/mp/webhook')
      .send({ data: { id: '559' } })
      .expect(200)

    expect(webhook.handleNotification).toHaveBeenCalledWith('559', true)
  })
})

/**
 * P0-C: la ruta hacía `res.status(200).end()` ANTES de procesar y se comía toda excepción. El
 * catch de handleNotification suelta el claim "para que MP reintente"… pero MP ya había recibido
 * 200 y no reintenta nunca. El pago quedaba cobrado y sin entregar, para siempre.
 */
describe('POST /mp/webhook — P0-C: un fallo real tiene que ser reintentable por MP', () => {
  it('si handleNotification tira, responde 5xx (MP reintenta) y deja el log', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(webhook.verificarFirma).mockReturnValue(true)
    vi.mocked(webhook.handleNotification).mockRejectedValue(new Error('la base se cayó justo acá'))

    const res = await request(app).post('/api/v1/mp/webhook').send({ data: { id: '333' } })

    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('el 200 recién sale DESPUÉS de procesar (no se adelanta a handleNotification)', async () => {
    vi.mocked(webhook.verificarFirma).mockReturnValue(true)
    let terminoDeProcesar = false
    vi.mocked(webhook.handleNotification).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30))
      terminoDeProcesar = true
    })

    await request(app).post('/api/v1/mp/webhook').send({ data: { id: '666' } }).expect(200)

    expect(terminoDeProcesar).toBe(true)
  })

  it('si el procesamiento se cuelga, corta por timeout y responde 5xx (MP reintenta, no espera al corte de MP)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const original = webhookConfig.timeoutMs
    webhookConfig.timeoutMs = 20
    vi.mocked(webhook.verificarFirma).mockReturnValue(true)
    vi.mocked(webhook.handleNotification).mockImplementation(() => new Promise(() => {})) // nunca resuelve

    const res = await request(app).post('/api/v1/mp/webhook').send({ data: { id: '777' } })

    expect(res.status).toBeGreaterThanOrEqual(500)
    webhookConfig.timeoutMs = original
    errSpy.mockRestore()
  })

  it('firma inválida: NO procesa, deja log, y responde 401', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(webhook.verificarFirma).mockReturnValue(false)

    await request(app).post('/api/v1/mp/webhook').send({ data: { id: '444' } }).expect(401)

    expect(webhook.handleNotification).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
