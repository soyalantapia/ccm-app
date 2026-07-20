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
 * Estos casos no vienen en el brief de la Tarea 5: los agrego porque el pedido puntual era
 * verificar que la ruta responde 200 ANTES de procesar (para que MP no reintente en loop) y que
 * un error dentro del procesamiento no pueda escapar como unhandledRejection y voltear el
 * proceso. handleNotification/verificarFirma van mockeadas acá: lo que se ejercita es el
 * comportamiento de la RUTA (mp.ts), no la lógica de negocio del servicio (ya cubierta en
 * mpWebhookService.test.ts).
 */
describe('POST /mp/webhook — la ruta responde 200 siempre, rápido, y no se cae', () => {
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

  it('si handleNotification rechaza, la respuesta 200 ya viaja y el error no se propaga', async () => {
    vi.mocked(webhook.verificarFirma).mockReturnValue(true)
    vi.mocked(webhook.handleNotification).mockRejectedValue(new Error('la base se cayó justo acá'))

    // Si el catch de la ruta no atrapara esto, node emitiría 'unhandledRejection' y (según
    // configuración) podría voltear el proceso — exactamente lo que este test descarta.
    let unhandled: unknown = null
    const onUnhandled = (err: unknown) => {
      unhandled = err
    }
    process.once('unhandledRejection', onUnhandled)

    await request(app).post('/api/v1/mp/webhook').send({ data: { id: '333' } }).expect(200)
    // Le doy una vuelta de microtask/macrotask a la promesa que sigue corriendo en segundo
    // plano después de que la respuesta ya salió, para que el rechazo (si escapara) alcance a
    // dispararse antes de chequear.
    await new Promise((r) => setImmediate(r))

    process.removeListener('unhandledRejection', onUnhandled)
    expect(unhandled).toBeNull()
  })

  it('un dataId no-string en el body (ej. objeto) no rompe la ruta', async () => {
    vi.mocked(webhook.verificarFirma).mockReturnValue(false)
    vi.mocked(webhook.handleNotification).mockResolvedValue(undefined)
    await request(app).post('/api/v1/mp/webhook').send({ data: { id: { raro: true } } }).expect(200)
  })
})
