import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { EventItem, TicketPlan } from '../../data/types'

/**
 * "Experiencias especiales" del evento principal = sus tipos de entrada VIP, no una lista fija.
 * Antes era un array hardcodeado (Night VIP / Sunset VIP) con sólo el precio en vivo: renombrar,
 * agregar o retirar un VIP en el panel no se reflejaba acá. Estos tests fijan que salga de los
 * planes reales del evento (getPlans ya excluye las retiradas y acota al evento).
 */

const plan = (over: Partial<TicketPlan>): TicketPlan => ({
  id: 'p',
  eventId: 'ev-principal',
  name: 'x',
  tagline: '',
  price: 30000,
  serviceCharge: 3000,
  mpLink: null,
  perks: [],
  kind: 'vip',
  ...over,
})

let plans: TicketPlan[] = []
const fakeStore = {
  getPlans: (eventId?: string) => plans.filter((p) => !eventId || p.eventId === eventId),
  getBlocks: () => [],
  isRegistered: () => false,
}

vi.mock('../../data/store', () => ({
  store: fakeStore,
  useStore: (sel: (s: unknown) => unknown) => sel(fakeStore),
}))

// TicketSelector y BlockRow tienen sus propias suites y arrastran el api real; acá sólo importa
// el bloque de experiencias.
vi.mock('../tickets/TicketSelector', () => ({ TicketSelector: () => <div>selector</div> }))
vi.mock('./BlockRow', () => ({ BlockRow: () => <div>bloque</div> }))

const EVENT: EventItem = {
  id: 'ev-principal',
  slug: 'ccm-2026',
  type: 'principal',
  title: 'Expo CCM',
  dateLabel: '19 y 20 de septiembre',
  startDate: '2026-09-19',
  venue: 'Hotel',
  address: 'Calle 1',
  mapsUrl: 'https://maps.example',
  description: 'La expo.',
  cover: 'img/x.jpg',
  published: true,
} as EventItem

async function montar() {
  const { PrincipalBody } = await import('./PrincipalBody')
  render(<MemoryRouter><PrincipalBody event={EVENT} /></MemoryRouter>)
}

beforeEach(() => {
  cleanup()
  plans = []
})

describe('Experiencias especiales = VIP del evento (dinámico)', () => {
  it('lista los VIP del evento con su nombre, bajada y precio reales', async () => {
    plans = [
      plan({ id: 'night', name: 'Sábado · Night VIP', tagline: 'Desfile de las Estrellas', price: 30000 }),
      plan({ id: 'sunset', name: 'Domingo · Sunset VIP', tagline: 'Desfile Internacional', price: 35000 }),
    ]
    await montar()
    expect(screen.getByText('Sábado · Night VIP')).toBeTruthy()
    expect(screen.getByText('Domingo · Sunset VIP')).toBeTruthy()
    expect(screen.getByText('Desfile Internacional')).toBeTruthy()
    // El precio es el de CADA plan, no un "desde" global (formatMoney usa nbsp → regex).
    expect(screen.getByText(/35\.000/)).toBeTruthy()
    expect(screen.getByText(/30\.000/)).toBeTruthy()
  })

  it('un VIP nuevo aparece sin tocar el código', async () => {
    plans = [plan({ id: 'gala', name: 'Gala VIP', tagline: 'Cierre', price: 50000 })]
    await montar()
    expect(screen.getByText('Gala VIP')).toBeTruthy()
  })

  it('sin VIP, el bloque "Experiencias especiales" no se muestra', async () => {
    plans = [plan({ id: 'gen', name: 'General', kind: 'general', price: null })]
    await montar()
    expect(screen.queryByText(/Experiencias especiales/i)).toBeNull()
  })

  it('sólo muestra los VIP: una entrada general no entra al bloque premium', async () => {
    plans = [
      plan({ id: 'night', name: 'Sábado · Night VIP', price: 30000 }),
      plan({ id: 'gen', name: 'Entrada general', kind: 'general', price: null }),
    ]
    await montar()
    expect(screen.getByText('Sábado · Night VIP')).toBeTruthy()
    expect(screen.queryByText('Entrada general')).toBeNull()
  })
})
