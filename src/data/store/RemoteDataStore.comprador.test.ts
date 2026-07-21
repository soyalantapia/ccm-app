import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'
import { LocalDataStore } from './LocalDataStore'

/**
 * La orden tiene que viajar con el NOMBRE del comprador, no sólo con su email.
 *
 * El bug (P1, encontrado ejerciendo la compra real contra Postgres): `LocalDataStore.createOrder`
 * armaba la orden con `buyerName: identity.displayName()`, pero el override de `RemoteDataStore`
 * mandaba únicamente `buyerEmail` en el POST. El backend acepta y persiste `buyerName`
 * (server/src/routes/orders.ts + orderService.ts), así que la columna quedaba en NULL para
 * TODA compra hecha en producción.
 *
 * Se ve en la demo y no se ve en producción, que es la costura donde este proyecto se rompe
 * siempre. El efecto para el organizador: en «Entradas y órdenes» cada compra figura con el
 * email crudo en lugar del nombre —`AdminOrdenes.tsx` hace `buyerName || buyerEmail`—, y no hay
 * forma de recuperar el nombre después, porque en la orden nunca se guardó.
 */

let calls: { method: string; url: string; body: Record<string, unknown> | null }[] = []
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

/** Deja cargado el perfil del dispositivo, como después de completar el sheet de datos. */
function conPerfil(fields: Record<string, string>) {
  const capturedAt = '2026-07-21T00:00:00.000Z'
  store['ccm:profile'] = JSON.stringify({
    deviceId: 'dev-test',
    createdAt: capturedAt,
    fields: Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, { value, capturedAt }])),
    consents: {},
  })
}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      let body: Record<string, unknown> | null = null
      try {
        body = init?.body ? JSON.parse(init.body) : null
      } catch {
        body = null
      }
      calls.push({ method: init?.method ?? 'GET', url: String(url), body })
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const postDeOrdenes = () => calls.find((c) => c.method === 'POST' && c.url.endsWith('/orders'))

describe('createOrder — el nombre del comprador llega al backend', () => {
  it('manda buyerName en el POST /orders', () => {
    conPerfil({ firstName: 'Auditoria', lastName: 'PmAudit', email: 'audit.pm@ejemplo.test' })
    const s = new RemoteDataStore('https://api.test')
    calls = []

    s.createOrder('combo-vip', 1)

    const post = postDeOrdenes()
    expect(post, `no se emitió POST /orders. Requests: ${JSON.stringify(calls)}`).toBeDefined()
    expect(
      post!.body?.buyerName,
      'la orden viaja sin nombre: el organizador ve el email crudo en el panel',
    ).toBe('Auditoria PmAudit')
    expect(post!.body?.buyerEmail).toBe('audit.pm@ejemplo.test')
  })

  it('la orden optimista también lleva el nombre, así la UI no muestra un dato distinto al guardado', () => {
    conPerfil({ firstName: 'Auditoria', lastName: 'PmAudit', email: 'audit.pm@ejemplo.test' })
    const s = new RemoteDataStore('https://api.test')

    const orden = s.createOrder('combo-vip', 1)

    expect(orden.buyerName).toBe('Auditoria PmAudit')
  })

  it('sin nombre cargado no manda la clave vacía (un "" no es un nombre y ensucia el panel)', () => {
    conPerfil({ email: 'anonimo@ejemplo.test' })
    const s = new RemoteDataStore('https://api.test')
    calls = []

    s.createOrder('combo-vip', 1)

    const post = postDeOrdenes()!
    expect('buyerName' in (post.body ?? {}), 'mandó buyerName vacío').toBe(false)
    expect(post.body?.buyerEmail).toBe('anonimo@ejemplo.test')
  })

  it('con sólo el nombre de pila alcanza: no exige apellido para identificar la compra', () => {
    conPerfil({ firstName: 'Auditoria', email: 'audit.pm@ejemplo.test' })
    const s = new RemoteDataStore('https://api.test')
    calls = []

    s.createOrder('combo-vip', 1)

    expect(postDeOrdenes()!.body?.buyerName).toBe('Auditoria')
  })
})

/**
 * La regla de fondo: demo y producción tienen que guardar la MISMA orden. Cada campo que sólo
 * arma una de las dos implementaciones es un dato que se pierde al pasar a prod sin que nada
 * falle a la vista. Este test compara las dos salidas en lugar de vigilar `buyerName` solo, así
 * un campo nuevo que se agregue de un lado y se olvide del otro cae acá.
 */
describe('createOrder — demo y producción arman la misma orden', () => {
  it('los dos stores producen las mismas claves', () => {
    conPerfil({ firstName: 'Auditoria', lastName: 'PmAudit', email: 'audit.pm@ejemplo.test' })

    const local = new LocalDataStore().createOrder('combo-vip', 1)
    const remoto = new RemoteDataStore('https://api.test').createOrder('combo-vip', 1)

    // El id y el timestamp se generan por orden, no se comparan.
    const clavesDe = (o: object) => Object.keys(o).filter((k) => k !== 'id' && k !== 'ts').sort()
    expect(clavesDe(remoto), 'producción arma la orden con menos datos que la demo').toEqual(clavesDe(local))
    expect(remoto.buyerName).toBe(local.buyerName)
    expect(remoto.buyerEmail).toBe(local.buyerEmail)
  })
})
