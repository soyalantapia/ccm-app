import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'
import { bus } from '../../lib/bus'

/**
 * Cuando el backend rechaza una escritura del panel, el organizador tiene que enterarse de POR QUÉ.
 *
 * El backend ya redacta mensajes pensados para él —"Ya existe un recurso con esa clave", "El
 * precio debe ser un número entre 0 y 1000000000"— y `ApiError` los conserva en `userMessage`.
 * Pero `adminWrite` capturaba el rechazo con un `.catch(() => …)` que descartaba el error y
 * emitía `admin:write-failed` pelado, así que el toast caía siempre al genérico "revisá la
 * conexión": engañoso, porque el server contestó perfecto y el problema es del dato.
 *
 * El consumidor (Toast) ya lee `detail.message`; lo que faltaba era que alguien lo mandara.
 */

let store: Record<string, string> = {}
function memoryStorage(): Storage {
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v) },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  } as Storage
}

/** Backend que hidrata bien y después rechaza toda escritura con el error indicado. */
function backendQueRechaza(code: number, cuerpo: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      const metodo = init?.method ?? 'GET'
      if (metodo === 'GET') {
        const datos = String(url).includes('/devices') ? { deviceId: 'd', token: 't' } : []
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(datos) })
      }
      return Promise.resolve({ ok: false, status: code, json: () => Promise.resolve(cuerpo) })
    }),
  )
}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
})
afterEach(() => vi.unstubAllGlobals())

/** Captura el detail del primer admin:write-failed que se emita. */
function escucharMotivo(): { valor?: { message?: string; code?: string }; off: () => void } {
  const capt: { valor?: { message?: string; code?: string }; off: () => void } = { off: () => {} }
  capt.off = bus.on((k, detail) => {
    if (k === 'admin:write-failed' && capt.valor === undefined) {
      capt.valor = (detail ?? {}) as { message?: string; code?: string }
    }
  })
  return capt
}

const NOTA = {
  title: 'x', slug: '', excerpt: 'x', body: '<p>x</p>',
  cover: '', publishedAt: '2026-07-20', published: true,
}

describe('adminWrite — el motivo del rechazo llega hasta el aviso', () => {
  it('propaga el mensaje que redactó el backend', async () => {
    backendQueRechaza(409, { error: { code: 'DUPLICATE', message: 'Ya existe un recurso con esa clave' } })
    const s = new RemoteDataStore('https://api.test')
    const esp = escucharMotivo()

    s.createNota(NOTA as never)

    await vi.waitFor(() => expect(esp.valor).toBeDefined())
    expect(esp.valor?.message, 'el toast mostraría el genérico de conexión').toBe('Ya existe un recurso con esa clave')
    esp.off()
  })

  it('propaga también el código, para poder distinguir rechazos', async () => {
    backendQueRechaza(400, { error: { code: 'INVALID_PRICE', message: 'El precio debe ser un número entre 0 y 1000000000.' } })
    const s = new RemoteDataStore('https://api.test')
    const esp = escucharMotivo()

    s.createNota(NOTA as never)

    await vi.waitFor(() => expect(esp.valor).toBeDefined())
    expect(esp.valor?.code).toBe('INVALID_PRICE')
    expect(esp.valor?.message).toContain('precio')
    esp.off()
  })

  it('si el backend no dice nada útil, cae al genérico (no rompe ni inventa)', async () => {
    backendQueRechaza(500, {})
    const s = new RemoteDataStore('https://api.test')
    const esp = escucharMotivo()

    s.createNota(NOTA as never)

    await vi.waitFor(() => expect(esp.valor).toBeDefined())
    expect(esp.valor?.message).toContain('No se pudo guardar')
    esp.off()
  })
})
