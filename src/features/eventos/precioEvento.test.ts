import { describe, it, expect } from 'vitest'
import { validarPrecioEvento } from './precioEvento'

const v = (price: string, socioOnly = false) => validarPrecioEvento({ price, socioOnly })

describe('precio del evento', () => {
  it('vacío = sin precio: el evento no se vende', () => {
    expect(v('')).toEqual({ ok: true, price: null })
    expect(v('   ')).toEqual({ ok: true, price: null })
  })

  it('un precio normal pasa como número', () => {
    expect(v('45000')).toEqual({ ok: true, price: 45000 })
  })

  it('CERO NO es gratis: se rechaza, porque el cobro tira error con montos <= 0', () => {
    // Éste es el bug que la regla previene: "poner 0 para que sea gratis" produce un checkout
    // roto con un mensaje que no explica nada. Gratis se modela con precio vacío.
    const r = v('0')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('mayor a 0')
  })

  it('rechaza negativos, decimales, texto y notación científica', () => {
    for (const malo of ['-1', '45000.5', 'gratis', '1e5', ' 45 000 ']) {
      expect(v(malo).ok, `debería rechazar "${malo}"`).toBe(false)
    }
  })

  it('rechaza "45.000" en vez de leerlo como 45 — el caso que más se va a tipear', () => {
    // En Argentina el punto es separador de miles, pero Number('45.000') devuelve 45. Sin este
    // chequeo la validación pasaba (45 es entero y positivo) y la capacitación quedaba a $45.
    const r = v('45.000')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('sin puntos')
  })

  it('rechaza "45,000" por el mismo motivo', () => {
    expect(v('45,000').ok).toBe(false)
  })

  it('precio + candado de Socios se rechaza: es una venta que nadie puede completar', () => {
    // La inscripción tira 403 SOCIO_ONLY antes de mirar el precio, así que un no-socio ni
    // siquiera llega al checkout. Las 2 capacitaciones publicadas hoy están en este estado.
    const r = v('45000', true)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('Solo Socios')
  })

  it('candado de Socios SIN precio es válido: es una capacitación de membresía, no una venta', () => {
    expect(v('', true)).toEqual({ ok: true, price: null })
  })
})
