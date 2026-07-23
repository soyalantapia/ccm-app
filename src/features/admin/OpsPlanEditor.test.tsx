import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OpsPlanEditor } from './OpsPlanEditor'
import type { TicketPlan } from '../../data/types'

/**
 * "Retirar de la venta" es la salida cuando una entrada ya se vendió (no se puede borrar sin
 * llevarse el registro) o cuando terminó la preventa. Estos tests fijan que el toggle mande el
 * patch correcto y que una entrada retirada se muestre sin los campos de edición, con la opción
 * de reactivarla.
 */

vi.mock('../../data/store', () => ({
  store: { updatePlan: vi.fn() },
}))

const plan = (over: Partial<TicketPlan> = {}): TicketPlan => ({
  id: 'p1',
  eventId: 'ev_1',
  name: 'Sábado · Night VIP',
  tagline: 'Desfile de las Estrellas',
  price: 30000,
  serviceCharge: 3000,
  mpLink: null,
  perks: [],
  kind: 'vip',
  archived: false,
  ...over,
})

async function updatePlanMock() {
  const { store } = await import('../../data/store')
  return store.updatePlan as ReturnType<typeof vi.fn>
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('retirar una entrada de la venta', () => {
  it('una entrada activa muestra el botón "Retirar de la venta"', () => {
    render(<OpsPlanEditor plan={plan()} />)
    expect(screen.getByText(/Retirar de la venta/i)).toBeTruthy()
  })

  it('al retirar manda archived: true', async () => {
    render(<OpsPlanEditor plan={plan()} />)
    fireEvent.click(screen.getByText(/Retirar de la venta/i))
    expect(await updatePlanMock()).toHaveBeenCalledWith('p1', { archived: true })
  })

  it('una entrada retirada se muestra en estado "Retirada", sin los campos de precio/link', () => {
    render(<OpsPlanEditor plan={plan({ archived: true })} />)
    expect(screen.getByText(/Retirada/i)).toBeTruthy()
    // No hay editor de precio ni link cuando está retirada.
    expect(screen.queryByText('Link de pago Mercado Pago')).toBeNull()
    expect(screen.getByText(/Volver a la venta/i)).toBeTruthy()
  })

  it('al reactivar manda archived: false', async () => {
    render(<OpsPlanEditor plan={plan({ archived: true })} />)
    fireEvent.click(screen.getByText(/Volver a la venta/i))
    expect(await updatePlanMock()).toHaveBeenCalledWith('p1', { archived: false })
  })

  it('la retirada aclara que las ventas anteriores siguen válidas', () => {
    render(<OpsPlanEditor plan={plan({ archived: true })} />)
    expect(screen.getByText(/ventas anteriores siguen válidas/i)).toBeTruthy()
  })

  it('NO crashea al togglear una tarjeta MONTADA (activa→retirada→activa)', () => {
    // El bug bloqueante: había un `if (archived) return` antes de dos useState, así que retirar
    // una tarjeta ya montada bajaba el conteo de hooks de 2 a 0 y React crasheaba. Renderizar
    // instancias frescas (como los tests de arriba) no lo agarraba: sólo se dispara al cambiar el
    // prop de una instancia viva, que es exactamente lo que hace "Retirar de la venta".
    const errores: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errores.push(a))
    try {
      const { rerender } = render(<OpsPlanEditor plan={plan({ archived: false })} />)
      expect(screen.getByText(/Retirar de la venta/i)).toBeTruthy()
      // Simula el efecto de retirar: el mismo plan vuelve con archived=true.
      rerender(<OpsPlanEditor plan={plan({ archived: true })} />)
      expect(screen.getByText(/Volver a la venta/i)).toBeTruthy()
      // Y de vuelta a la venta.
      rerender(<OpsPlanEditor plan={plan({ archived: false })} />)
      expect(screen.getByText(/Retirar de la venta/i)).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
    const hookError = errores.find((e) => /hook/i.test(JSON.stringify(e)))
    expect(hookError, `React tiró un error de hooks: ${JSON.stringify(hookError)}`).toBeUndefined()
  })
})
