import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OpsEventForm } from './OpsEventForm'
import type { EventItem } from '../../data/types'

/**
 * El alta de un evento tenía DOS campos de fecha independientes —"Fecha (texto)" y "Fecha (para
 * ordenar)"— y nadie verificaba que dijeran lo mismo. En producción dos capacitaciones anunciaron
 * el día de la semana equivocado durante semanas. Estos tests blindan el arreglo: una sola fecha,
 * el texto derivado de ella, y la puerta de escape para el evento de dos días.
 *
 * Se busca por el rol/tipo del control y no por su etiqueta: `Field` envuelve el input en un
 * <label> junto con el asterisco y el hint, así que el nombre accesible incluye todo eso y una
 * búsqueda por texto exacto sería frágil.
 */

vi.mock('../../data/store', () => ({
  store: { createEvent: vi.fn(), updateEvent: vi.fn() },
}))

// Lo que importa no es lo que la pantalla muestra, sino lo que se GUARDA. Una primera versión de
// estos tests miraba el hint del campo —que deriva de la fecha por su cuenta— y por eso seguían
// pasando aunque el texto guardado quedara viejo: un falso éxito que apareció al mutar el fix.
async function guardar(): Promise<Record<string, unknown>> {
  const { store } = await import('../../data/store')
  const titulo = porPlaceholder('Ej: Camino a CCM · Julio')
  if (!titulo.value) fireEvent.change(titulo, { target: { value: 'Evento de prueba' } })
  const desc = raiz().querySelector('textarea') as HTMLTextAreaElement
  if (desc && !desc.value) fireEvent.change(desc, { target: { value: 'Una descripción.' } })
  fireEvent.submit(raiz().querySelector('form') as HTMLFormElement)
  const mock = (store.createEvent as ReturnType<typeof vi.fn>).mock
  const mockUpd = (store.updateEvent as ReturnType<typeof vi.fn>).mock
  if (mock.calls.length) return mock.calls[mock.calls.length - 1][0]
  if (mockUpd.calls.length) return mockUpd.calls[mockUpd.calls.length - 1][1]
  throw new Error('el formulario no guardó nada')
}

// `Sheet` renderiza en un portal (createPortal a document.body), así que el container que
// devuelve render() queda vacío: hay que buscar en el body.
const raiz = () => document.body

const fecha = () => raiz().querySelector('input[type="date"]') as HTMLInputElement
/** El campo de texto propio de la fecha, si está visible. */
const textoPropio = () =>
  raiz().querySelector('input[placeholder*="de "]:not([type="date"])') as HTMLInputElement | null
const porPlaceholder = (p: string) => raiz().querySelector(`input[placeholder="${p}"]`) as HTMLInputElement

function montar(event?: EventItem) {
  return render(<OpsEventForm open event={event} onClose={() => {}} />)
}

// El portal vive en document.body: sin limpiar, los formularios de tests anteriores
// quedan montados y los selectores encuentran varios.
beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('una sola fecha: el texto del público sale de ella', () => {
  it('GUARDA el texto derivado de la fecha, no sólo lo muestra', async () => {
    montar()
    fireEvent.change(fecha(), { target: { value: '2026-08-21' } })
    // Justo la fecha que estaba mal escrita en producción como "Jueves 21 de agosto".
    expect(await guardar()).toMatchObject({ dateLabel: 'Viernes 21 de agosto', startDate: '2026-08-21' })
  })

  it('y lo muestra antes de guardar, para que se pueda revisar', () => {
    montar()
    fireEvent.change(fecha(), { target: { value: '2026-08-21' } })
    // Aparece dos veces a propósito: en el hint del campo y en el preview de la tarjeta.
    expect(screen.getAllByText(/Viernes 21 de agosto/).length).toBeGreaterThan(0)
  })

  it('cambiar la fecha reescribe el texto GUARDADO: no quedan restos de la anterior', async () => {
    montar()
    fireEvent.change(fecha(), { target: { value: '2026-08-21' } })
    fireEvent.change(fecha(), { target: { value: '2026-09-05' } })
    expect(await guardar()).toMatchObject({ dateLabel: 'Sábado 5 de septiembre' })
    expect(screen.queryAllByText(/de agosto/)).toHaveLength(0)
  })

  it('ya no existen dos campos de fecha que puedan contradecirse', () => {
    montar()
    expect(raiz().querySelectorAll('input[type="date"]')).toHaveLength(1)
    expect(screen.queryByText(/para ordenar/i)).toBeNull()
    expect(screen.queryByText(/Fecha \(texto\)/i)).toBeNull()
  })
})

describe('la puerta de escape: eventos que no entran en una sola fecha', () => {
  const abrirTextoPropio = () => fireEvent.click(screen.getByText(/Escribir otro texto/i))

  it('deja escribir un texto propio, como "19 y 20 de septiembre", y lo guarda así', async () => {
    montar()
    fireEvent.change(fecha(), { target: { value: '2026-09-19' } })
    abrirTextoPropio()
    const propio = textoPropio()!
    fireEvent.change(propio, { target: { value: '19 y 20 de septiembre' } })
    expect(await guardar()).toMatchObject({ dateLabel: '19 y 20 de septiembre' })
  })

  it('con texto propio, cambiar la fecha NO lo pisa', async () => {
    montar()
    fireEvent.change(fecha(), { target: { value: '2026-09-19' } })
    abrirTextoPropio()
    fireEvent.change(textoPropio()!, { target: { value: '19 y 20 de septiembre' } })
    fireEvent.change(fecha(), { target: { value: '2026-09-20' } })
    expect(await guardar()).toMatchObject({ dateLabel: '19 y 20 de septiembre', startDate: '2026-09-20' })
  })

  it('avisa si el texto propio nombra un día que no es el de la fecha', () => {
    montar()
    fireEvent.change(fecha(), { target: { value: '2026-08-21' } })
    abrirTextoPropio()
    // El error real que estuvo publicado.
    fireEvent.change(textoPropio()!, { target: { value: 'Jueves 21 de agosto' } })
    expect(screen.getByText(/cae viernes, no jueves/i)).toBeTruthy()
  })

  it('no se queja de un texto sin día de la semana', () => {
    montar()
    fireEvent.change(fecha(), { target: { value: '2026-09-19' } })
    abrirTextoPropio()
    fireEvent.change(textoPropio()!, { target: { value: '19 y 20 de septiembre' } })
    expect(screen.queryByText(/cae .*, no /i)).toBeNull()
  })

  it('se puede volver al texto automático', () => {
    montar()
    fireEvent.change(fecha(), { target: { value: '2026-08-21' } })
    abrirTextoPropio()
    fireEvent.change(textoPropio()!, { target: { value: 'lo que sea' } })
    fireEvent.click(screen.getByText(/Volver al texto automático/i))
    // Aparece dos veces a propósito: en el hint del campo y en el preview de la tarjeta.
    expect(screen.getAllByText(/Viernes 21 de agosto/).length).toBeGreaterThan(0)
  })
})

describe('al editar un evento que ya existe', () => {
  const base: EventItem = {
    id: 'ev-1', slug: 'x', type: 'principal', title: 'Expo', dateLabel: '19 y 20 de septiembre',
    startDate: '2026-09-19', venue: 'Hotel', address: 'Calle 1', mapsUrl: '', description: 'd',
    cover: 'img/events/principal.jpg',
  }

  it('respeta el texto escrito a mano y NO lo reemplaza al abrir', () => {
    montar(base)
    expect(textoPropio()?.value).toBe('19 y 20 de septiembre')
  })

  it('si el texto guardado es el automático, no lo trata como personalizado', () => {
    montar({ ...base, dateLabel: 'Sábado 19 de septiembre' })
    expect(screen.getByText(/Escribir otro texto/i)).toBeTruthy()
  })
})

describe('la sede de siempre viene puesta', () => {
  it('no hay que retipear el hotel en cada alta', () => {
    montar()
    expect(porPlaceholder('Hotel Quinto Centenario').value).toBeTruthy()
    expect(porPlaceholder('Duarte Quirós 1300, Córdoba').value).toBeTruthy()
  })

  it('pero se puede cambiar: hay Caminos fuera del hotel', () => {
    montar()
    const lugar = porPlaceholder('Hotel Quinto Centenario')
    fireEvent.change(lugar, { target: { value: 'Otro lugar' } })
    expect(lugar.value).toBe('Otro lugar')
  })
})

/**
 * Guardar y publicar son actos distintos. Antes no existía la opción de no publicar: cada alta
 * salía a la app en el mismo instante en que se apretaba "Crear", sin vuelta atrás — no se podía
 * despublicar y borrar se traba con la primera inscripción.
 */
describe('borrador y publicar', () => {
  const boton = (texto: RegExp) =>
    [...raiz().querySelectorAll('button')].find((b) => texto.test(b.textContent ?? ''))!

  async function completarYApretar(texto: RegExp) {
    const { store } = await import('../../data/store')
    fireEvent.change(fecha(), { target: { value: '2026-10-05' } })
    fireEvent.change(porPlaceholder('Ej: Camino a CCM · Julio'), { target: { value: 'Nuevo' } })
    fireEvent.change(raiz().querySelector('textarea') as HTMLTextAreaElement, { target: { value: 'd' } })
    fireEvent.click(boton(texto))
    const mock = (store.createEvent as ReturnType<typeof vi.fn>).mock
    const mockUpd = (store.updateEvent as ReturnType<typeof vi.fn>).mock
    if (mock.calls.length) return mock.calls[mock.calls.length - 1][0]
    return mockUpd.calls[mockUpd.calls.length - 1][1]
  }

  it('un evento nuevo se puede guardar SIN publicar', async () => {
    montar()
    expect(await completarYApretar(/Guardar borrador/i)).toMatchObject({ published: false })
  })

  it('y publicarlo es un solo click, sin pasos de más', async () => {
    montar()
    expect(await completarYApretar(/^Publicar$/i)).toMatchObject({ published: true })
  })

  it('sobre uno ya publicado, el botón principal guarda sin despublicarlo', async () => {
    const publicado: EventItem = {
      id: 'ev-1', slug: 'x', type: 'camino', title: 'Pub', dateLabel: 'Lunes 5 de octubre',
      startDate: '2026-10-05', venue: 'H', address: 'A', mapsUrl: '', description: 'd',
      cover: 'img/events/principal.jpg', published: true,
    }
    montar(publicado)
    expect(await completarYApretar(/Guardar cambios/i)).toMatchObject({ published: true })
  })

  it('y se puede DESPUBLICAR, que antes era imposible', async () => {
    const publicado: EventItem = {
      id: 'ev-1', slug: 'x', type: 'camino', title: 'Pub', dateLabel: 'Lunes 5 de octubre',
      startDate: '2026-10-05', venue: 'H', address: 'A', mapsUrl: '', description: 'd',
      cover: 'img/events/principal.jpg', published: true,
    }
    montar(publicado)
    expect(await completarYApretar(/despublicar/i)).toMatchObject({ published: false })
  })

  it('avisa que el borrador no lo ve el público', () => {
    montar()
    expect(screen.getByText(/no lo ve|sólo para el equipo|Publicar lo pone a la vista/i)).toBeTruthy()
  })
})
