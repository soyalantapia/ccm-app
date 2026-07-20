import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { contenidoCoincide } from './uploadService.js'

/**
 * El Content-Type de un upload lo declara el CLIENTE. Sin verificar el contenido real,
 * un HTML (o un SVG con <script>) enviado como image/png quedaba guardado y servido desde
 * el MISMO origen que la SPA y el panel — y este servicio corre con helmet
 * contentSecurityPolicy:false, así que sería XSS almacenado con acceso a la sesión del admin.
 */

let dir: string
const p = (n: string) => path.join(dir, n)

function escribir(nombre: string, bytes: number[] | string): string {
  const f = p(nombre)
  fs.writeFileSync(f, typeof bytes === 'string' ? Buffer.from(bytes, 'latin1') : Buffer.from(bytes))
  return f
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-upload-'))
})
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('contenidoCoincide — el contenido manda, no el Content-Type declarado', () => {
  it('acepta un PNG real', () => {
    expect(contenidoCoincide(escribir('a.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), 'png')).toBe(true)
  })
  it('acepta un JPEG real', () => {
    expect(contenidoCoincide(escribir('a.jpg', [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]), 'jpg')).toBe(true)
  })
  it('acepta un GIF real', () => {
    expect(contenidoCoincide(escribir('a.gif', 'GIF89a\x01\x00\x01\x00'), 'gif')).toBe(true)
  })
  it('acepta un WebP real', () => {
    expect(contenidoCoincide(escribir('a.webp', 'RIFF\x24\x00\x00\x00WEBPVP8 '), 'webp')).toBe(true)
  })

  it('RECHAZA HTML disfrazado de PNG (el vector de XSS almacenado)', () => {
    const f = escribir('x.png', '<html><script>fetch("/api/v1/admin/analytics")</script>')
    expect(contenidoCoincide(f, 'png')).toBe(false)
  })

  it('RECHAZA un SVG con script, aunque lo declaren como imagen', () => {
    const f = escribir('x.png', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    expect(contenidoCoincide(f, 'png')).toBe(false)
    expect(contenidoCoincide(f, 'jpg')).toBe(false)
    expect(contenidoCoincide(f, 'webp')).toBe(false)
  })

  it('RECHAZA una extensión que ya no está permitida (svg)', () => {
    expect(contenidoCoincide(escribir('a2.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'svg')).toBe(false)
  })

  it('RECHAZA un archivo vacío y uno más corto que la firma', () => {
    expect(contenidoCoincide(escribir('vacio.png', []), 'png')).toBe(false)
    expect(contenidoCoincide(escribir('corto.png', [0x89, 0x50]), 'png')).toBe(false)
  })

  it('RECHAZA un PNG cuyo contenido es en realidad un JPEG (extensión cruzada)', () => {
    expect(contenidoCoincide(escribir('cruz.bin', [0xff, 0xd8, 0xff, 0xe0]), 'png')).toBe(false)
  })
})
