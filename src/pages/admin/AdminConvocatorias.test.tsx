import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Application, Convocatoria } from '../../data/types'

/**
 * BLOQUEANTE 2 del review: el guard del borrado en cascada (`Application.convocatoriaId` es
 * `onDelete: Cascade`) se calculaba antes sobre `getApplications()`, una lista que puede ser
 * PARCIAL (paginación) o de demo (fallback al seed). Una convocatoria con postulaciones fuera
 * del corte mostraba "0 postulaciones" y habilitaba un borrado que se las llevaba puestas.
 *
 * Estos tests fijan que AdminConvocatorias use `getAdminApplications()` (null mientras no hay
 * certeza del total) y que el botón de borrado NUNCA aparezca mientras el conteo no se conoce
 * con certeza — ni siquiera si a alguien se le ocurriera reintroducir un `?? []` en el medio.
 */

let convocatoria: Convocatoria
let adminApplications: Application[] | null
let fallo: boolean

const deleteConvocatoriaMock = vi.fn()
vi.mock('../../data/store', () => ({
  store: {
    deleteConvocatoria: (...args: unknown[]) => deleteConvocatoriaMock(...args),
    // OpsConvocatoriaForm (siempre montado, aunque cerrado) lee estos directo de `store`,
    // no vía useStore — sin esto revienta con "store.getAdminEvents is not a function".
    getAdminEvents: () => [],
    createConvocatoria: vi.fn(),
    updateConvocatoria: vi.fn(),
  },
  useStore: (sel: (s: unknown) => unknown) =>
    sel({
      getConvocatorias: () => [convocatoria],
      getAdminEvents: () => [],
      getAdminApplications: () => adminApplications,
      applicationsFailed: () => fallo,
    }),
}))

const { default: AdminConvocatorias } = await import('./AdminConvocatorias')

const raiz = () => document.body
const abrirBorrado = () => fireEvent.click(screen.getByLabelText('Eliminar convocatoria'))
const hayBotonEliminar = () =>
  Array.from(raiz().querySelectorAll('button')).some((b) => /sí, eliminar convocatoria/i.test(b.textContent ?? ''))

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  fallo = false
  convocatoria = {
    id: 'conv-1',
    slug: 'camino',
    title: 'Camino a CCM 2026',
    intro: 'intro',
    deadline: '2026-06-16',
    eventId: 'ev-1',
    fields: [],
  }
})
afterEach(() => cleanup())

describe('AdminConvocatorias — el borrado nunca se habilita sobre un conteo que no se conoce', () => {
  it('con getAdminApplications() en null (cargando), NO ofrece el botón de borrar', () => {
    adminApplications = null
    render(<AdminConvocatorias />)
    abrirBorrado()

    expect(screen.getByText(/todavía no pudimos confirmar/i)).toBeDefined()
    expect(hayBotonEliminar()).toBe(false)
  })

  it('con getAdminApplications() en null tras un fetch fallido, tampoco ofrece borrar', () => {
    adminApplications = null
    fallo = true
    render(<AdminConvocatorias />)
    abrirBorrado()

    expect(screen.getByText(/no pudimos traer la lista/i)).toBeDefined()
    expect(hayBotonEliminar()).toBe(false)
  })

  it('con la lista completa hidratada y 0 postulaciones reales, SÍ ofrece borrar', () => {
    adminApplications = []
    render(<AdminConvocatorias />)
    abrirBorrado()

    expect(screen.getByText(/se elimina/i)).toBeDefined()
    expect(hayBotonEliminar()).toBe(true)
  })

  it('con postulaciones reales para esta convocatoria, NO ofrece borrar', () => {
    adminApplications = [
      { id: 'app-1', convocatoriaId: 'conv-1', ts: '2026-01-01T00:00:00.000Z', status: 'preinscripta', data: {} },
    ]
    render(<AdminConvocatorias />)
    abrirBorrado()

    expect(screen.getByText(/tiene/i)).toBeDefined()
    expect(screen.getByText(/postulación\(es\)/i)).toBeDefined()
    expect(hayBotonEliminar()).toBe(false)
  })

  it('confirmar borrado solo llama a deleteConvocatoria cuando el conteo real es 0', () => {
    adminApplications = []
    render(<AdminConvocatorias />)
    abrirBorrado()
    const boton = Array.from(raiz().querySelectorAll('button')).find((b) =>
      /sí, eliminar convocatoria/i.test(b.textContent ?? ''),
    )
    expect(boton).toBeDefined()
    fireEvent.click(boton as HTMLButtonElement)
    expect(deleteConvocatoriaMock).toHaveBeenCalledWith('conv-1')
  })
})
