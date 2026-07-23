import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { TicketOrder, TicketPlan } from '../../data/types'

/**
 * "Tus órdenes" resuelve el nombre de la entrada. La regresión que introdujo el feature de
 * retirar: cuando el organizador retira un tipo de entrada YA vendido, /plans deja de traerlo, así
 * que del lado del comprador getPlans no lo tiene y se veía el id crudo (p.ej. "vip-sabado-ab12").
 *
 * El arreglo: la orden viaja con su nombre resuelto por el server (order.planName), que sí ve las
 * retiradas. Este test fija que el nombre salga de la orden, no de getPlans.
 */

let orders: TicketOrder[] = []
let plans: TicketPlan[] = []
const fakeStore = { getOrders: () => orders, getPlans: () => plans }

vi.mock('../../data/store', () => ({
  useStore: (sel: (s: unknown) => unknown) => sel(fakeStore),
}))

const orden = (over: Partial<TicketOrder>): TicketOrder => ({
  id: 'ord_1',
  planId: 'vip-sabado-ab12',
  ts: '2026-09-01T10:00:00.000Z',
  status: 'confirmada',
  qty: 1,
  total: 33000,
  ...over,
})

beforeEach(() => {
  cleanup()
  orders = []
  plans = []
})

describe('OrdersSection resuelve el nombre aunque la entrada se haya retirado', () => {
  async function montar() {
    const { OrdersSection } = await import('./OrdersSection')
    render(<OrdersSection />)
  }

  it('muestra el nombre que viaja en la orden, no el id crudo, cuando getPlans no la tiene', async () => {
    // getPlans vacío = la entrada fue retirada de la venta (no está en /plans del comprador).
    orders = [orden({ planName: 'Sábado · Night VIP' })]
    plans = []
    await montar()
    expect(screen.getByText('Sábado · Night VIP')).toBeTruthy()
    expect(screen.queryByText('vip-sabado-ab12')).toBeNull()
  })

  it('si la entrada sigue a la venta, también funciona (nombre de la orden o de getPlans)', async () => {
    orders = [orden({ planName: undefined })]
    plans = [{ id: 'vip-sabado-ab12', eventId: 'ev_1', name: 'Sábado · Night VIP', tagline: '', price: 30000, serviceCharge: 3000, mpLink: null, perks: [], kind: 'vip' }]
    await montar()
    expect(screen.getByText('Sábado · Night VIP')).toBeTruthy()
  })

  it('último recurso: si no hay ni nombre en la orden ni en getPlans, muestra el id (no rompe)', async () => {
    orders = [orden({ planName: undefined })]
    plans = []
    await montar()
    expect(screen.getByText('vip-sabado-ab12')).toBeTruthy()
  })
})
