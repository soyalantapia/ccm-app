import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PhoneInput } from './PhoneInput'

/**
 * Lo que importa de este componente es lo que EMITE: hacia afuera sigue siendo un solo string
 * («+598 99123456»), porque así se persiste en `ProfileField.phone`. Si emitiera un objeto o se
 * comiera el prefijo, el teléfono llegaría inservible a la base sin que nada falle a la vista.
 */

/** Envoltorio controlado, como lo usan el sheet de perfil y la fila de edición. */
function Campo({ inicial = '', onValor }: { inicial?: string; onValor?: (v: string) => void }) {
  const [v, setV] = useState(inicial)
  return (
    <>
      <PhoneInput
        value={v}
        onChange={(nuevo) => {
          setV(nuevo)
          onValor?.(nuevo)
        }}
      />
      <output data-testid="valor">{v}</output>
    </>
  )
}

const selectorPais = () => screen.getByLabelText('País del teléfono') as HTMLSelectElement
const campoNumero = () => screen.getByPlaceholderText('351 234 5678') as HTMLInputElement
const valorEmitido = () => screen.getByTestId('valor').textContent

beforeEach(() => cleanup())

describe('PhoneInput', () => {
  it('emite un solo string con prefijo y número', () => {
    render(<Campo />)
    fireEvent.change(campoNumero(), { target: { value: '3511234567' } })
    expect(valorEmitido()).toBe('+54 3511234567')
  })

  it('arranca en Argentina, que es de donde viene el público del evento', () => {
    render(<Campo />)
    expect(selectorPais().value).toBe('AR')
  })

  it('cambiar de país conserva el número ya escrito', () => {
    render(<Campo />)
    fireEvent.change(campoNumero(), { target: { value: '99123456' } })
    fireEvent.change(selectorPais(), { target: { value: 'UY' } })

    expect(campoNumero().value, 'se borró el número al cambiar de país').toBe('99123456')
    expect(valorEmitido()).toBe('+598 99123456')
  })

  it('un teléfono ya guardado se abre con su país seleccionado', () => {
    render(<Campo inicial="+55 11987654321" />)
    expect(selectorPais().value).toBe('BR')
    expect(campoNumero().value).toBe('11987654321')
  })

  it('un teléfono viejo SIN prefijo no se pierde ni se rompe', () => {
    // Los que ya están en la base se cargaron a mano, muchos sin prefijo.
    render(<Campo inicial="0351 15 1234567" />)
    expect(campoNumero().value, 'se perdió un teléfono ya cargado').toBe('0351 15 1234567')
    expect(selectorPais().value).toBe('AR')
  })

  it('vaciar el número no deja un prefijo suelto guardado', () => {
    const visto = vi.fn()
    render(<Campo inicial="+54 3511234567" onValor={visto} />)
    fireEvent.change(campoNumero(), { target: { value: '' } })
    // «+54» solo no es un teléfono, y además pasaría por «campo completado».
    expect(valorEmitido()).toBe('')
  })

  it('ofrece todos los países y a los vecinos primero', () => {
    render(<Campo />)
    const opciones = [...selectorPais().options]
    expect(opciones.length).toBeGreaterThan(200)
    expect(opciones.slice(0, 6).map((o) => o.value)).toEqual(['AR', 'UY', 'CL', 'BR', 'PY', 'BO'])
  })

  it('el selector tiene nombre accesible y no queda fuera del recorrido de teclado', () => {
    render(<Campo />)
    const sel = selectorPais()
    expect(sel.getAttribute('aria-label')).toBeTruthy()
    expect(sel.tabIndex).toBeGreaterThanOrEqual(0)
  })
})
