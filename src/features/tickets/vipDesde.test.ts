import { describe, it, expect } from 'vitest'
import type { TicketPlan } from '../../data/types'
import { vipDesde } from './vipDesde'
import { seedPlans } from '../../config/plans'

/**
 * El cartel "VIP desde $…" salía mal en producción y bien en la demo: la API real devuelve
 * el Combo VIP ($50.000) ANTES que los VIP de $30.000, y el código tomaba el primero de la
 * lista en vez del más barato. Los tests fijan el orden de la API real, no el del seed.
 */

function plan(over: Partial<TicketPlan> & Pick<TicketPlan, 'id' | 'price' | 'kind'>): TicketPlan {
  return {
    name: over.id,
    tagline: '',
    serviceCharge: 0,
    mpLink: null,
    perks: [],
    day: 'sabado',
    ...over,
  } as TicketPlan
}

/** Orden REAL que devuelve la API (verificado contra producción, 21/07). */
const ORDEN_API: TicketPlan[] = [
  plan({ id: 'sab-general', price: 0, kind: 'general' }),
  plan({ id: 'dom-general', price: 0, kind: 'general' }),
  plan({ id: 'combo-vip', price: 50000, kind: 'vip', day: 'combo' }),
  plan({ id: 'sab-night-vip', price: 30000, kind: 'vip' }),
  plan({ id: 'dom-sunset-vip', price: 30000, kind: 'vip', day: 'domingo' }),
]

describe('vipDesde — "desde" es el MÍNIMO, no el primero de la lista', () => {
  it('con el orden de la API real (Combo VIP $50.000 primero) devuelve 30.000', () => {
    expect(vipDesde(ORDEN_API)).toBe(30000)
  })

  it('no depende del orden: invertida da lo mismo', () => {
    expect(vipDesde([...ORDEN_API].reverse())).toBe(30000)
  })

  it('ignora los planes generales aunque sean más baratos', () => {
    // Los gratis valen 0: si se colaran, el cartel diría "VIP desde $0".
    expect(vipDesde(ORDEN_API)).not.toBe(0)
  })

  it('ignora los VIP con precio pendiente (price null)', () => {
    const conPendiente = [...ORDEN_API, plan({ id: 'combo-vip', price: null, kind: 'vip' })]
    expect(vipDesde(conPendiente)).toBe(30000)
  })

  it('sin VIP con precio devuelve null y NUNCA Infinity', () => {
    // Math.min() de vacío da Infinity; los tres llamadores esperan null para ocultar el cartel.
    expect(vipDesde([plan({ id: 'sab-general', price: 0, kind: 'general' })])).toBeNull()
    expect(vipDesde([])).toBeNull()
    expect(vipDesde([plan({ id: 'combo-vip', price: null, kind: 'vip' })])).toBeNull()
  })

  it('sobre el seed real también da el VIP más barato', () => {
    expect(vipDesde(seedPlans)).toBe(30000)
  })
})
