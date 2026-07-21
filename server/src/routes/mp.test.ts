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

import * as oauth from '../services/mpOAuthService.js'
import * as webhook from '../services/mpWebhookService.js'
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
