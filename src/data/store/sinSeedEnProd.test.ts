import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'

let memoria: Record<string, string> = {}

/** Mismo helper que checkout.test.ts: jsdom no trae un localStorage usable acá. */
function memoryStorage(): Storage {
  return {
    getItem: (k: string) => (k in memoria ? memoria[k] : null),
    setItem: (k: string, v: string) => { memoria[k] = String(v) },
    removeItem: (k: string) => { delete memoria[k] },
    clear: () => { memoria = {} },
    key: (i: number) => Object.keys(memoria)[i] ?? null,
    get length() { return Object.keys(memoria).length },
  } as Storage
}

/**
 * REGLA: en producción la app NUNCA muestra los datos de demostración.
 *
 * RemoteDataStore extiende LocalDataStore, así que `super.getX()` devuelve el seed — que va
 * compilado adentro del bundle que descarga cada visitante. Mientras las lecturas públicas
 * cayeron a `super`, cualquier fallo de hidratación (wifi saturada, un 500, el server
 * arrancando) hacía que la app renderizara disertantes inventados, marcas que no existen y
 * cupos falsos. Y como el service worker precachea el armazón, cargaba impecable: sin error,
 * sin spinner, sin ninguna señal de que algo anduviera mal. Se veía llena y mentía.
 *
 * Estos tests fijan que, sin datos del server, las lecturas públicas devuelven VACÍO. Van a
 * fallar si alguien vuelve a poner un `?? super.getX()` en una lectura de contenido — que es
 * exactamente el cambio que parece inofensivo ("total, es un fallback") y no lo es.
 *
 * Lo que SÍ puede seguir cayendo a `super` son las lecturas del propio dispositivo (favoritos,
 * descargas, membresía, órdenes): ahí `super` no es el seed, es el localStorage de esa persona.
 */

function storeSinHidratar(): RemoteDataStore {
  // fetch que nunca resuelve: simula el peor caso real —el server no contesta, o el wifi del
  // hotel está saturado— sin tocar la red y sin que ninguna hidratación llegue a completarse.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})))
  return new RemoteDataStore('https://api.example.test')
}

describe('sin respuesta del server, el contenido público sale vacío (no del seed)', () => {
  let store: RemoteDataStore

  beforeEach(() => {
    memoria = {}
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('sessionStorage', memoryStorage())
    store = storeSinHidratar()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('eventos: lista vacía, y buscar por slug no encuentra nada', () => {
    expect(store.getEvents()).toEqual([])
    expect(store.getEvent('ccm-2026')).toBeUndefined()
    expect(store.getEventById('ev-principal-2026')).toBeUndefined()
  })

  it('agenda: sin bloques inventados — es donde viven los disertantes ficticios', () => {
    expect(store.getBlocks('ev-principal-2026')).toEqual([])
    expect(store.getBlock('blk-p-1')).toBeUndefined()
  })

  it('sponsors y publicidad: nada al aire — el espacio que se le vende a una marca real', () => {
    expect(store.getSponsors()).toEqual([])
    expect(store.getSponsor('sp-banco-distrito')).toBeUndefined()
    expect(store.getBanners()).toEqual([])
    expect(store.getCampaigns()).toEqual([])
    expect(store.getActiveCampaign('S1')).toBeUndefined()
  })

  it('entradas: sin planes ni precios inventados', () => {
    expect(store.getPlans()).toEqual([])
    expect(store.getPlan('combo-vip')).toBeUndefined()
  })

  it('catálogo, galerías, contenido y novedades: vacíos', () => {
    expect(store.getCatalog()).toEqual([])
    expect(store.getGalleries()).toEqual([])
    expect(store.getContents()).toEqual([])
    expect(store.getNotas()).toEqual([])
    expect(store.getBenefits()).toEqual([])
    expect(store.getConvocatorias()).toEqual([])
  })

  it('postulaciones: ni las 24 del seed como propias, ni como lista del panel', () => {
    expect(store.getMyApplications()).toEqual([])
    expect(store.getApplications()).toEqual([])
  })

  it('el panel tampoco ve datos de demostración', () => {
    expect(store.getAdminEvents()).toEqual([])
    expect(store.getAdminContents()).toEqual([])
    expect(store.getAdminNotas()).toEqual([])
    expect(store.getAdminBanners()).toEqual([])
    expect(store.getAdminBenefits()).toEqual([])
  })
})
