import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../app'
import { errorHandler } from './error'

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

/**
 * Un choque entre dos escrituras concurrentes no es culpa de nadie: reintentar suele alcanzar.
 * Salía como 500 ("algo falló") cuando lo honesto es "alguien más lo estaba editando".
 * Reproducido contra la base real con dos PATCH simultáneos sobre la misma galería.
 */
describe('errorHandler — choques de concurrencia de Postgres', () => {
  function respuestaPara(err: unknown) {
    const res: { code?: number; body?: unknown } = {}
    const fake = {
      status(c: number) { res.code = c; return this },
      json(b: unknown) { res.body = b; return this },
    }
    errorHandler(err as never, {} as never, fake as never, (() => {}) as never)
    return res
  }

  it('un deadlock (40P01) responde 409, no 500', () => {
    const err = Object.assign(new Error(
      'Error occurred during query execution: ConnectorError(kind: QueryError(PostgresError { code: "40P01", message: "deadlock detected" }))',
    ), { name: 'PrismaClientUnknownRequestError' })
    const r = respuestaPara(err)
    expect(r.code).toBe(409)
    expect((r.body as { error: { code: string } }).error.code).toBe('WRITE_CONFLICT')
  })

  it('un serialization failure (40001) también responde 409', () => {
    const r = respuestaPara(new Error('could not serialize access due to concurrent update (40001)'))
    expect(r.code).toBe(409)
  })

  it('un error cualquiera sigue siendo 500 (no marcamos todo como conflicto)', () => {
    const r = respuestaPara(new Error('algo se rompió de verdad'))
    expect(r.code).toBe(500)
  })
})
