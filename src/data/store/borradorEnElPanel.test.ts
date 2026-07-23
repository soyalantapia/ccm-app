import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'
import type { EventItem } from '../types'

let memoria: Record<string, string> = {}
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
 * Un evento NACE BORRADOR: publicar es un acto aparte. Todo el flujo del panel depende de que
 * entre esos dos momentos el organizador pueda abrirlo y completarlo.
 *
 * El corte estaba justo ahí: la lista del panel usa getAdminEvents() (que trae borradores) pero
 * la ficha usaba getEventById(), que lee la lista PÚBLICA. Resultado: el evento recién creado
 * aparecía en el listado con su cartel "Borrador" y, al hacerle click, decía "Evento no
 * encontrado". Nada fallaba: el alta había funcionado perfecto.
 *
 * Estos tests fijan la diferencia entre las dos lecturas para que no se vuelvan a confundir.
 */

const ev = (over: Partial<EventItem>): EventItem => ({
  id: 'ev_1',
  slug: 'ev-1',
  type: 'camino',
  title: 'Evento',
  dateLabel: 'Sábado 17 de octubre',
  startDate: '2026-10-17',
  venue: 'Hotel',
  address: 'Calle 1',
  mapsUrl: 'https://maps.example',
  description: 'x',
  cover: 'img/x.jpg',
  published: true,
  ...over,
})

const PUBLICADO = ev({ id: 'ev_pub', slug: 'publicado', published: true })
const BORRADOR = ev({ id: 'ev_draft', slug: 'borrador', published: false, title: 'Recién creado' })

function storeCon(publicos: EventItem[], delPanel: EventItem[]): RemoteDataStore {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})))
  const s = new RemoteDataStore('https://api.example.test')
  // Se siembran los cachés directamente: lo que se prueba es cómo LEE cada método, no la
  // hidratación (que ya tiene sus propios tests).
  ;(s as unknown as { events: EventItem[] }).events = publicos
  ;(s as unknown as { adminEvents: EventItem[] }).adminEvents = delPanel
  return s
}

describe('un borrador se ve en el panel y NO en lo público', () => {
  beforeEach(() => {
    memoria = {}
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('sessionStorage', memoryStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('la lista del panel incluye el borrador; la pública no', () => {
    const s = storeCon([PUBLICADO], [PUBLICADO, BORRADOR])
    expect(s.getAdminEvents().map((e) => e.id)).toEqual(['ev_pub', 'ev_draft'])
    expect(s.getEvents().map((e) => e.id)).toEqual(['ev_pub'])
  })

  it('el borrador se puede ENCONTRAR desde la lista del panel — es lo que abre su ficha', () => {
    // Éste es el test que faltaba: la ficha buscaba con getEventById() y por eso no lo hallaba.
    const s = storeCon([PUBLICADO], [PUBLICADO, BORRADOR])
    const desdeElPanel = s.getAdminEvents().find((e) => e.id === 'ev_draft')
    expect(desdeElPanel?.title).toBe('Recién creado')
  })

  it('getEventById NO ve borradores: es la lectura del público y tiene que seguir así', () => {
    const s = storeCon([PUBLICADO], [PUBLICADO, BORRADOR])
    expect(s.getEventById('ev_draft')).toBeUndefined()
    expect(s.getEventById('ev_pub')?.id).toBe('ev_pub')
  })

  it('buscar por slug tampoco encuentra un borrador', () => {
    const s = storeCon([PUBLICADO], [PUBLICADO, BORRADOR])
    expect(s.getEvent('borrador')).toBeUndefined()
    expect(s.getEvent('publicado')?.id).toBe('ev_pub')
  })
})
