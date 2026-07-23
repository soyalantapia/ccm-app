import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { EventItem } from '../data/types'

/**
 * Las iniciativas se ven en DOS lugares y en ninguno más: la ficha de su evento padre y el panel.
 * La grilla general las esconde a propósito (esDePrimerNivel), así que si la ficha del padre no
 * las muestra, no existen para el público salvo por link directo.
 *
 * El evento PRINCIPAL usa otro layout (PrincipalBody) y la sección vivía adentro del `else`: un
 * taller colgado de CCM 2026 —el caso más obvio, el que el propio panel invita a cargar— no
 * aparecía en ninguna pantalla. No fallaba nada: la sección simplemente no se renderizaba.
 */

const PRINCIPAL: EventItem = {
  id: 'ev-principal',
  slug: 'ccm-2026',
  type: 'principal',
  title: 'Expo CCM 2026',
  dateLabel: '19 y 20 de septiembre',
  startDate: '2026-09-19',
  venue: 'Hotel',
  address: 'Calle 1',
  mapsUrl: 'https://maps.example',
  description: 'x',
  cover: 'img/x.jpg',
  published: true,
} as EventItem

const CAMINO: EventItem = { ...PRINCIPAL, id: 'ev-camino', slug: 'camino', type: 'camino' }

const TALLER: EventItem = {
  ...PRINCIPAL,
  id: 'ini-taller',
  slug: 'taller-de-estampado',
  type: 'capacitacion',
  title: 'Taller de estampado',
  parentId: 'ev-principal',
}

const fakeStore = {
  track: vi.fn(),
  isSocio: () => false,
  isHydrating: () => false,
  getBlocks: () => [],
  getPlans: () => [],
  // Las fichas de tipo "camino" cuelgan el banner de convocatoria; sin convocatoria no pinta nada.
  getConvocatoria: () => undefined,
  // El CTA de inscripción mira si este dispositivo ya está anotado.
  getRegistrations: () => [],
}

vi.mock('../data/store', () => ({
  store: fakeStore,
  useStore: (sel: (s: unknown) => unknown) => sel(fakeStore),
  useDataVersion: () => 0,
}))

// PrincipalBody trae toda la expo (entradas, agenda, director) y no es lo que se está probando:
// lo que importa es que la ficha del principal muestre TAMBIÉN sus iniciativas.
vi.mock('../features/eventos/PrincipalBody', () => ({
  PrincipalBody: () => <div>cuerpo del evento principal</div>,
}))

let eventos: EventItem[] = []
vi.mock('../data/queries', () => ({ useEvents: () => eventos }))

async function verFicha(slug: string) {
  const EventoFicha = (await import('./EventoFicha')).default
  render(
    <MemoryRouter initialEntries={[`/eventos/${slug}`]}>
      <Routes>
        <Route path="/eventos/:slug" element={<EventoFicha />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('la ficha muestra las iniciativas que cuelgan del evento', () => {
  it('el evento PRINCIPAL también las muestra, no sólo los caminos', async () => {
    eventos = [PRINCIPAL, TALLER]
    await verFicha('ccm-2026')
    expect(screen.getByText('cuerpo del evento principal')).toBeTruthy()
    expect(screen.getByText('Taller de estampado')).toBeTruthy()
  })

  it('un camino las sigue mostrando', async () => {
    eventos = [CAMINO, { ...TALLER, parentId: 'ev-camino' }]
    await verFicha('camino')
    expect(screen.getByText('Taller de estampado')).toBeTruthy()
  })

  it('sin iniciativas no aparece la sección vacía', async () => {
    eventos = [PRINCIPAL]
    await verFicha('ccm-2026')
    expect(screen.queryByText(/Adentro de este evento/i)).toBeNull()
  })

  it('sólo muestra las suyas: una iniciativa de otro evento no se cuela', async () => {
    eventos = [PRINCIPAL, CAMINO, { ...TALLER, parentId: 'ev-camino' }]
    await verFicha('ccm-2026')
    expect(screen.queryByText('Taller de estampado')).toBeNull()
  })

  it('la iniciativa de un evento sólo-Socios sale con el candado puesto', async () => {
    // El taller nace SIN candado propio: el que manda es el del padre. Sin heredarlo, la tarjeta
    // promete una inscripción que el server rechaza con 403.
    eventos = [{ ...CAMINO, socioOnly: true }, { ...TALLER, parentId: 'ev-camino' }]
    await verFicha('camino')
    expect(screen.getAllByText(/Solo Socios/i).length).toBeGreaterThan(0)
  })
})
