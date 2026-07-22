import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Application, Convocatoria } from '../../data/types'

/**
 * `OpsDecisionSheet` reproduce A MANO el texto de `server/src/mail/templates.ts`
 * (`applicationAcceptedEmail` / `applicationRejectedEmail`) porque esas funciones son del server
 * y no se pueden importar desde el front. Estos tests son la única red que detecta si el preview
 * se desincroniza de lo que el server realmente manda — comparan contra el `text` LITERAL de esas
 * plantillas, copiado de `templates.ts` en el momento de escribir este archivo.
 *
 * También cubren la parte más delicada del brief: el saludo usa `data.nombre` LITERAL (no el
 * título derivado por heurística que muestra el resto de la ficha) porque así arma el mail
 * `applicationService.decideApplication` en el server — con eso incluido el caso raro de
 * "Hola Hola." cuando falta esa key.
 */

let convocatoria: Convocatoria

const decideApplicationMock = vi.fn()
vi.mock('../../data/store', () => ({
  store: { decideApplication: (...args: unknown[]) => decideApplicationMock(...args) },
  useStore: (sel: (s: unknown) => unknown) => sel({ getConvocatorias: () => [convocatoria] }),
}))

const toastMock = vi.fn()
vi.mock('../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/ui')>()
  return { ...actual, toast: (...args: unknown[]) => toastMock(...args) }
})

const { OpsDecisionSheet } = await import('./OpsDecisionSheet')

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    convocatoriaId: 'conv-1',
    ts: '2026-06-01T00:00:00-03:00',
    status: 'preinscripta',
    data: { nombre: 'Milagros Soria', email: 'milagros@example.com' },
    ...overrides,
  }
}

// El Sheet renderiza en un portal (createPortal a document.body): lo que devuelve render()
// queda vacío, hay que buscar en el body (mismo patrón que OpsEventForm.test.tsx).
const raiz = () => document.body
const cuerpoMail = () => raiz().querySelector('.whitespace-pre-line') as HTMLElement | null
const confirmar = () =>
  (screen.getByText(/^Confirmar (aceptación|rechazo)$/).closest('button') as HTMLButtonElement)

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
})

describe('OpsDecisionSheet — preview del mail (aceptar)', () => {
  it('muestra el asunto y el cuerpo EXACTOS de applicationAcceptedEmail', () => {
    render(<OpsDecisionSheet app={makeApp()} status="aceptada" open onClose={() => {}} />)

    expect(screen.getByText('Quedaste seleccionado — Camino a CCM 2026')).toBeDefined()
    expect(cuerpoMail()?.textContent).toBe(
      `Quedaste seleccionado.\n\nHola Milagros Soria. Tu postulación a Camino a CCM 2026 fue aceptada por el equipo de CCM.\n\nEn los próximos días te escribimos con los detalles de la fecha, el lugar y lo que tenés que llevar.\nSi tenés alguna consulta, respondé este mail.`,
    )
  })

  it('cae a "Hola Hola." si la postulación no tiene `nombre` — igual que el server', () => {
    render(
      <OpsDecisionSheet
        app={makeApp({ data: { email: 'sin-nombre@example.com' } })}
        status="aceptada"
        open
        onClose={() => {}}
      />,
    )
    expect(cuerpoMail()?.textContent?.startsWith('Quedaste seleccionado.\n\nHola Hola. Tu postulación')).toBe(true)
  })
})

describe('OpsDecisionSheet — preview del mail (rechazar)', () => {
  it('muestra el asunto y el cuerpo EXACTOS de applicationRejectedEmail', () => {
    render(<OpsDecisionSheet app={makeApp()} status="rechazada" open onClose={() => {}} />)

    expect(screen.getByText('Sobre tu postulación a Camino a CCM 2026')).toBeDefined()
    expect(cuerpoMail()?.textContent).toBe(
      `Sobre tu postulación.\n\nHola Milagros Soria. Gracias por postularte a Camino a CCM 2026.\n\nEsta vez no pudimos darte un lugar. Recibimos muchas más postulaciones que cupos, y la decisión fue difícil.\n\nNos gustaría verte en las próximas convocatorias. Seguí atento, que van a salir pronto.`,
    )
  })
})

describe('OpsDecisionSheet — cuándo NO se va a poder enviar', () => {
  it('postulación fromSeed: dice por qué en vez del preview, y esconde el check de "no enviar"', () => {
    render(<OpsDecisionSheet app={makeApp({ fromSeed: true })} status="aceptada" open onClose={() => {}} />)

    expect(cuerpoMail()).toBeNull()
    expect(screen.getByText(/postulación de ejemplo/i)).toBeDefined()
    expect(screen.getByText(/la decisión se guarda igual/i)).toBeDefined()
    expect(screen.queryByText(/no enviar mail/i)).toBeNull()
  })

  it('sin email en los datos: dice por qué en vez del preview', () => {
    render(
      <OpsDecisionSheet app={makeApp({ data: { nombre: 'Sin Mail' } })} status="aceptada" open onClose={() => {}} />,
    )

    expect(cuerpoMail()).toBeNull()
    expect(screen.getByText(/no hay un email cargado/i)).toBeDefined()
  })
})

describe('OpsDecisionSheet — confirmar, nota y deshacer', () => {
  it('confirma con la nota recortada y skipEmail, cierra el panel y pide el toast con "Deshacer"', () => {
    const onClose = vi.fn()
    render(<OpsDecisionSheet app={makeApp()} status="aceptada" open onClose={onClose} />)

    fireEvent.change(raiz().querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: '  ojo, ya la conocemos de otra edición  ' },
    })
    fireEvent.click(raiz().querySelector('input[type="checkbox"]') as HTMLInputElement)
    fireEvent.click(confirmar())

    expect(decideApplicationMock).toHaveBeenCalledWith('app-1', 'aceptada', {
      note: 'ojo, ya la conocemos de otra edición',
      skipEmail: true,
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    expect(toastMock).toHaveBeenCalledTimes(1)
    const [mensaje, opts] = toastMock.mock.calls[0] as [string, { action?: { label: string; onClick: () => void } }]
    expect(mensaje).toMatch(/aceptada/i)
    expect(opts.action?.label).toBe('Deshacer')

    // El "Deshacer" del toast revierte el ESTADO llamando de nuevo a decideApplication.
    decideApplicationMock.mockClear()
    opts.action?.onClick()
    expect(decideApplicationMock).toHaveBeenCalledWith('app-1', 'preinscripta')
  })

  it('nota vacía viaja como undefined, no como string vacío', () => {
    render(<OpsDecisionSheet app={makeApp()} status="rechazada" open onClose={() => {}} />)
    fireEvent.click(confirmar())

    expect(decideApplicationMock).toHaveBeenCalledWith('app-1', 'rechazada', {
      note: undefined,
      skipEmail: false,
    })
  })
})
