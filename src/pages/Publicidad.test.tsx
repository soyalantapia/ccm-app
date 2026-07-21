import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { config } from '../config'

/**
 * Mismo bug que en Membresía: el paso de pago mostraba un QR a una URL de Mercado Pago
 * inventada (`/checkout/ccm?slot=…`) que devuelve "La página que buscás ya no existe".
 */

vi.mock('../data/store', () => ({
  store: { track: vi.fn(), createCampaign: vi.fn() },
  useStore: (sel: (s: unknown) => unknown) => sel({}),
  useDataVersion: () => 0,
}))

// jsdom no implementa getContext(): el QR real explota. Sólo nos importa SI se pinta y con qué.
vi.mock('../components/ui/QR', () => ({
  QR: ({ value }: { value: string }) => <canvas data-testid="qr" data-value={value} />,
}))

async function pintarEnPasoPago() {
  const Publicidad = (await import('./Publicidad')).default
  render(<MemoryRouter><Publicidad /></MemoryRouter>)
  // Paso 1: elegir el primer espacio.
  fireEvent.click(screen.getAllByRole('button', { name: /Elegir/i })[0])
  // Paso 2: marca + titular (los dos obligatorios) y continuar.
  const inputs = document.querySelectorAll('input[type="text"], input:not([type])')
  fireEvent.change(inputs[0], { target: { value: 'Marca de prueba' } })
  fireEvent.change(inputs[1], { target: { value: 'Titular de prueba' } })
  fireEvent.click(screen.getByRole('button', { name: /Continuar al pago/i }))
}

beforeEach(() => {
  cleanup()
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Publicidad — el QR de pago no puede llevar a una URL que no existe', () => {
  it('SIN link configurado: no hay QR y se ofrece coordinar el pago', async () => {
    await pintarEnPasoPago()

    expect(screen.queryByTestId('qr'), 'no puede haber QR sin link de cobro real').toBeNull()
    expect(screen.queryByText(/Escaneá el QR/i)).toBeNull()
    expect(screen.getByText(/El pago lo coordinamos con vos/i)).toBeDefined()
    const ig = screen.getByText(config.instagramHandle) as HTMLAnchorElement
    expect(ig.getAttribute('href')).toBe(config.instagramUrl)
    expect(document.body.innerHTML).not.toContain('checkout/ccm')
  }, 30_000)

  it('CON link real de MP: vuelve el QR y el botón de pago', async () => {
    vi.stubEnv('VITE_MP_LINK_PUBLICIDAD', 'https://mpago.la/9zyXwV')
    await pintarEnPasoPago()

    expect(screen.getByTestId('qr').getAttribute('data-value')).toBe('https://mpago.la/9zyXwV')
    expect(
      screen.getByRole('link', { name: /Abrir el pago en Mercado Pago/i }).getAttribute('href'),
    ).toBe('https://mpago.la/9zyXwV')
    expect(screen.queryByText(/El pago lo coordinamos con vos/i)).toBeNull()
  }, 30_000)
})
