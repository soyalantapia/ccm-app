import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * El fallback de la SPA es para RUTAS del router, no para archivos.
 *
 * Antes, CUALQUIER path sin /api/ devolvía 200 + HTML, así que un asset inexistente (una
 * imagen borrada, un chunk viejo tras un deploy) era indistinguible de una ruta válida: el
 * navegador recibía HTML donde esperaba binario. El Service Worker lo empeora: cachea
 * imágenes con CacheFirst, así que el 200 mentiroso queda pegado hasta que expire la entrada.
 */

let dist: string
let app: import('express').Express

beforeAll(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-dist-'))
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>CCM</title>')
  fs.mkdirSync(path.join(dist, 'assets'))
  fs.writeFileSync(path.join(dist, 'assets', 'real.js'), 'console.log(1)')

  process.env.FRONT_DIST = dist
  process.env.ADMIN_TOKEN = 'test-token'
  process.env.DEVICE_TOKEN_SECRET = 'test-secret-de-al-menos-32-caracteres-ok'
  const { createApp } = await import('./app.js')
  app = createApp()
})

afterAll(() => {
  fs.rmSync(dist, { recursive: true, force: true })
  delete process.env.FRONT_DIST
})

describe('fallback de la SPA — 404 honesto para assets que no existen', () => {
  it('una RUTA del router devuelve el index (200 HTML)', async () => {
    const res = await request(app).get('/eventos')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })

  it('una ruta anidada del router también', async () => {
    const res = await request(app).get('/catalogo/valentina-roldan')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })

  it('un asset que SÍ existe se sirve tal cual', async () => {
    const res = await request(app).get('/assets/real.js')
    expect(res.status).toBe(200)
    expect(res.text).toContain('console.log')
  })

  it('un JS inexistente da 404, NO un 200 con HTML adentro', async () => {
    const res = await request(app).get('/assets/index-VIEJO123.js')
    expect(res.status).toBe(404)
    expect(res.text).not.toContain('<!doctype html>')
  })

  it('una imagen inexistente da 404 (si no, el SW la cachea con CacheFirst)', async () => {
    const res = await request(app).get('/img/gallery/no-existe.jpg')
    expect(res.status).toBe(404)
  })

  it('CSS, fuentes y mapas inexistentes también dan 404', async () => {
    for (const p of ['/assets/x.css', '/fonts/y.woff2', '/assets/z.js.map']) {
      expect((await request(app).get(p)).status, `${p} debería ser 404`).toBe(404)
    }
  })

  it('un slug con punto sigue siendo una ruta, no un asset', async () => {
    const res = await request(app).get('/catalogo/juan.perez')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })

  it('/api/* sigue cayendo al 404 JSON del backend, no al index', async () => {
    const res = await request(app).get('/api/v1/no-existe')
    expect(res.status).toBe(404)
    expect(res.body?.error?.code).toBe('NOT_FOUND')
  })
})
