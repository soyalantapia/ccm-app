import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../services/mpOAuthService.js', () => ({
  buildAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  getStatus: vi.fn(),
  disconnect: vi.fn(),
}))

import * as oauth from '../services/mpOAuthService.js'
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
