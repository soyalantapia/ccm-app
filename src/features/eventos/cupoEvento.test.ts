import { describe, it, expect } from 'vitest'
import { validarCupo } from './cupoEvento'

/**
 * El cupo salía a un `Number()` crudo. Los dos casos que rompen no daban ningún error: uno
 * quedaba sin tope y el otro con tope 1. Estos tests son los dos casos, más los normales.
 */
describe('validarCupo', () => {
  it('acepta un número común', () => {
    expect(validarCupo('30', 'cupo')).toEqual({ ok: true, valor: 30 })
  })

  it('vacío = lo que signifique vacío en ese campo', () => {
    // Para el cupo, vacío es "sin tope" (null). Para los ya anotados, es 0.
    expect(validarCupo('', 'cupo')).toEqual({ ok: true, valor: null })
    expect(validarCupo('  ', 'ya anotados', 0)).toEqual({ ok: true, valor: 0 })
  })

  it('cero es un cupo válido: un evento sin lugares disponibles', () => {
    expect(validarCupo('0', 'cupo')).toEqual({ ok: true, valor: 0 })
  })

  it('RECHAZA "30 lugares" en vez de guardarlo como SIN TOPE', () => {
    // Number('30 lugares') = NaN → JSON.stringify lo manda como null → el backend lee null como
    // "vaciar el campo" → evento sin tope. Con cartel de guardado y sin un solo error.
    const r = validarCupo('30 lugares', 'cupo')
    expect(r.ok).toBe(false)
  })

  it('RECHAZA "1.000": Number() lo lee como 1 y el evento se agota con la primera inscripción', () => {
    // Es como se escribe mil en Argentina, y 1 es un entero perfectamente válido para el server.
    const r = validarCupo('1.000', 'cupo')
    expect(r.ok).toBe(false)
  })

  it('rechaza negativos, decimales y notación científica', () => {
    for (const malo of ['-5', '1,5', '2.5', '1e3', '+10', 'muchos']) {
      expect(validarCupo(malo, 'cupo').ok, `debería rechazar "${malo}"`).toBe(false)
    }
  })

  it('rechaza un número absurdo', () => {
    expect(validarCupo('99999999', 'cupo').ok).toBe(false)
  })

  it('el mensaje nombra el campo, así el organizador sabe cuál de los dos corregir', () => {
    const r = validarCupo('x', 'número de ya anotados')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('ya anotados')
  })
})
