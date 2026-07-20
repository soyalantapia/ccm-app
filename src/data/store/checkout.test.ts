import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'

let calls: { method: string; url: string; body?: string }[] = []
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

function fetchQueResponde(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: { method?: string; body?: string }) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body })
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
  }))
}

/**
 * Fetch con respuestas distintas por ruta. Para las rutas cuya respuesta es un array, cada
 * llamada consume la siguiente (la última se repite si se piden más de las que hay) — sirve
 * para simular "falla, después funciona" en /payments/preference sin que las hidrataciones
 * del constructor (GET /events, /plans, etc.) se coman las respuestas en cola.
 * Las rutas no listadas fallan con 500 (mismo default que el resto de la suite: RemoteDataStore
 * ya trata cualquier hidratación fallida como "sin dato todavía", no rompe nada).
 */
function fetchPorRuta(rutas: Record<string, { status: number; body: unknown } | { status: number; body: unknown }[]>) {
  const colas = new Map<string, { status: number; body: unknown }[]>()
  vi.stubGlobal('fetch', vi.fn((url: string, init?: { method?: string; body?: string }) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body })
    const rutaKey = Object.keys(rutas).find((r) => String(url).endsWith(r))
    if (!rutaKey) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    const spec = rutas[rutaKey]
    let respuesta: { status: number; body: unknown }
    if (Array.isArray(spec)) {
      if (!colas.has(rutaKey)) colas.set(rutaKey, [...spec])
      const cola = colas.get(rutaKey)!
      respuesta = cola.length > 1 ? cola.shift()! : cola[0]
    } else {
      respuesta = spec
    }
    return Promise.resolve({ ok: respuesta.status < 400, status: respuesta.status, json: () => Promise.resolve(respuesta.body) })
  }))
}

beforeEach(() => {
  store = {}
  calls = []
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('startCheckout — el navegador nunca manda el precio', () => {
  it('pide el link de pago con kind y resourceId, sin monto', async () => {
    fetchQueResponde(201, { initPoint: 'https://mp/checkout/pref_1', paymentId: 'pay_1' })
    const s = new RemoteDataStore('https://api.test')
    const link = await s.startCheckout('ticket_order', 'ord_1')
    expect(link).toBe('https://mp/checkout/pref_1')
    const post = calls.find((c) => c.url.endsWith('/payments/preference'))!
    expect(post.body).toContain('ord_1')
    expect(post.body).not.toContain('total')
    expect(post.body).not.toContain('amount')
  })

  it('devuelve null si Mercado Pago no está conectado, para que el llamador use el link manual', async () => {
    fetchQueResponde(503, { error: { code: 'MP_NOT_CONNECTED' } })
    const s = new RemoteDataStore('https://api.test')
    expect(await s.startCheckout('ticket_order', 'ord_1')).toBeNull()
  })
})

describe('startCheckout — 409 CHECKOUT_EN_CURSO no es un rechazo, es "esperá y reintentá"', () => {
  it('reintenta y devuelve el link si el segundo intento sale bien', async () => {
    vi.useFakeTimers()
    fetchPorRuta({
      '/payments/preference': [
        { status: 409, body: { error: { code: 'CHECKOUT_EN_CURSO', message: 'Reintentá en un segundo.' } } },
        { status: 201, body: { initPoint: 'https://mp/checkout/pref_2', paymentId: 'pay_2' } },
      ],
    })
    const s = new RemoteDataStore('https://api.test')
    const promise = s.startCheckout('ticket_order', 'ord_2')
    await vi.advanceTimersByTimeAsync(2000)
    const link = await promise
    expect(link).toBe('https://mp/checkout/pref_2')
    expect(calls.filter((c) => c.url.endsWith('/payments/preference'))).toHaveLength(2)
  })

  it('si el 409 persiste, se rinde tras un número acotado de reintentos y cae al link manual (null)', async () => {
    vi.useFakeTimers()
    fetchPorRuta({
      '/payments/preference': { status: 409, body: { error: { code: 'CHECKOUT_EN_CURSO', message: 'Reintentá en un segundo.' } } },
    })
    const s = new RemoteDataStore('https://api.test')
    const promise = s.startCheckout('ticket_order', 'ord_3')
    await vi.advanceTimersByTimeAsync(5000)
    const link = await promise
    expect(link).toBeNull()
    // Acotado: no puede haber reintentado para siempre (eso colgaría al comprador).
    const intentos = calls.filter((c) => c.url.endsWith('/payments/preference')).length
    expect(intentos).toBeGreaterThan(1)
    expect(intentos).toBeLessThanOrEqual(5)
  })
})
