import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'
import { ApiError } from '../../lib/api'

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
  it('pide el link de pago con el carrito de items, sin monto', async () => {
    fetchQueResponde(201, { initPoint: 'https://mp/checkout/pref_1', paymentId: 'pay_1', amount: 1000, items: [] })
    const s = new RemoteDataStore('https://api.test')
    const r = await s.startCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }])
    expect(r).toEqual({ initPoint: 'https://mp/checkout/pref_1', amount: 1000 })
    const post = calls.find((c) => c.url.endsWith('/payments/preference'))!
    expect(post.body).toContain('ord_1')
    expect(post.body).not.toContain('total')
    expect(post.body).not.toContain('amount')
  })

  it('un carrito de VARIAS órdenes viaja entero en un solo pedido (una preferencia, no una por orden)', async () => {
    fetchQueResponde(201, { initPoint: 'https://mp/checkout/pref_1', paymentId: 'pay_1', amount: 75000, items: [] })
    const s = new RemoteDataStore('https://api.test')
    const r = await s.startCheckout([
      { kind: 'ticket_order', resourceId: 'ord_a' },
      { kind: 'ticket_order', resourceId: 'ord_b' },
    ])

    const posts = calls.filter((c) => c.url.endsWith('/payments/preference'))
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0].body!)).toEqual({
      items: [
        { kind: 'ticket_order', resourceId: 'ord_a' },
        { kind: 'ticket_order', resourceId: 'ord_b' },
      ],
    })
    // El total que va a cobrar MP vuelve para que la UI lo compare con lo que mostró en pantalla.
    expect(r!.amount).toBe(75000)
  })

  it('devuelve null si Mercado Pago no está conectado, para que el llamador decida', async () => {
    fetchQueResponde(503, { error: { code: 'MP_NOT_CONNECTED' } })
    const s = new RemoteDataStore('https://api.test')
    expect(await s.startCheckout([{ kind: 'ticket_order', resourceId: 'ord_1' }])).toBeNull()
  })
})

describe('startCheckout — 409 CHECKOUT_EN_CURSO no es un rechazo, es "esperá y reintentá"', () => {
  it('reintenta y devuelve el link si el segundo intento sale bien', async () => {
    vi.useFakeTimers()
    fetchPorRuta({
      '/payments/preference': [
        { status: 409, body: { error: { code: 'CHECKOUT_EN_CURSO', message: 'Reintentá en un segundo.' } } },
        { status: 201, body: { initPoint: 'https://mp/checkout/pref_2', paymentId: 'pay_2', amount: 1000, items: [] } },
      ],
    })
    const s = new RemoteDataStore('https://api.test')
    const promise = s.startCheckout([{ kind: 'ticket_order', resourceId: 'ord_2' }])
    await vi.advanceTimersByTimeAsync(2000)
    const r = await promise
    expect(r!.initPoint).toBe('https://mp/checkout/pref_2')
    expect(calls.filter((c) => c.url.endsWith('/payments/preference'))).toHaveLength(2)
  })

  it('si el 409 persiste, se rinde tras un número acotado de reintentos y devuelve null', async () => {
    vi.useFakeTimers()
    fetchPorRuta({
      '/payments/preference': { status: 409, body: { error: { code: 'CHECKOUT_EN_CURSO', message: 'Reintentá en un segundo.' } } },
    })
    const s = new RemoteDataStore('https://api.test')
    const promise = s.startCheckout([{ kind: 'ticket_order', resourceId: 'ord_3' }])
    await vi.advanceTimersByTimeAsync(5000)
    expect(await promise).toBeNull()
    // Acotado: no puede haber reintentado para siempre (eso colgaría al comprador).
    const intentos = calls.filter((c) => c.url.endsWith('/payments/preference')).length
    expect(intentos).toBeGreaterThan(1)
    expect(intentos).toBeLessThanOrEqual(5)
  })
})

/**
 * Los dos 409 del endpoint significan cosas OPUESTAS y antes se trataban igual (se miraba solo
 * `err.status === 409`): se reintentaba cualquiera y después se devolvía null, que en el
 * TicketSelector caía al link manual — una URL de precio fijo, o sea cobrar de menos. Un
 * solapamiento no se resuelve nunca solo, así que tiene que llegar a la UI.
 */
describe('startCheckout — COBRO_SOLAPADO NO se reintenta y NO se traga', () => {
  it('propaga el error con el initPoint del pago en curso, sin reintentar', async () => {
    vi.useFakeTimers()
    fetchPorRuta({
      '/payments/preference': {
        status: 409,
        body: {
          error: {
            code: 'COBRO_SOLAPADO',
            message: 'Ya tenés un pago en curso.',
            details: { paymentId: 'pay_viejo', initPoint: 'https://mp/checkout/pref_viejo' },
          },
        },
      },
    })
    const s = new RemoteDataStore('https://api.test')
    const promise = s.startCheckout([{ kind: 'ticket_order', resourceId: 'ord_4' }]).catch((e) => e)
    await vi.advanceTimersByTimeAsync(5000)
    const err = await promise

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('COBRO_SOLAPADO')
    // El initPoint es lo único que permite ofrecer "retomar el pago en curso" en vez de dejar al
    // comprador esperando 30 minutos sin explicación.
    expect((err as ApiError).details).toEqual({ paymentId: 'pay_viejo', initPoint: 'https://mp/checkout/pref_viejo' })
    // Y NO se reintentó: reintentar un solapamiento es tiempo perdido, nunca se resuelve solo.
    expect(calls.filter((c) => c.url.endsWith('/payments/preference'))).toHaveLength(1)
  })
})
