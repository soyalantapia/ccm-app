import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Application, Convocatoria } from '../../data/types'

/**
 * BLOQUEANTE 1 del review, reproducido tal cual: con la ficha de Ana abierta y el panel de
 * "Aceptar" mostrando una nota escrita, apretar ↓ (por ejemplo moviendo el cursor DENTRO de la
 * nota, lo más natural del mundo) cambiaba el `:id` de la ruta SIN desmontar el componente — el
 * panel quedaba abierto pero ahora apuntando a Bruno, con la nota de Ana todavía escrita. Un
 * click en "Confirmar" terminaba llamando a `decideApplication` con el id de Bruno y la nota de
 * Ana, y le mandaba el mail (real, irreversible) a la persona equivocada.
 *
 * El fix son TRES capas, y estos tests cubren las tres:
 *   1) el atajo se ignora si el foco está escribiendo (input/textarea/contenteditable),
 *   2) se ignora si el panel de decisión está abierto,
 *   3) toda la ficha se remonta (`key={id}`) al cambiar de postulación, así que aunque algo
 *      navegara sin pasar por el atajo (ej. el botón de "siguiente" del header, que no tiene
 *      guard porque no lo necesita: no es un atajo silencioso), el estado de UNA postulación
 *      nunca sobrevive para la siguiente.
 */

let applications: Application[]
let convocatoria: Convocatoria

const decideApplicationMock = vi.fn()
vi.mock('../../data/store', () => ({
  store: { decideApplication: (...args: unknown[]) => decideApplicationMock(...args) },
  useStore: (sel: (s: unknown) => unknown) =>
    sel({
      getAdminApplications: () => applications,
      applicationsFailed: () => false,
      getConvocatorias: () => [convocatoria],
    }),
}))

const { default: AdminPostulacionDetalle } = await import('./AdminPostulacionDetalle')

function makeApp(id: string, nombre: string, email: string): Application {
  return {
    id,
    convocatoriaId: 'conv-1',
    ts: '2026-06-01T00:00:00-03:00',
    status: 'preinscripta',
    data: { nombre, email },
  }
}

const pintar = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/admin/postulaciones/${id}`]}>
      <Routes>
        <Route path="/admin/postulaciones/:id" element={<AdminPostulacionDetalle />} />
      </Routes>
    </MemoryRouter>,
  )

const raiz = () => document.body
const notaTextarea = () => raiz().querySelector('textarea') as HTMLTextAreaElement | null
const clickAceptar = () => fireEvent.click(screen.getByText('Aceptar'))
const clickSiguiente = () => fireEvent.click(screen.getByLabelText('Postulación siguiente'))
const clickConfirmar = () =>
  fireEvent.click(screen.getByText(/^Confirmar (aceptación|rechazo)$/).closest('button') as HTMLButtonElement)

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  convocatoria = {
    id: 'conv-1',
    slug: 'camino',
    title: 'Camino a CCM 2026',
    intro: '',
    deadline: '2026-06-16',
    eventId: 'ev-1',
    fields: [],
  }
  applications = [makeApp('app-a', 'Ana', 'ana@example.com'), makeApp('app-b', 'Bruno', 'bruno@example.com')]
})
afterEach(() => cleanup())

// En esta ficha, el único input/textarea es el de OpsDecisionSheet — así que el caso real
// (escribiendo en la nota) siempre tiene el panel abierto: guard 1 (foco) y guard 2 (panel
// abierto) actúan juntos acá. El test de guard 2 de abajo lo aísla con el foco FUERA de un campo.
describe('AdminPostulacionDetalle — guard 1: el atajo ignora el foco de escritura', () => {
  it('↓ con el foco en la nota interna NO cambia de postulación', () => {
    pintar('app-a')
    expect(screen.getByRole('heading', { name: 'Ana' })).toBeDefined()

    clickAceptar()
    fireEvent.change(notaTextarea()!, { target: { value: 'nota sobre ANA' } })
    fireEvent.keyDown(notaTextarea()!, { key: 'ArrowDown' })

    expect(screen.getByRole('heading', { name: 'Ana' })).toBeDefined()
    expect(notaTextarea()!.value).toBe('nota sobre ANA')
  })
})

describe('AdminPostulacionDetalle — guard 2: el atajo ignora el panel de decisión abierto', () => {
  it('↓ con el panel abierto (foco fuera de un campo) tampoco cambia de postulación', () => {
    pintar('app-a')
    clickAceptar()

    fireEvent.keyDown(window, { key: 'ArrowDown' })

    expect(screen.getByRole('heading', { name: 'Ana' })).toBeDefined()
    expect(screen.getByText('Confirmar aceptación')).toBeDefined()
  })
})

describe('AdminPostulacionDetalle — sin panel abierto, el atajo sigue funcionando', () => {
  it('↓ sin nada abierto SÍ avanza a la siguiente postulación del subconjunto', () => {
    pintar('app-a')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('heading', { name: 'Bruno' })).toBeDefined()
  })
})

describe('AdminPostulacionDetalle — guard 3: remount por key={id}, el estado nunca sobrevive', () => {
  it('reproduce el escenario del review y confirma que YA NO pasa', () => {
    pintar('app-a')

    // Panel de "Aceptar" abierto sobre Ana, con una nota escrita.
    clickAceptar()
    fireEvent.change(notaTextarea()!, { target: { value: 'nota sobre ANA' } })
    expect(screen.getByText('Confirmar aceptación')).toBeDefined()

    // El botón de "siguiente" del header SÍ navega (no tiene guard 1/2 — no es un atajo
    // silencioso, es un click explícito), y antes del fix esto ya alcanzaba para desalinear el
    // panel con la ficha. El remount por key={id} es lo que blinda ESTE camino.
    clickSiguiente()
    expect(screen.getByRole('heading', { name: 'Bruno' })).toBeDefined()

    // El panel quedó cerrado (decision volvió a null al remontar) y la nota de Ana no sobrevive.
    expect(screen.queryByText('Confirmar aceptación')).toBeNull()
    expect(notaTextarea()).toBeNull()

    // Si el organizador ahora decide sobre Bruno, tiene que ser una ficha en blanco.
    clickAceptar()
    expect(notaTextarea()!.value).toBe('')

    clickConfirmar()
    expect(decideApplicationMock).toHaveBeenCalledWith('app-b', 'aceptada', {
      note: undefined,
      skipEmail: false,
    })
    // La llamada NUNCA lleva la nota de Ana ni decide sobre su id.
    expect(decideApplicationMock).not.toHaveBeenCalledWith('app-b', 'aceptada', {
      note: 'nota sobre ANA',
      skipEmail: false,
    })
    expect(decideApplicationMock).not.toHaveBeenCalledWith(
      'app-a',
      'aceptada',
      expect.anything(),
    )
  })
})
