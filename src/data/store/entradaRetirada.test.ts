import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'
import type { TicketPlan } from '../types'

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
 * Una entrada RETIRADA de la venta (archived) sigue existiendo pero no aparece en la app: sólo el
 * panel la ve, en gris, para reactivarla. Es el mismo split que borrador/publicado de los eventos:
 * la lectura pública (getPlans) la esconde, la del panel (getAdminPlans) la muestra.
 *
 * El caché público this.plans viene de /plans, que ya excluye las retiradas; el del panel
 * this.adminPlans viene de /admin/plans, que las incluye. Estos tests fijan que las dos lecturas
 * no se confundan —y que getPlans filtre archived aunque el caché público llegue a tener una
 * (la ventana optimista de un "retirar de la venta")—.
 */

const plan = (over: Partial<TicketPlan>): TicketPlan => ({
  id: 'p1',
  eventId: 'ev_1',
  name: 'Sábado · Night VIP',
  tagline: 'Desfile',
  price: 30000,
  serviceCharge: 3000,
  mpLink: null,
  perks: [],
  kind: 'vip',
  archived: false,
  ...over,
})

const ACTIVA = plan({ id: 'p-activa', archived: false })
const RETIRADA = plan({ id: 'p-retirada', archived: true, name: 'Sunset VIP (fin de preventa)' })

function storeCon(publicos: TicketPlan[], delPanel: TicketPlan[]): RemoteDataStore {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})))
  const s = new RemoteDataStore('https://api.example.test')
  ;(s as unknown as { plans: TicketPlan[] }).plans = publicos
  ;(s as unknown as { adminPlans: TicketPlan[] }).adminPlans = delPanel
  return s
}

describe('una entrada retirada se ve en el panel y NO en lo público', () => {
  beforeEach(() => {
    memoria = {}
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('sessionStorage', memoryStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('getAdminPlans trae la retirada; getPlans no', () => {
    const s = storeCon([ACTIVA], [ACTIVA, RETIRADA])
    expect(s.getAdminPlans().map((p) => p.id)).toEqual(['p-activa', 'p-retirada'])
    expect(s.getPlans().map((p) => p.id)).toEqual(['p-activa'])
  })

  it('getPlans filtra archived aunque el caché público la tenga (ventana optimista)', () => {
    // Al retirar, this.plans queda con la fila archived=true hasta que llega el refetch. Sin el
    // filtro en memoria seguiría a la venta ese instante.
    const s = storeCon([ACTIVA, RETIRADA], [ACTIVA, RETIRADA])
    expect(s.getPlans().map((p) => p.id)).toEqual(['p-activa'])
  })

  it('las dos lecturas siguen acotando por evento', () => {
    const deOtroEvento = plan({ id: 'p-otro', eventId: 'ev_2' })
    const s = storeCon([ACTIVA, deOtroEvento], [ACTIVA, RETIRADA, deOtroEvento])
    expect(s.getPlans('ev_1').map((p) => p.id)).toEqual(['p-activa'])
    expect(s.getAdminPlans('ev_1').map((p) => p.id)).toEqual(['p-activa', 'p-retirada'])
  })

  it('getAdminPlans cae al caché público mientras /admin/plans no llegó (nunca al seed)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})))
    const s = new RemoteDataStore('https://api.example.test')
    ;(s as unknown as { plans: TicketPlan[] }).plans = [ACTIVA]
    // adminPlans undefined: todavía no resolvió el fetch admin.
    expect(s.getAdminPlans().map((p) => p.id)).toEqual(['p-activa'])
  })
})
