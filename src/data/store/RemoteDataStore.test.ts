import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'

/**
 * INVARIANTE: en RemoteDataStore, una ESCRITURA nunca delega en LocalDataStore.
 *
 * El bug que blinda este test (P0, ronda 4): las escrituras admin hacían
 * `if (!this.adminNotas) return super.createNota(...)`, usando un caché de LECTURA vacío como
 * interruptor de "¿hay backend?". LocalDataStore escribe en un overlay de localStorage SIN
 * emitir ninguna request, pero devuelve un objeto válido → la UI toastea "✓ guardado" y el
 * dato no existe para nadie más. El organizador cree que cargó una nota y la perdió.
 *
 * El escenario NO es teórico: al recargar el panel, el AdminGate se saltea (sessionStorage
 * 'ccm:admin') y el bootstrap no hidrataba los cachés admin → todas las escrituras de
 * notas/banners/beneficios se iban a localStorage en silencio.
 *
 * Acá forzamos el peor caso — TODA hidratación falla, así que todos los cachés quedan
 * undefined — y exigimos que cada escritura igual le pegue al backend.
 */

const ADMIN_WRITES: { nombre: string; correr: (s: RemoteDataStore) => void; metodo: string; ruta: string }[] = [
  {
    nombre: 'createNota',
    correr: (s) => s.createNota({ title: 'Nota', slug: '', excerpt: 'e', body: 'b', cover: 'c', publishedAt: '2026-01-01', published: true } as never),
    metodo: 'POST',
    ruta: '/admin/notas',
  },
  { nombre: 'updateNota', correr: (s) => s.updateNota('nota_1', { title: 'x' }), metodo: 'PATCH', ruta: '/admin/notas/nota_1' },
  { nombre: 'deleteNota', correr: (s) => s.deleteNota('nota_1'), metodo: 'DELETE', ruta: '/admin/notas/nota_1' },
  {
    nombre: 'createBanner',
    correr: (s) => s.createBanner({ slot: 'home', order: 1, active: true, image: 'i', destinationUrl: 'https://x.com' } as never),
    metodo: 'POST',
    ruta: '/admin/banners',
  },
  { nombre: 'updateBanner', correr: (s) => s.updateBanner('bnr_1', { active: false }), metodo: 'PATCH', ruta: '/admin/banners/bnr_1' },
  { nombre: 'deleteBanner', correr: (s) => s.deleteBanner('bnr_1'), metodo: 'DELETE', ruta: '/admin/banners/bnr_1' },
  {
    nombre: 'createBenefit',
    correr: (s) => s.createBenefit({ title: 'B', category: 'gastronomia', description: 'd', url: 'https://x.com' } as never),
    metodo: 'POST',
    ruta: '/admin/benefits',
  },
  { nombre: 'updateBenefit', correr: (s) => s.updateBenefit('ben_1', { title: 'x' }), metodo: 'PATCH', ruta: '/admin/benefits/ben_1' },
  { nombre: 'deleteBenefit', correr: (s) => s.deleteBenefit('ben_1'), metodo: 'DELETE', ruta: '/admin/benefits/ben_1' },
]

let calls: { method: string; url: string }[] = []
let store: Record<string, string> = {}

/** Storage en memoria: no dependemos de la implementación de jsdom (su localStorage no
 *  expone .clear() de forma estable entre versiones). */
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

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
  calls = []
  // TODA request falla → ningún caché hidrata → todos quedan undefined (el peor caso).
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      calls.push({ method: init?.method ?? 'GET', url: String(url) })
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function storeSinHidratar(): RemoteDataStore {
  const s = new RemoteDataStore('https://api.test')
  calls = [] // descartar las hidrataciones del constructor
  return s
}

describe('RemoteDataStore — una escritura NUNCA delega en LocalDataStore', () => {
  for (const w of ADMIN_WRITES) {
    it(`${w.nombre} le pega al backend aunque su caché esté sin hidratar`, () => {
      const s = storeSinHidratar()
      w.correr(s)
      const hit = calls.find((c) => c.method === w.metodo && c.url.endsWith(w.ruta))
      expect(
        hit,
        `${w.nombre} no emitió ${w.metodo} ${w.ruta}. Requests observadas: ${JSON.stringify(calls)}`,
      ).toBeDefined()
    })
  }

  it('ninguna escritura admin escribe el overlay de localStorage (esa es la marca del falso éxito)', () => {
    const s = storeSinHidratar()
    for (const w of ADMIN_WRITES) w.correr(s)
    const overlayKeys = Object.keys(store).filter((k) => k.includes('overlay'))
    expect(overlayKeys, `overlay local escrito: ${overlayKeys.join(', ')}`).toEqual([])
  })
})

describe('RemoteDataStore — las LECTURAS sí pueden caer al seed', () => {
  it('getNotas devuelve el seed mientras no hidrató (placeholder razonable, no se pierde nada)', () => {
    const s = storeSinHidratar()
    expect(Array.isArray(s.getNotas())).toBe(true)
  })
})
