import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TicketPlan } from '../../data/types'

/**
 * El "Desde $…" de las galas se leía del PRIMER plan VIP de la lista. Como la API real
 * devuelve el Combo VIP ($50.000) antes que los de $30.000, producción anunciaba
 * "Desde $50.000" con una entrada VIP de $30.000 a la venta. En la demo el seed venía en
 * el orden inverso, así que el bug no se veía. Este test fija el orden de la API real.
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

const estado = { plans: [] as TicketPlan[] }

vi.mock('../../data/store', () => ({
  store: {},
  useStore: (sel: (s: unknown) => unknown) => sel({ getPlans: () => estado.plans }),
}))

const { GalasSection } = await import('./GalasSection')

const pintar = () => render(<MemoryRouter><GalasSection /></MemoryRouter>)

beforeEach(() => {
  cleanup()
  estado.plans = [
    plan({ id: 'sab-general', price: 0, kind: 'general' }),
    plan({ id: 'combo-vip', price: 50000, kind: 'vip', day: 'combo' }),
    plan({ id: 'sab-night-vip', price: 30000, kind: 'vip' }),
    plan({ id: 'dom-sunset-vip', price: 30000, kind: 'vip', day: 'domingo' }),
  ]
})

describe('GalasSection — el "Desde" no puede ser más caro que la entrada más barata', () => {
  it('con el orden de la API real anuncia $30.000, no $50.000', () => {
    pintar()
    expect(screen.getByText(/Desde\s*\$\s*30\.000/)).toBeDefined()
    expect(screen.queryByText(/50\.000/), 'no puede anunciar el Combo como precio "desde"').toBeNull()
  })

  it('sin VIP con precio no inventa un "Desde" (ni Infinity)', () => {
    estado.plans = [plan({ id: 'sab-general', price: 0, kind: 'general' })]
    pintar()
    expect(screen.queryByText(/Desde/)).toBeNull()
    expect(screen.queryByText(/Infinity|∞/)).toBeNull()
  })
})
