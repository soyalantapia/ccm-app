import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { UsuariosTabla } from './UsuariosTabla'
import type { PersonaListItem } from '../../data/queries'

// Sin `globals: true` en vitest.config.ts, el auto-cleanup de testing-library no se
// engancha solo (necesita ver un `afterEach` global): se limpia a mano, como en
// src/pages/admin/Dashboard.test.tsx.
afterEach(cleanup)

const persona: PersonaListItem = {
  id: 'p1', nombre: 'Ana Pérez', email: 'ana@x.com', telefono: '351 555', dni: '38456120',
  esSocio: true, inscripciones: 2, postulaciones: 1,
  creadaEl: '2026-07-01T10:00:00.000Z', ultimaActividad: '2026-07-19T10:00:00.000Z',
}

describe('UsuariosTabla', () => {
  it('muestra el nombre y el contacto', () => {
    render(<UsuariosTabla items={[persona]} onAbrir={() => {}} />)
    expect(screen.getByText('Ana Pérez')).toBeTruthy()
    // Email y teléfono comparten un mismo nodo de texto ("ana@x.com · 351 555"): compacto
    // a propósito para que entren en la tarjeta apilada de mobile. Match por substring.
    expect(screen.getByText(/ana@x\.com/)).toBeTruthy()
  })

  it('marca a los socios', () => {
    render(<UsuariosTabla items={[persona]} onAbrir={() => {}} />)
    expect(screen.getByText(/socio/i)).toBeTruthy()
  })

  it('avisa cuando alguien no dejó su nombre', () => {
    render(<UsuariosTabla items={[{ ...persona, nombre: null }]} onAbrir={() => {}} />)
    expect(screen.getByText(/sin nombre/i)).toBeTruthy()
  })

  it('abre la ficha al tocar la fila', () => {
    const onAbrir = vi.fn()
    render(<UsuariosTabla items={[persona]} onAbrir={onAbrir} />)
    fireEvent.click(screen.getByText('Ana Pérez'))
    expect(onAbrir).toHaveBeenCalledWith('p1')
  })
})
