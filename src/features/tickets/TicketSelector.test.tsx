import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { PlanId, TicketOrder, TicketPlan } from '../../data/types'
import { MP_PLACEHOLDER } from '../../config/plans'

/**
 * Tests del cierre de la compra de entradas. Lo que se protege acá es plata: que el comprador
 * nunca termine en una página que no le cobra nada mientras la UI le dice que su pago está en
 * camino, que el cobro cubra TODAS las órdenes del carrito, y que el cobro no se pida antes de
 * que las órdenes existan en el backend.
 */

const planVip = (over: Partial<TicketPlan> = {}): TicketPlan => ({
  id: 'sab-night-vip',
  eventId: 'ev-principal-2026',
  name: 'Sábado · Night VIP',
  tagline: 'Desfile de las Estrellas',
  price: 30000,
  serviceCharge: 3000,
  mpLink: MP_PLACEHOLDER,
  day: 'sabado',
  kind: 'vip',
  perks: [],
  ...over,
})

const orden = (id: string, planId: PlanId, total: number): TicketOrder => ({
  id,
  planId,
  qty: 1,
  total,
  status: 'iniciada',
  ts: new Date().toISOString(),
})

let planes: TicketPlan[] = []
const createOrders = vi.fn()
const startCheckout = vi.fn()
const markOrderRedirected = vi.fn()
const toastSpy = vi.fn()

vi.mock('../../data/store', () => {
  const estado = {
    getPlans: () => planes,
    isRegistered: () => false,
  }
  return {
    store: {
      createOrders: (...a: unknown[]) => createOrders(...a),
      startCheckout: (...a: unknown[]) => startCheckout(...a),
      markOrderRedirected: (...a: unknown[]) => markOrderRedirected(...a),
      getPlan: (id: string) => planes.find((p) => p.id === id),
    },
    useStore: (sel: (s: unknown) => unknown) => sel(estado),
    IS_REMOTE: true,
  }
})

vi.mock('../../lib/profileRequest', () => ({ requireProfile: () => Promise.resolve(true) }))
vi.mock('../../lib/actions', () => ({ registerFree: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ui')>()),
  toast: (...a: unknown[]) => toastSpy(...a),
}))

// Import DESPUÉS de los mocks (vi.mock se iza, pero el componente se evalúa al importarse).
const { TicketSelector } = await import('./TicketSelector')

/** jsdom no navega: se reemplaza location para poder afirmar que NO se redirigió a ningún lado. */
let hrefNavegado = ''
const locationOriginal = window.location

beforeEach(() => {
  vi.clearAllMocks()
  cleanup()
  planes = [planVip()]
  hrefNavegado = ''
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...locationOriginal,
      get href() {
        return hrefNavegado
      },
      set href(v: string) {
        hrefNavegado = v
      },
    },
  })
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: locationOriginal })
})

const sumarUna = (nombre = /agregar sábado/i) => fireEvent.click(screen.getByLabelText(nombre))
const continuar = () => fireEvent.click(screen.getByRole('button', { name: /continuar/i }))

/**
 * P0-E. `MP_PLACEHOLDER` es la PORTADA de mercadopago.com.ar, no un cobro. Cuando no hay checkout
 * real, el fallback agarraba ese "link" del plan, el guard `if (!pending.mpLink)` no lo atrapaba
 * (no está vacío) y el comprador terminaba en la home de MP mientras la UI le decía que su pago
 * se estaba confirmando. Mentirle es peor que cortar la venta.
 */
describe('sin cobro real, el comprador se entera — no lo mandamos a la portada de Mercado Pago', () => {
  it('no redirige, no marca la orden como redirigida y avisa con un mensaje honesto', async () => {
    createOrders.mockResolvedValue([orden('ord_1', 'sab-night-vip', 33000)])
    startCheckout.mockResolvedValue(null) // MP no conectado / preferencia no armada

    render(<TicketSelector />)
    sumarUna()
    continuar()

    await waitFor(() => expect(startCheckout).toHaveBeenCalled())

    // Lo no negociable: nunca se navega a la portada de MP.
    expect(hrefNavegado).toBe('')
    expect(hrefNavegado).not.toContain('mercadopago')
    expect(markOrderRedirected).not.toHaveBeenCalled()

    // Y no se abre el sheet que promete "Te llevamos a Mercado Pago".
    expect(screen.queryByRole('button', { name: /ir a mercado pago/i })).toBeNull()

    // El comprador se entera: el aviso dice que NO quedó pago.
    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    const mensaje = String(toastSpy.mock.calls.at(-1)?.[0] ?? '')
    expect(mensaje.toLowerCase()).toMatch(/no.*(pud|pag)/)
  })

  it('un mpLink propio de verdad (cargado a mano por el organizador) sigue siendo válido', async () => {
    planes = [planVip({ mpLink: 'https://mpago.la/2abc9Xy' })]
    createOrders.mockResolvedValue([orden('ord_1', 'sab-night-vip', 33000)])
    startCheckout.mockResolvedValue(null)

    render(<TicketSelector />)
    sumarUna()
    continuar()

    const ir = await screen.findByRole('button', { name: /ir a mercado pago/i })
    fireEvent.click(ir)
    expect(hrefNavegado).toBe('https://mpago.la/2abc9Xy')
    expect(markOrderRedirected).toHaveBeenCalledWith('ord_1')
  })
})

/** P0-D: el carrito de dos planes se cobraba por UNA sola orden. */
describe('multi-plan: un solo cobro por TODAS las órdenes', () => {
  it('manda las dos órdenes al checkout y redirige al initPoint real', async () => {
    planes = [planVip(), planVip({ id: 'combo-vip', name: 'Combo VIP', price: 50000, serviceCharge: 5000 })]
    createOrders.mockResolvedValue([
      orden('ord_a', 'sab-night-vip', 33000),
      orden('ord_b', 'combo-vip', 55000),
    ])
    startCheckout.mockResolvedValue({ initPoint: 'https://mp/checkout/pref_1', amount: 88000 })

    render(<TicketSelector />)
    sumarUna()
    sumarUna(/agregar combo vip/i)
    continuar()

    await waitFor(() => expect(startCheckout).toHaveBeenCalled())
    expect(startCheckout).toHaveBeenCalledWith([
      { kind: 'ticket_order', resourceId: 'ord_a' },
      { kind: 'ticket_order', resourceId: 'ord_b' },
    ])

    fireEvent.click(await screen.findByRole('button', { name: /ir a mercado pago/i }))
    expect(hrefNavegado).toBe('https://mp/checkout/pref_1')
    expect(markOrderRedirected).toHaveBeenCalledWith('ord_a')
    expect(markOrderRedirected).toHaveBeenCalledWith('ord_b')
  })
})

/** P1-F: el cobro salía en el mismo tick que el POST /orders (fire-and-forget) → 404. */
describe('el cobro espera a que las órdenes existan de verdad', () => {
  it('no pide la preferencia hasta que createOrders resolvió', async () => {
    let resolver: (o: TicketOrder[]) => void = () => {}
    createOrders.mockReturnValue(new Promise<TicketOrder[]>((res) => { resolver = res }))
    startCheckout.mockResolvedValue({ initPoint: 'https://mp/checkout/pref_1', amount: 33000 })

    render(<TicketSelector />)
    sumarUna()
    continuar()

    await waitFor(() => expect(createOrders).toHaveBeenCalled())
    // Todavía no existe la orden en el backend: pedir el cobro acá da RESOURCE_NOT_FOUND.
    expect(startCheckout).not.toHaveBeenCalled()

    resolver([orden('ord_1', 'sab-night-vip', 33000)])
    await waitFor(() => expect(startCheckout).toHaveBeenCalled())
  })
})

/**
 * "Vacío = a confirmar, no se vende todavía" es lo que promete el formulario del panel al cargar
 * un tipo de entrada sin precio. Nada lo hacía cumplir: la entrada salía con el stepper puesto,
 * `p.price ?? 0` la mostraba en "$0" y el comprador podía cerrar una orden por cero pesos.
 */
describe('un tipo de entrada sin precio se anuncia, no se vende', () => {
  it('no muestra $0 ni el stepper: dice que el precio está a confirmar', () => {
    planes = [planVip({ id: 'sunset-vip', name: 'Sunset VIP', price: null })]
    render(<TicketSelector />)
    expect(screen.getByText('Sunset VIP')).toBeTruthy()
    expect(screen.getByText(/Precio a confirmar/i)).toBeTruthy()
    expect(screen.queryByLabelText('Agregar Sunset VIP')).toBeNull()
  })

  it('no entra en el total ni deja llegar al checkout', () => {
    planes = [planVip({ id: 'sunset-vip', name: 'Sunset VIP', price: null })]
    render(<TicketSelector />)
    // Sin nada comprable, la barra sticky del total no aparece.
    expect(screen.queryByText(/Continuar/i)).toBeNull()
    expect(createOrders).not.toHaveBeenCalled()
  })

  it('la de al lado, con precio, se sigue vendiendo normal', () => {
    planes = [planVip({ id: 'sunset-vip', name: 'Sunset VIP', price: null }), planVip()]
    render(<TicketSelector />)
    expect(screen.getByLabelText('Agregar Sábado · Night VIP')).toBeTruthy()
  })
})
