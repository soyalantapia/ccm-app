import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../app'

// Regresión del bug: express.json() emite errores de http-errors ANTES de tocar una ruta
// (no toca la DB), así que este supertest corre SIN Postgres. Antes del fix, ambos casos caían
// al 500 INTERNAL genérico; ahora se mapean al status correcto (verificado en prod: POST
// /api/v1/analytics con body '{' devolvía HTTP 500).
describe('errorHandler — http-errors de express.json (no 500)', () => {
  const app = createApp()

  it('JSON malformado → 400 BAD_REQUEST (antes 500 INTERNAL)', async () => {
    const res = await request(app)
      .post('/api/v1/analytics')
      .set('Content-Type', 'application/json')
      .send('{') // JSON inválido
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: { code: 'BAD_REQUEST' } })
  })

  it('body > 1mb → 413 PAYLOAD_TOO_LARGE (antes 500 INTERNAL)', async () => {
    const big = '{"event":"x","payload":{"a":"' + 'z'.repeat(1_200_000) + '"}}'
    const res = await request(app)
      .post('/api/v1/analytics')
      .set('Content-Type', 'application/json')
      .send(big)
    expect(res.status).toBe(413)
    expect(res.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } })
  })
})
