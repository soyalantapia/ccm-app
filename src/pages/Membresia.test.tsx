import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { config } from '../config'

/**
 * El paso de pago mostraba un QR con una URL de Mercado Pago inventada
 * (`/checkout/ccm?…`) que devuelve "La página que buscás ya no existe": el socio escaneaba
 * y no podía pagar, creyendo que el circuito funcionaba. Hasta que haya link real,
 * mejor un mensaje honesto para coordinar el pago con el equipo.
 */

const fakeStore = {
  track: vi.fn(),
  becomeSocio: vi.fn(),
  isSocio: () => false,
  getEvents: () => [],
}

vi.mock('../data/store', () => ({
  store: fakeStore,
  useStore: (sel: (s: unknown) => unknown) => sel(fakeStore),
  useDataVersion: () => 0,
}))

// jsdom no implementa getContext(): el QR real explota. Sólo nos importa SI se pinta y con qué.
vi.mock('../components/ui/QR', () => ({
  QR: ({ value }: { value: string }) => <canvas data-testid="qr" data-value={value} />,
}))

async function pintarEnPasoPago() {
  const Membresia = (await import('./Membresia')).default
  render(<MemoryRouter><Membresia /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /Hacerme Socio/i }))
}

beforeEach(() => {
  cleanup()
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Membresía — el QR de pago no puede llevar a una URL que no existe', () => {
  it('SIN link configurado: no hay QR y se ofrece coordinar el pago', async () => {
    await pintarEnPasoPago()

    expect(document.querySelector('canvas'), 'no puede haber QR sin link de cobro real').toBeNull()
    expect(screen.queryByText(/Escaneá el QR/i)).toBeNull()
    expect(screen.getByText(/El pago lo coordinamos con vos/i)).toBeDefined()
    // Con el contacto que ya existía en la app, no uno inventado.
    const ig = screen.getByText(config.instagramHandle) as HTMLAnchorElement
    expect(ig.getAttribute('href')).toBe(config.instagramUrl)
  }, 30_000)

  it('SIN link configurado: la URL rota ya no aparece en ningún lado', async () => {
    await pintarEnPasoPago()
    expect(document.body.innerHTML).not.toContain('checkout/ccm')
  }, 30_000)

  it('CON link real de MP: vuelve el QR y el botón de pago', async () => {
    vi.stubEnv('VITE_MP_LINK_MEMBRESIA', 'https://mpago.la/2abcDeF')
    await pintarEnPasoPago()

    expect(screen.getByTestId('qr').getAttribute('data-value')).toBe('https://mpago.la/2abcDeF')
    const boton = screen.getByRole('link', { name: /Abrir el pago en Mercado Pago/i })
    expect(boton.getAttribute('href')).toBe('https://mpago.la/2abcDeF')
    expect(screen.queryByText(/El pago lo coordinamos con vos/i)).toBeNull()
  }, 30_000)
})
