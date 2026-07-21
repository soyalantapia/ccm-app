import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRef, useState } from 'react'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { useFocusTrap } from './useFocusTrap'

/**
 * Escribir en un diálogo expulsaba el foco al botón de cerrar.
 *
 * Reproducido en el navegador sobre el sheet de «Para comprar tus entradas necesitamos estos
 * datos»: se tipea "Ana" en el campo Nombre y el foco termina en la cruz. Es fatal — bloquea
 * completar el formulario, y ese formulario está en el camino de la compra de entradas.
 *
 * La cadena: los consumidores pasan `onClose={() => close(false)}`, una arrow inline con
 * identidad nueva en cada render. `useFocusTrap` la tenía en su array de dependencias, así que
 * cada tecla → cambio de estado → render → nueva `onClose` → el effect se limpia y se vuelve a
 * montar → llama a `focusFirst()`. Y como en el DOM el botón «Cerrar» está ANTES que los
 * campos, el primer focusable es la cruz.
 *
 * Culpar al consumidor por no memoizar sería tratar el síntoma: cualquier diálogo nuevo con un
 * input caería en lo mismo. El hook no puede depender de la identidad del callback.
 */

/** Diálogo con la misma estructura que Sheet: el botón de cerrar ANTES de los campos. */
function DialogoConCampo({ onCerrar }: { onCerrar: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [valor, setValor] = useState('')
  // Arrow inline a propósito: es lo que hacen los consumidores reales.
  useFocusTrap(true, ref, () => onCerrar())
  return (
    <div ref={ref}>
      <button aria-label="Cerrar">×</button>
      <input aria-label="Nombre" value={valor} onChange={(e) => setValor(e.target.value)} />
    </div>
  )
}

const quienTieneElFoco = () => document.activeElement?.getAttribute('aria-label') ?? '(ninguno)'

/**
 * Los rAF pendientes, ejecutados a mano.
 *
 * El trap reenfoca dentro de un `requestAnimationFrame`. Esperar rAF *reales* hacía el test
 * intermitente: con 24 archivos de test en paralelo, el frame puede tardar más que la espera y
 * el test pasaba sin haber dado oportunidad al reenfoque — o fallaba por ruido de scheduling.
 * Interceptando rAF y disparándolo nosotros, el momento del reenfoque es determinístico.
 */
let rafsPendientes: FrameRequestCallback[] = []

function correrFrames(veces = 3) {
  for (let i = 0; i < veces; i++) {
    const pendientes = rafsPendientes
    rafsPendientes = []
    pendientes.forEach((cb) => cb(performance.now()))
  }
}

beforeEach(() => {
  cleanup()
  rafsPendientes = []
  // jsdom no calcula layout: `offsetParent` es null en TODO y `getFocusable` filtra por ese
  // campo. Sin el parche de abajo no encuentra ningún elemento, el trap nunca mueve el foco y
  // los tests pasan sin ejercitar nada — un verde que no prueba nada (me pasó al escribirlos).
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafsPendientes.push(cb)
    return rafsPendientes.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.parentElement
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useFocusTrap — escribir no puede robar el foco', () => {
  it('tipear en un campo NO manda el foco al botón de cerrar', async () => {
    const { findByLabelText } = render(<DialogoConCampo onCerrar={() => {}} />)
    const campo = (await findByLabelText('Nombre')) as HTMLInputElement

    // Drenar el foco inicial ANTES de empezar: al montar, el trap encola un focusFirst que va a
    // la cruz (correcto y esperado). Si queda pendiente, se dispara con el primer correrFrames()
    // y parece que escribir robó el foco — que es justo lo que este test tiene que distinguir.
    act(() => correrFrames())

    campo.focus()
    expect(quienTieneElFoco()).toBe('Nombre')

    // Tres teclas, como escribir un nombre corto.
    for (const letra of ['A', 'n', 'a']) {
      act(() => {
        fireEvent.change(campo, { target: { value: campo.value + letra } })
      })
      act(() => correrFrames())
      expect(quienTieneElFoco(), `el foco se escapó al escribir "${letra}"`).toBe('Nombre')
    }

    expect(campo.value).toBe('Ana')
  })

  it('el foco inicial SÍ entra al diálogo (no rompemos lo que funcionaba)', async () => {
    const { findByLabelText } = render(<DialogoConCampo onCerrar={() => {}} />)
    await findByLabelText('Nombre')
    act(() => correrFrames())
    // Al abrir sí corresponde mover el foco adentro: el primer focusable es la cruz.
    expect(quienTieneElFoco()).toBe('Cerrar')
  })

  it('Escape sigue cerrando, con la ÚLTIMA versión del callback', async () => {
    const viejo = vi.fn()
    const nuevo = vi.fn()
    const { rerender, findByLabelText } = render(<DialogoConCampo onCerrar={viejo} />)
    await findByLabelText('Nombre')

    // Re-render con otro callback: el hook ya no re-monta, así que tiene que seguir el nuevo.
    rerender(<DialogoConCampo onCerrar={nuevo} />)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(nuevo, 'quedó atado al callback viejo').toHaveBeenCalledTimes(1)
    expect(viejo).not.toHaveBeenCalled()
  })
})
