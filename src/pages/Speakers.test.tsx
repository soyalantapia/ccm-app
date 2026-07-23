import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const fakeGroup = {
  eventId: 'ev-2026',
  eventTitle: 'CCM 2026',
  eventDate: '2026-09-19',
  speakers: [
    {
      id: 'c1',
      slug: 'carolina',
      name: 'Carolina Curti',
      role: 'Speaker',
      kind: 'speaker',
      platform: 'Moda',
      city: 'Córdoba',
      bio: 'b',
      photo: 'p',
      verified: true,
      participatesIn: [],
      portfolio: [],
      quote: 'Inspiro',
    },
  ],
}

// Mutable para poder simular el estado vacío en un segundo test sin resetear módulos.
let grupos: (typeof fakeGroup)[] = [fakeGroup]

vi.mock('../data/store', () => ({
  store: { track: vi.fn() },
  useStore: (sel: (s: unknown) => unknown) => sel({ getSpeakersByEvent: () => grupos }),
  useDataVersion: () => 0,
}))

beforeEach(() => {
  cleanup()
  grupos = [fakeGroup]
})

describe('Speakers', () => {
  it('muestra el evento y el speaker con su frase', async () => {
    const Speakers = (await import('./Speakers')).default
    render(
      <MemoryRouter>
        <Speakers />
      </MemoryRouter>,
    )
    expect(screen.getByText('CCM 2026')).toBeDefined()
    expect(screen.getByText('Carolina Curti')).toBeDefined()
    expect(screen.getByText(/Inspiro/)).toBeDefined()
  })

  it('muestra un estado vacío si no hay grupos de speakers', async () => {
    grupos = []
    const Speakers = (await import('./Speakers')).default
    render(
      <MemoryRouter>
        <Speakers />
      </MemoryRouter>,
    )
    expect(screen.queryByText('CCM 2026')).toBeNull()
  })
})
