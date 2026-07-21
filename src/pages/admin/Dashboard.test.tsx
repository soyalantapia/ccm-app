import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * El Dashboard tiene tres formas de no tener números, y significan cosas opuestas:
 *
 *  1. el backend no contestó  → error, con reintento
 *  2. no hay backend (demo)   → estado FINAL, no hay nada que esperar
 *  3. la respuesta va en camino → carga transitoria
 *
 * El caso 2 no existía y caía en el 3: la demo mostraba un esqueleto pulsando y
 * "Calculando métricas…" para siempre. El propio comentario del componente decía
 * "tres estados … se distinguen", pero había dos ramas.
 */

const estado = { stats: null as unknown, fallo: false, backend: true }

vi.mock('../../data/store', () => ({
  store: { refetchAdminStats: vi.fn() },
  useStore: (sel: (s: unknown) => unknown) =>
    sel({
      getAdminStats: () => estado.stats,
      statsFailed: () => estado.fallo,
      hasBackend: () => estado.backend,
    }),
}))

const Dashboard = (await import('./Dashboard')).default

const pintar = () => render(<MemoryRouter><Dashboard /></MemoryRouter>)

beforeEach(() => {
  cleanup()
  estado.stats = null
  estado.fallo = false
  estado.backend = true
})

describe('Dashboard — los tres estados sin datos se distinguen', () => {
  it('SIN BACKEND (demo): lo dice y NO simula una carga eterna', () => {
    estado.backend = false
    pintar()

    expect(screen.getByText(/esta demo no tiene métricas/i)).toBeDefined()
    // Lo que rompía: el esqueleto de carga en un estado que nunca iba a resolver.
    expect(screen.queryByText(/calculando métricas/i), 'la demo no debe simular carga').toBeNull()
    expect(document.querySelectorAll('.animate-pulse').length, 'sin skeletons pulsando').toBe(0)
    expect(document.querySelector('[aria-busy="true"]'), 'no está ocupado: es un estado final').toBeNull()
  })

  it('SIN BACKEND: no ofrece "Actualizar" (no habría a quién pedirle)', () => {
    estado.backend = false
    pintar()
    expect(screen.queryByRole('button', { name: /actualizar/i })).toBeNull()
  })

  it('FALLO del backend: muestra el error y deja reintentar', () => {
    estado.fallo = true
    pintar()

    expect(screen.getByText(/no pudimos traer las métricas/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeDefined()
    expect(screen.queryByText(/esta demo no tiene métricas/i)).toBeNull()
  })

  it('CARGANDO (hay backend, aún sin respuesta): sí muestra el esqueleto', () => {
    pintar()

    expect(screen.getByText(/calculando métricas/i)).toBeDefined()
    expect(document.querySelector('[aria-busy="true"]'), 'acá sí está ocupado').not.toBeNull()
    expect(screen.queryByText(/esta demo no tiene métricas/i)).toBeNull()
  })

  it('con métricas: pinta los números y ninguno de los estados vacíos', () => {
    estado.stats = {
      generatedAt: new Date().toISOString(),
      kpis: {
        registrados: 12, inscripciones: 7, socios: 3,
        ingresoSocios: 45000, ordenesConfirmadas: 2, postulaciones: 4, descargas: 5,
      },
      postulacionesPendientes: { total: 0, masAntiguaDias: null, items: [] },
      plataTrabada: { montoTotal: 0, cantidad: 0, porEstado: [] },
      bloquesFlojos: { items: [] },
      convocatoriasPorCerrar: { items: [] },
      sponsors: { items: [] },
    }
    pintar()

    expect(screen.queryByText(/esta demo no tiene métricas/i)).toBeNull()
    expect(screen.queryByText(/calculando métricas/i)).toBeNull()
    expect(screen.queryByText(/no pudimos traer/i)).toBeNull()
    expect(screen.getByText('12'), 'los KPIs reales se pintan').toBeDefined()
  })
})
