import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Regresión: un archivo que NO existe devolvía el index.html con HTTP 200 en vez de 404.
 *
 * Por qué importa más de lo que parece: el service worker cachea imágenes con CacheFirst
 * durante 30 días. Ante un 200 guardaba ESE HTML bajo la URL de la imagen y después lo
 * servía desde caché sin volver a preguntar — así que la imagen seguía rota aunque el
 * equipo subiera la correcta. Medido en prod: GET /uploads/no-existe.jpg → 200 text/html.
 *
 * La regla: si la ruta parece un archivo (tiene extensión conocida) y no lo sirvió
 * express.static, es 404. Las rutas del router de la SPA no tienen extensión y siguen
 * cayendo al index.html.
 */

let dist: string

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), 'ccm-dist-'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>CCM</title>')
  mkdirSync(join(dist, 'img'), { recursive: true })
  writeFileSync(join(dist, 'img', 'existe.jpg'), Buffer.from([0xff, 0xd8, 0xff]))
  process.env.FRONT_DIST = dist
  process.env.DATABASE_URL ??= 'postgresql://localhost:5432/noop'
})

afterAll(() => {
  delete process.env.FRONT_DIST
  rmSync(dist, { recursive: true, force: true })
})

describe('fallback de la SPA — no miente sobre archivos que no existen', () => {
  async function app() {
    const { createApp } = await import('./app.js')
    return createApp()
  }

  it('una imagen que NO existe devuelve 404, no el index con 200', async () => {
    const res = await request(await app()).get('/img/no-existe.jpg')
    expect(res.status).toBe(404)
    expect(res.headers['content-type'] ?? '').not.toContain('text/html')
  })

  it('una subida que no existe devuelve 404', async () => {
    const res = await request(await app()).get('/uploads/no-existe-abc.jpg')
    expect(res.status).toBe(404)
  })

  it('un asset del bundle que no existe devuelve 404 (no HTML disfrazado de JS)', async () => {
    const res = await request(await app()).get('/assets/index-VIEJO.js')
    expect(res.status).toBe(404)
  })

  it('una imagen que SÍ existe se sirve normal', async () => {
    const res = await request(await app()).get('/img/existe.jpg')
    expect(res.status).toBe(200)
  })

  it('una ruta del router de la SPA sigue devolviendo el index', async () => {
    const res = await request(await app()).get('/p/valentina-roldan')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
  })

  it('la raíz sigue devolviendo el index', async () => {
    const res = await request(await app()).get('/eventos')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
  })

  it('/api/* inexistente sigue siendo 404 JSON, no HTML', async () => {
    const res = await request(await app()).get('/api/v1/no-existe')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toContain('json')
  })
})
