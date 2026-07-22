import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'

/**
 * BLOQUEANTE 2 del review: el backend pasó a paginar `/admin/applications` (cursor, `limit ?? 50`)
 * pero el front pedía la ruta SIN parámetros y descartaba `nextCursor` — hidrataba solo la
 * PRIMERA página. El panel pasó de ver 500 postulaciones a ver 50, ordenadas de más vieja a más
 * nueva, sin decirlo en pantalla, y esa lista parcial alimentaba tanto los contadores de los tabs
 * como el guard de borrado en cascada de AdminConvocatorias (`Application.convocatoriaId` es
 * `onDelete: Cascade`): una convocatoria con postulaciones fuera del corte mostraba "0
 * postulaciones" y habilitaba un borrado que se las llevaba puestas.
 *
 * Estos tests fijan que `hydrateAdminApplications` (disparado acá vía `refetchAdminScoped`, que
 * es lo mismo que corre al loguearse / recargar con sesión) siga el cursor hasta agotarlo, así
 * `getAdminApplications()` vuelve a ser la lista COMPLETA — nunca una página parcial.
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

function app(id: string) {
  return { id, convocatoriaId: 'conv-1', ts: '2026-01-01T00:00:00.000Z', status: 'preinscripta', data: {} }
}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', memoryStorage())
  // Con token de admin ya en sesión, el constructor dispara refetchAdminScoped() (mismo
  // criterio que un F5 con sesión abierta) — así se ejercita hydrateAdminApplications sin
  // depender de una acción de login.
  store['ccm:admin-token'] = 'tok-admin'
  vi.stubGlobal('sessionStorage', memoryStorage())
})
afterEach(() => vi.unstubAllGlobals())

describe('hydrateAdminApplications — pagina hasta agotar el cursor', () => {
  it('junta TODAS las páginas en un solo caché completo (antes se quedaba con la primera)', async () => {
    const pagina1 = { items: Array.from({ length: 100 }, (_, i) => app(`app-${i}`)), nextCursor: 'app-99' }
    const pagina2 = { items: Array.from({ length: 30 }, (_, i) => app(`app-${100 + i}`)), nextCursor: null }
    const calls: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('/devices')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ deviceId: 'd', token: 't' }) })
        }
        if (u.includes('/admin/applications')) {
          const esSegunda = u.includes('cursor=app-99')
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(esSegunda ? pagina2 : pagina1) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      }),
    )

    const s = new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(s.getAdminApplications()?.length).toBe(130))

    const idsVistos = new Set(s.getAdminApplications()!.map((a) => a.id))
    expect(idsVistos.has('app-0')).toBe(true)
    expect(idsVistos.has('app-99')).toBe(true)
    expect(idsVistos.has('app-129'), 'la SEGUNDA página (fuera del corte de 50/100 viejo) tiene que estar').toBe(true)

    const llamadasApps = calls.filter((c) => c.includes('/admin/applications'))
    expect(llamadasApps, 'tuvo que pedir la segunda página siguiendo nextCursor').toHaveLength(2)
    expect(llamadasApps[0]).not.toContain('cursor=')
    expect(llamadasApps[1]).toContain('cursor=app-99')
  })

  it('con una sola página (nextCursor null de entrada), no pide una segunda de más', async () => {
    const unaPagina = { items: [app('app-0'), app('app-1')], nextCursor: null }
    const calls: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('/devices')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ deviceId: 'd', token: 't' }) })
        }
        if (u.includes('/admin/applications')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(unaPagina) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      }),
    )

    const s = new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(s.getAdminApplications()?.length).toBe(2))
    expect(calls.filter((c) => c.includes('/admin/applications'))).toHaveLength(1)
  })

  it('si una página falla a mitad de camino, NO deja una lista parcial: expone el error', async () => {
    const pagina1 = { items: Array.from({ length: 5 }, (_, i) => app(`app-${i}`)), nextCursor: 'app-4' }

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const u = String(url)
        if (u.includes('/devices')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ deviceId: 'd', token: 't' }) })
        }
        if (u.includes('/admin/applications')) {
          if (u.includes('cursor=')) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pagina1) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      }),
    )

    const s = new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(s.applicationsFailed()).toBe(true))
    // La garantía es "completo o error", nunca "a medias": si no pudo traer TODO, no deja
    // ver las primeras 5 como si fueran el total (el mismo engaño que causó el bug original).
    expect(s.getAdminApplications()).toBeNull()
  })

  it('si el cursor se repite (el backend no avanza), corta y expone el error en vez de loopear para siempre', async () => {
    // El server devuelve SIEMPRE el mismo nextCursor a partir de la segunda página: un bug de
    // server (o un cambio futuro) que se queda pisando el mismo cursor colgaría la pestaña del
    // admin en un for(;;) sin este corte.
    const pagina1 = { items: Array.from({ length: 5 }, (_, i) => app(`app-${i}`)), nextCursor: 'app-4' }
    const paginaQueNoAvanza = { items: Array.from({ length: 5 }, (_, i) => app(`otra-${i}`)), nextCursor: 'app-4' }
    const calls: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('/devices')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ deviceId: 'd', token: 't' }) })
        }
        if (u.includes('/admin/applications')) {
          const esPrimera = !u.includes('cursor=')
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(esPrimera ? pagina1 : paginaQueNoAvanza) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      }),
    )

    const s = new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(s.applicationsFailed()).toBe(true))
    expect(s.getAdminApplications()).toBeNull()
    // Cortó en la SEGUNDA página (cursor repetido), no siguió pidiendo de más.
    expect(calls.filter((c) => c.includes('/admin/applications'))).toHaveLength(2)
  })

  it('si el paginado no agota el cursor en un número razonable de páginas, corta en vez de seguir para siempre', async () => {
    // El cursor SIEMPRE avanza a un valor NUEVO (nunca se repite, así que el corte por cursor
    // repetido no aplica acá) y el server tarda de más en mandar nextCursor: null — 210 páginas,
    // por encima del tope de 200. Sin el tope, el front seguiría pidiendo página tras página.
    //
    // El mock tiene un techo propio (termina solo en la página 210) A PROPÓSITO: así, si algún día
    // se rompe el tope de páginas del código, este test falla por una aserción normal (llegó a
    // 210 llamados en vez de cortar en 200) en vez de colgar el proceso — un mock realmente
    // infinito, sin tope, cuelga el test runner de verdad (se comprobó al revertir el fix entero:
    // OOM real, el mismo cuelgue que se busca evitar en el admin).
    const TECHO_DEL_MOCK = 210
    const calls: string[] = []
    let n = 0

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('/devices')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ deviceId: 'd', token: 't' }) })
        }
        if (u.includes('/admin/applications')) {
          const esLaUltima = n >= TECHO_DEL_MOCK
          const pagina = esLaUltima
            ? { items: [], nextCursor: null }
            : { items: [app(`app-${n}`)], nextCursor: `cursor-${n + 1}` }
          n += 1
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pagina) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      }),
    )

    const s = new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(s.applicationsFailed()).toBe(true), { timeout: 5000 })
    expect(s.getAdminApplications()).toBeNull()
    // Cortó en el tope (200 páginas), no llegó a las 210 que el mock hubiera dejado pedir.
    expect(calls.filter((c) => c.includes('/admin/applications'))).toHaveLength(200)
  })
})
