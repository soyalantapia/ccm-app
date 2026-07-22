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

/**
 * INVARIANTE: en RemoteDataStore, una LECTURA de contenido nunca cae al seed de demo.
 *
 * El bug que blinda este test: el patrón `this.x ?? super.getX()` hacía que, al fallar la
 * hidratación, la app renderizara el seed que viaja COMPILADO en el bundle — speakers
 * ficticios con sala y horario, sponsors inventados, banners apuntando a dominios .example
 * y cupos como `seedTaken: 142`. Y como el service worker precachea el shell, la app cargaba
 * impecable: sin pantalla de error, sin spinner, sin aviso de offline. Se veía llena y mentía.
 *
 * El escenario NO es teórico: es exactamente lo que pasa con la wifi saturada del venue el
 * día del evento, en cada teléfono a la vez y con más gente mirando que nunca.
 *
 * Acá forzamos el peor caso — TODA hidratación falla — y exigimos vacío, no demo.
 */
describe('RemoteDataStore — las LECTURAS de contenido NUNCA caen al seed', () => {
  /** Colecciones de contenido que vienen del server. El seed tiene ≥1 item en todas. */
  const COLECCIONES: { nombre: string; leer: (s: RemoteDataStore) => unknown[] }[] = [
    { nombre: 'getEvents', leer: (s) => s.getEvents() },
    { nombre: 'getBlocks', leer: (s) => s.getBlocks('ev-principal-2026') },
    { nombre: 'getNotas', leer: (s) => s.getNotas() },
    { nombre: 'getAdminNotas', leer: (s) => s.getAdminNotas() },
    { nombre: 'getBanners', leer: (s) => s.getBanners() },
    { nombre: 'getAdminBanners', leer: (s) => s.getAdminBanners() },
    { nombre: 'getSponsors', leer: (s) => s.getSponsors() },
    { nombre: 'getPlans', leer: (s) => s.getPlans() },
    { nombre: 'getConvocatorias', leer: (s) => s.getConvocatorias() },
    { nombre: 'getBenefits', leer: (s) => s.getBenefits() },
    { nombre: 'getAdminBenefits', leer: (s) => s.getAdminBenefits() },
    { nombre: 'getCatalog', leer: (s) => s.getCatalog() },
    { nombre: 'getGalleries', leer: (s) => s.getGalleries() },
    { nombre: 'getContents', leer: (s) => s.getContents() },
    { nombre: 'getAnalytics', leer: (s) => s.getAnalytics() },
    { nombre: 'getAdminEvents', leer: (s) => s.getAdminEvents() },
    { nombre: 'getAdminContents', leer: (s) => s.getAdminContents() },
  ]

  for (const { nombre, leer } of COLECCIONES) {
    it(`${nombre} devuelve vacío cuando la hidratación falla, no el seed de demo`, () => {
      const s = storeSinHidratar()
      const filas = leer(s)
      expect(Array.isArray(filas)).toBe(true)
      expect(filas, `${nombre} devolvió ${filas.length} filas del seed compilado`).toEqual([])
    })
  }

  /** Las fichas individuales tenían el mismo agujero: el detalle de un evento o de un
   *  sponsor que no existe en el server salía renderizado con datos inventados. */
  const FICHAS: { nombre: string; leer: (s: RemoteDataStore) => unknown }[] = [
    { nombre: 'getEvent', leer: (s) => s.getEvent('ccm-2026') },
    { nombre: 'getEventById', leer: (s) => s.getEventById('ev-principal-2026') },
    { nombre: 'getNota', leer: (s) => s.getNota('nota-apertura') },
    { nombre: 'getSponsor', leer: (s) => s.getSponsor('sp-ccm') },
    { nombre: 'getCatalogProfile', leer: (s) => s.getCatalogProfile('andrea-destefani') },
    { nombre: 'getGallery', leer: (s) => s.getGallery('gal-camino-marzo') },
    { nombre: 'getConvocatoria', leer: (s) => s.getConvocatoria('camino-a-ccm') },
  ]

  for (const { nombre, leer } of FICHAS) {
    it(`${nombre} devuelve undefined cuando la hidratación falla, no la ficha del seed`, () => {
      const s = storeSinHidratar()
      expect(leer(s)).toBeUndefined()
    })
  }

  /** Lo device-scoped SÍ debe seguir cayendo a localStorage: ahí el fallback es el último
   *  snapshot conocido DEL SERVER (write-through), no contenido fabricado. Sin esto, un
   *  arranque con la red caída dejaría a un inscripto sin su QR y a un socio como no-socio. */
  it('lo device-scoped conserva el fallback al último snapshot del server', () => {
    const s = storeSinHidratar()
    expect(Array.isArray(s.getRegistrations())).toBe(true)
    expect(Array.isArray(s.getOrders())).toBe(true)
    expect(s.getMembership()).toHaveProperty('tier')
  })
})

/**
 * Write-through de lo device-scoped (P1, ronda 4).
 *
 * El estado hidratado vivía SOLO en memoria y ninguna respuesta del server se persistía,
 * mientras que el fallback `?? super.getX()` lee claves de localStorage que en modo remoto
 * nunca se escribían. Resultado: un arranque en el que falle la hidratación deja al usuario
 * viendo "Todavía no tenés tu QR" aunque esté inscripto, y a un socio como no-socio.
 * Con write-through, el fallback pasa a ser el último snapshot conocido del server.
 */
describe('RemoteDataStore — write-through de lo device-scoped', () => {
  /** fetch que responde OK con `body` en las rutas que matcheen, y falla el resto. */
  function fetchQueResuelve(porRuta: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: { method?: string }) => {
        calls.push({ method: init?.method ?? 'GET', url: String(url) })
        const hit = Object.entries(porRuta).find(([ruta]) => String(url).endsWith(ruta))
        if (!hit) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(hit[1]) })
      }),
    )
  }

  it('persiste las inscripciones que vienen del server', async () => {
    const regs = [{ id: 'reg_1', eventId: 'ev_1', status: 'confirmada', ts: '2026-01-01' }]
    fetchQueResuelve({ '/devices': { deviceId: 'd1', token: 't1' }, '/registrations': regs })
    new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(store['ccm:registrations']).toBeDefined())
    expect(JSON.parse(store['ccm:registrations'])).toEqual(regs)
  })

  it('persiste la membresía que viene del server', async () => {
    const m = { tier: 'socio', since: '2026-01-01', paid: 15000 }
    fetchQueResuelve({ '/devices': { deviceId: 'd1', token: 't1' }, '/memberships/me': m })
    new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(store['ccm:membership']).toBeDefined())
    expect(JSON.parse(store['ccm:membership'])).toEqual(m)
  })

  it('persiste favoritos y descargas', async () => {
    fetchQueResuelve({
      '/devices': { deviceId: 'd1', token: 't1' },
      '/favorites': ['ph-1', 'ph-2'],
      '/downloads': [{ photoId: 'ph-1', galleryId: 'g1', sponsorId: 's1', ts: '2026-01-01' }],
    })
    new RemoteDataStore('https://api.test')
    await vi.waitFor(() => {
      expect(store['ccm:favorites']).toBeDefined()
      expect(store['ccm:downloads']).toBeDefined()
    })
    expect(JSON.parse(store['ccm:favorites'])).toEqual(['ph-1', 'ph-2'])
  })
})

/**
 * El cupo "EN VIVO" tiene que vencer (D3, backlog cazabug).
 *
 * `blockAvailability` cacheaba la respuesta del server para siempre: el número solo se
 * actualizaba si ESTE usuario se inscribía o cancelaba. Pero el cupo lo mueven los DEMÁS, así
 * que la pantalla podía decir "quedan 3 lugares" indefinidamente con el bloque ya lleno — y
 * alguien se anotaba creyendo que entraba. Ahora, pasado el TTL, se revalida en segundo plano
 * (se sigue devolviendo el valor cacheado al instante: no se bloquea el render).
 */
describe('RemoteDataStore — el cupo cacheado se revalida al vencer', () => {
  const BLOQUES = { blocks: [{ id: 'blk_1', capacity: 80, taken: 52, left: 28 }], generals: 0 }

  function fetchOk(porRuta: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: { method?: string }) => {
        calls.push({ method: init?.method ?? 'GET', url: String(url) })
        const hit = Object.entries(porRuta).find(([ruta]) => String(url).includes(ruta))
        if (!hit) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(hit[1]) })
      }),
    )
  }

  async function storeConCupoCargado() {
    fetchOk({
      '/events/with-blocks': [{ id: 'ev_1', slug: 'ev', title: 'E', blocks: [{ id: 'blk_1', eventId: 'ev_1', title: 'B' }] }],
      '/blocks-availability': BLOQUES,
    })
    const s = new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(s.blockAvailability('blk_1').left).toBe(28))
    return s
  }

  it('no vuelve a pedirlo mientras está fresco', async () => {
    const s = await storeConCupoCargado()
    calls = []
    s.blockAvailability('blk_1')
    s.blockAvailability('blk_1')
    expect(calls.filter((c) => c.url.includes('availability'))).toEqual([])
  })

  it('lo revalida en segundo plano cuando venció, sin dejar de responder', async () => {
    const s = await storeConCupoCargado()
    calls = []
    // Envejecer el dato más allá del TTL (20s).
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    const av = s.blockAvailability('blk_1')
    expect(av.left, 'debe seguir respondiendo al instante con lo cacheado').toBe(28)
    expect(
      calls.filter((c) => c.url.includes('availability')).length,
      'debió dispararse la revalidación en segundo plano',
    ).toBeGreaterThan(0)
    vi.restoreAllMocks()
  })
})

/**
 * Cuando el backend rechaza una escritura del panel, explica POR QUÉ con un mensaje escrito para
 * que lo lea una persona: "No se puede borrar: tiene 12 inscripciones confirmadas". Ese motivo es
 * lo único que le permite al organizador corregir el problema.
 *
 * Antes se descartaba y el aviso decía siempre "revisá la conexión" — engañoso además de inútil,
 * porque el servidor había contestado perfecto con un 409.
 */
describe('el motivo del rechazo llega hasta el aviso', () => {
  /** Corre una escritura contra un backend que rechaza con `motivo` y devuelve lo que se avisó. */
  async function escrituraRechazada(status: number, motivo?: { code: string; message: string }) {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: { method?: string }) =>
        Promise.resolve(
          (init?.method ?? 'GET') === 'GET'
            ? { ok: false, status: 500, json: () => Promise.resolve({}) }
            : { ok: false, status, json: () => Promise.resolve(motivo ? { error: motivo } : {}) },
        ),
      ),
    )
    const { bus } = await import('../../lib/bus')
    const avisos: unknown[] = []
    const off = bus.on((key, detail) => {
      if (key === 'admin:write-failed') avisos.push(detail)
    })
    const s = new RemoteDataStore('https://api.test')
    s.deleteEvent('ev_1')
    await new Promise((r) => setTimeout(r, 20))
    off()
    return avisos
  }

  it('pasa el mensaje que escribió el backend', async () => {
    const avisos = await escrituraRechazada(409, {
      code: 'EVENT_HAS_REGISTRATIONS',
      message: 'No se puede borrar: tiene 12 inscripciones confirmadas.',
    })
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      message: 'No se puede borrar: tiene 12 inscripciones confirmadas.',
    })
  })

  it('si el backend no explicó nada, avisa igual (sin motivo) para que el toast use su genérico', async () => {
    const avisos = await escrituraRechazada(500)
    expect(avisos).toHaveLength(1)
    expect((avisos[0] as { message?: string } | undefined)?.message).toBeUndefined()
  })
})
