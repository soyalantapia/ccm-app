import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef } from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useFocusTrap } from './useFocusTrap'

/**
 * "Hay un diálogo abierto" no es un booleano: en el panel se solapan Sheet sobre Modal, y el
 * reporte a sponsors sobre un Sheet. useFocusTrap registraba su keydown en `document` sin saber
 * cuál trap es el tope de la pila, así que los N traps montados reaccionaban al MISMO evento:
 * un solo Escape cerraba todos los diálogos de golpe, y el Tab lo manejaban varios contenedores
 * peleándose el foco.
 */

function Dialogo({ onClose, label }: { onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(true, ref, onClose)
  return (
    <div ref={ref}>
      <button>{label}</button>
    </div>
  )
}

beforeEach(() => cleanup())

const escape = () => fireEvent.keyDown(document, { key: 'Escape' })

describe('useFocusTrap — solo el diálogo de arriba responde al Escape', () => {
  it('con dos diálogos apilados, Escape cierra SOLO el de arriba', () => {
    const cerrarFondo = vi.fn()
    const cerrarTope = vi.fn()
    render(
      <>
        <Dialogo onClose={cerrarFondo} label="fondo" />
        <Dialogo onClose={cerrarTope} label="tope" />
      </>,
    )

    escape()
    expect(cerrarTope, 'el diálogo de arriba no se cerró').toHaveBeenCalledTimes(1)
    expect(cerrarFondo, 'el Escape se propagó al diálogo de abajo').not.toHaveBeenCalled()
  })

  it('con un solo diálogo, Escape lo cierra', () => {
    const cerrar = vi.fn()
    render(<Dialogo onClose={cerrar} label="unico" />)
    escape()
    expect(cerrar).toHaveBeenCalledTimes(1)
  })

  it('al desmontar el de arriba, el de abajo vuelve a ser el tope', () => {
    const cerrarFondo = vi.fn()
    const cerrarTope = vi.fn()
    const { rerender } = render(
      <>
        <Dialogo onClose={cerrarFondo} label="fondo" />
        <Dialogo onClose={cerrarTope} label="tope" />
      </>,
    )
    rerender(<Dialogo onClose={cerrarFondo} label="fondo" />) // se cierra el de arriba

    escape()
    expect(cerrarFondo, 'el de abajo no recuperó el control tras cerrarse el de arriba').toHaveBeenCalledTimes(1)
    expect(cerrarTope).not.toHaveBeenCalled()
  })

  it('con tres apilados, solo responde el último montado', () => {
    const a = vi.fn(), b = vi.fn(), c = vi.fn()
    render(
      <>
        <Dialogo onClose={a} label="a" />
        <Dialogo onClose={b} label="b" />
        <Dialogo onClose={c} label="c" />
      </>,
    )
    escape()
    expect(c).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })
})
