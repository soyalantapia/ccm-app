import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TicketOrder, Registration } from '../../data/types'

/**
 * Mi QR tenía TODO el hub (entradas VIP, suscripción, beneficios) dentro de la rama
 * "está inscripto" de un ternario que sólo miraba `registrations`. Resultado: quien compraba
 * una entrada VIP y no se inscribía gratis leía "Todavía no tenés tu QR" y su compra no
 * aparecía por ningún lado — justo después de que el checkout le prometió que iba a estar ahí.
 */

const estado = {
  registrations: [] as Registration[],
  orders: [] as TicketOrder[],
  isSocio: false,
}

const fakeStore = {
  track: vi.fn(),
  getRegistrations: () => estado.registrations,
  getOrders: () => estado.orders,
  getEventById: () => undefined,
  isSocio: () => estado.isSocio,
  getProfile: () => ({ consents: {} }),
  getMyApplications: () => [],
  getFavorites: () => [],
  getDownloads: () => [],
  getConvocatoria: () => undefined,
  getPlan: (id: string) => ({ id, name: id === 'combo-vip' ? 'Combo VIP · Sábado + Domingo' : id }),
  getBlock: () => undefined,
}

vi.mock('../../data/store', () => ({
  store: fakeStore,
  useStore: (sel: (s: unknown) => unknown) => sel(fakeStore),
}))
vi.mock('../../lib/actions', () => ({ registerFree: vi.fn() }))
vi.mock('../../features/app/AccreditationCard', () => ({ AccreditationCard: () => <div>ACREDITACION</div> }))
vi.mock('../../features/app/ProfileCompleteCard', () => ({ ProfileCompleteCard: () => null }))
vi.mock('../../features/app/ProfileFieldRow', () => ({ ProfileFieldRow: () => null }))
vi.mock('../../components/ui/AdBanner', () => ({ AdBanner: () => null }))

const MiQR = (await import('./MiQR')).default

const pintar = () => render(<MemoryRouter><MiQR /></MemoryRouter>)

const orden = (planId: string): TicketOrder =>
  ({ id: `o-${planId}`, planId, ts: '2026-07-20T12:00:00.000Z', status: 'confirmada', qty: 1 }) as TicketOrder

const inscripcion = (): Registration =>
  ({ id: 'r1', eventId: 'e1', ts: '2026-07-20T12:00:00.000Z', status: 'confirmada' }) as Registration

beforeEach(() => {
  cleanup()
  estado.registrations = []
  estado.orders = []
  estado.isSocio = false
})

describe('Mi QR — la compra VIP se ve aunque no haya inscripción gratuita', () => {
  it('COMPRÓ VIP y NO se inscribió: ve su entrada', () => {
    estado.orders = [orden('combo-vip')]
    pintar()

    // Lo que rompía: el bloque de entradas vivía dentro de la rama "registrado".
    expect(screen.getByText(/Tus entradas VIP/i)).toBeDefined()
    expect(screen.getByText(/Combo VIP/)).toBeDefined()
  })

  it('COMPRÓ VIP y NO se inscribió: el vacío no le dice que no tiene nada', () => {
    estado.orders = [orden('combo-vip')]
    pintar()

    expect(screen.queryByText(/Todavía no tenés tu QR/i), 'sí tiene una compra').toBeNull()
    expect(screen.getByText(/Tu compra quedó registrada/i)).toBeDefined()
    // Y le sigue ofreciendo la inscripción gratuita, que es lo que le falta de verdad.
    expect(screen.getByRole('button', { name: /Registrate gratis/i })).toBeDefined()
  })

  it('SIN compra y SIN inscripción: el vacío de siempre', () => {
    pintar()
    expect(screen.getByText(/Todavía no tenés tu QR/i)).toBeDefined()
    expect(screen.queryByText(/Tus entradas VIP/i)).toBeNull()
  })

  it('SOCIO sin inscripción: ve su membresía activa (mismo bug de anidado)', () => {
    estado.isSocio = true
    pintar()
    expect(screen.getByText(/Mi Suscripción/i)).toBeDefined()
    expect(screen.getByText(/Tu membresía premium está activa/i)).toBeDefined()
  })

  it('INSCRIPTO y con compra: sigue viendo acreditación + entradas', () => {
    estado.registrations = [inscripcion()]
    estado.orders = [orden('combo-vip')]
    pintar()

    expect(screen.getByText('ACREDITACION')).toBeDefined()
    expect(screen.getByText(/Tus entradas VIP/i)).toBeDefined()
    // Y una sola vez: mover el bloque no puede duplicarlo.
    expect(screen.getAllByText(/Tus entradas VIP/i).length).toBe(1)
    expect(screen.getAllByText(/Mi Suscripción/i).length).toBe(1)
  })
})
