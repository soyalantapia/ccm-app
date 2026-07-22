import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Application, Convocatoria } from '../../data/types'
import { ApplicationStatusPanel } from './ApplicationStatus'

/**
 * IMPORTANTE 6 del review: "aceptada" decía "¡Tenés tu lugar confirmado!" pero aceptar la
 * postulación NUNCA crea una `Registration` — no hay ningún lugar reservado en ningún lado.
 * Y el texto de "preinscripta" prometía que el equipo "confirma el lugar por teléfono", mientras
 * el mail nuevo (server/src/mail/templates.ts) dice "en los próximos días te escribimos" — dos
 * promesas de contacto distintas para el mismo hecho. Estos tests fijan que ninguno de los dos
 * textos prometa una reserva inexistente ni un canal de contacto que el mail no cumple.
 */

const convocatoria: Convocatoria = {
  id: 'conv-1',
  slug: 'camino',
  title: 'Camino a CCM 2026',
  intro: '',
  deadline: '2026-06-16',
  eventId: 'ev-1',
  fields: [],
}

function makeApp(status: Application['status']): Application {
  return {
    id: 'app-1',
    convocatoriaId: 'conv-1',
    ts: '2026-06-01T00:00:00-03:00',
    status,
    data: {},
  }
}

afterEach(() => cleanup())

const pintar = (status: Application['status']) =>
  render(
    <MemoryRouter>
      <ApplicationStatusPanel convocatoria={convocatoria} application={makeApp(status)} />
    </MemoryRouter>,
  )

describe('ApplicationStatusPanel — aceptada no promete una reserva inexistente', () => {
  it('NO dice "lugar confirmado" (aceptar no crea ninguna Registration)', () => {
    pintar('aceptada')
    expect(screen.queryByText(/lugar confirmado/i)).toBeNull()
  })

  it('dice que fue aceptada y que el equipo se contacta con los detalles — como el mail', () => {
    pintar('aceptada')
    expect(screen.getByText(/aceptó tu postulación/i)).toBeDefined()
    expect(screen.getByText(/en los próximos días te escribimos con los detalles/i)).toBeDefined()
  })
})

describe('ApplicationStatusPanel — preinscripta no contradice el mail de la decisión', () => {
  it('NO promete que el equipo confirma el lugar "por teléfono"', () => {
    pintar('preinscripta')
    expect(screen.queryByText(/por teléfono/i)).toBeNull()
  })

  it('usa el mismo "en los próximos días" que el mail de aceptación/rechazo', () => {
    pintar('preinscripta')
    expect(screen.getByText(/en los próximos días/i)).toBeDefined()
  })
})
