import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'

/**
 * Cuando el backend RECHAZA una escritura del organizador, lo optimista tiene que desaparecer.
 *
 * El aviso ya funcionaba (`admin:write-failed` → toast), pero el rollback no: `adminWrite`
 * usa "re-hidratar" como forma de deshacer, y re-hidratar pide los datos AL MISMO BACKEND que
 * acaba de fallar. Con el backend caído esos GET también fallan —y sus `.catch` son vacíos—
 * así que el ítem optimista se quedaba en la lista.
 *
 * Efecto para el organizador: le avisamos "no se pudo guardar" y al mismo tiempo sigue viendo
 * su nota en pantalla. Se va convencido de que algo quedó, vuelve más tarde y no está.
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

/**
 * Backend que responde la hidratación inicial y DESPUÉS se cae del todo.
 *
 * El "después" es la clave: el rollback por defecto es re-hidratar, y hay que reproducir el
 * caso en que esa re-hidratación tampoco puede funcionar. Si el mock siguiera respondiendo
 * los GET, el refetch arreglaría el caché solo y el bug quedaría tapado.
 */
let backendVivo = true
function backendQueSeCaeTrasHidratar(hidratacion: Record<string, unknown>) {
  backendVivo = true
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      const metodo = init?.method ?? 'GET'
      const ruta = Object.keys(hidratacion).find((r) => String(url).endsWith(r))
      if (backendVivo && metodo === 'GET' && ruta) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(hidratacion[ruta]) })
      }
      return Promise.reject(new TypeError('Failed to fetch'))
    }),
  )
}

const NOTA_EXISTENTE = {
  id: 'nota_1', slug: 'una', title: 'Una que ya estaba', excerpt: 'e', body: '<p>b</p>',
  cover: '', publishedAt: '2026-01-01', published: true,
}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
  sessionStorage.setItem('ccm:admin-token', 'tok') // hay sesión de organizador
})

afterEach(() => vi.unstubAllGlobals())

async function storeConCacheAdmin(): Promise<RemoteDataStore> {
  backendQueSeCaeTrasHidratar({
    '/devices': { deviceId: 'd1', token: 't1' },
    '/admin/notas': [NOTA_EXISTENTE],
    '/notas': [NOTA_EXISTENTE],
  })
  const s = new RemoteDataStore('https://api.test')
  s.refetchAdminScoped()
  await vi.waitFor(() => expect(s.getAdminNotas()).toHaveLength(1))
  backendVivo = false // a partir de acá, el backend no responde nada
  return s
}

describe('escrituras admin — si el backend rechaza, lo optimista NO puede quedar', () => {
  it('createNota: la nota no confirmada desaparece de la lista', async () => {
    const s = await storeConCacheAdmin()

    s.createNota({
      title: 'Fantasma', slug: '', excerpt: 'x', body: '<p>x</p>',
      cover: '', publishedAt: '2026-07-20', published: true,
    } as never)

    // Aparece de inmediato (optimismo) y eso está bien…
    expect(s.getAdminNotas()).toHaveLength(2)

    // …pero cuando el POST falla tiene que irse sola, sin depender de recargar la página.
    await vi.waitFor(() => {
      const titulos = s.getAdminNotas().map((n) => n.title)
      expect(titulos, 'la nota rechazada quedó en la lista').not.toContain('Fantasma')
    })
    expect(s.getAdminNotas()).toHaveLength(1)
  })

  it('updateNota: el cambio no confirmado se revierte al valor anterior', async () => {
    const s = await storeConCacheAdmin()

    s.updateNota('nota_1', { title: 'Título que el server nunca aceptó' })
    expect(s.getAdminNotas()[0].title).toBe('Título que el server nunca aceptó')

    await vi.waitFor(() => {
      expect(s.getAdminNotas()[0].title, 'el cambio rechazado quedó pegado').toBe('Una que ya estaba')
    })
  })

  it('el organizador SÍ se entera: se emite admin:write-failed', async () => {
    const s = await storeConCacheAdmin()
    const { bus } = await import('../../lib/bus')
    const avisos: string[] = []
    const off = bus.on((k) => { if (k === 'admin:write-failed') avisos.push(k) })

    s.createNota({
      title: 'Otra', slug: '', excerpt: 'x', body: '<p>x</p>',
      cover: '', publishedAt: '2026-07-20', published: true,
    } as never)

    await vi.waitFor(() => expect(avisos.length).toBeGreaterThan(0))
    off()
  })
})
