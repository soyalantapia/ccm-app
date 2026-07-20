import { describe, it, expect, beforeEach } from 'vitest'
import { bloquearScroll } from './useFocusTrap'

/**
 * "Hay un diálogo abierto" NO es un booleano: en el panel se solapan Sheet sobre Modal, y el
 * reporte a sponsors sobre un Sheet. `document.body.style.overflow` se usaba como flag en 4
 * lugares, así que el PRIMERO en cerrarse devolvía el scroll al body con el otro todavía
 * abierto — el fondo scrolleaba detrás del diálogo.
 */

beforeEach(() => {
  document.body.style.overflow = ''
})

describe('bloquearScroll — conteo, no flag booleano', () => {
  it('el primer bloqueo corta el scroll y el último lo devuelve', () => {
    const liberar = bloquearScroll()
    expect(document.body.style.overflow).toBe('hidden')
    liberar()
    expect(document.body.style.overflow).toBe('')
  })

  it('con dos diálogos solapados, cerrar el de arriba NO desbloquea el fondo', () => {
    const liberarModal = bloquearScroll()
    const liberarSheet = bloquearScroll()
    expect(document.body.style.overflow).toBe('hidden')

    liberarSheet() // se cierra el de arriba
    expect(document.body.style.overflow, 'el fondo se desbloqueó con un diálogo abierto').toBe('hidden')

    liberarModal() // ahora sí, no queda ninguno
    expect(document.body.style.overflow).toBe('')
  })

  it('el desbloqueo NO tiene por qué ser LIFO', () => {
    const a = bloquearScroll()
    const b = bloquearScroll()
    const c = bloquearScroll()
    b() // se cierra el del medio primero
    expect(document.body.style.overflow).toBe('hidden')
    a()
    expect(document.body.style.overflow).toBe('hidden')
    c()
    expect(document.body.style.overflow).toBe('')
  })

  it('liberar dos veces no descuenta de más (React puede correr un cleanup dos veces)', () => {
    const liberarModal = bloquearScroll()
    const liberarSheet = bloquearScroll()
    liberarSheet()
    liberarSheet() // repetido
    expect(document.body.style.overflow, 'un cleanup repetido desbloqueó de más').toBe('hidden')
    liberarModal()
    expect(document.body.style.overflow).toBe('')
  })

  it('el contador no queda negativo tras liberaciones de más', () => {
    const l = bloquearScroll()
    l()
    l()
    // Un ciclo nuevo tiene que volver a bloquear igual.
    const l2 = bloquearScroll()
    expect(document.body.style.overflow).toBe('hidden')
    l2()
    expect(document.body.style.overflow).toBe('')
  })
})
