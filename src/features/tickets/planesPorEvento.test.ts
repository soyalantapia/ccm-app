import { describe, it, expect } from 'vitest'
import { vipDesde } from './vipDesde'
import type { TicketPlan } from '../../data/types'

/**
 * Desde que cada evento arma sus propios tipos de entrada, TODA pantalla que muestre precios
 * tiene que decir de qué evento habla. La que más duele es el "VIP desde $X": devuelve el
 * MÍNIMO, así que un tier barato de una capacitación le baja el precio anunciado al evento
 * principal — en la portada, en el banner de /eventos y en el cuerpo de su ficha.
 *
 * Y falla en silencio: no rompe nada, no tira ningún error, sólo muestra un número más bajo
 * del real. Nadie lo mira hasta que alguien pregunta por qué la entrada sale distinto de lo
 * que decía la página.
 *
 * La única pantalla que a propósito lee TODOS los planes es "Tus órdenes": ahí se resuelve el
 * nombre de cualquier entrada comprada, y las compras de una persona pueden ser de eventos
 * distintos.
 */

const plan = (over: Partial<TicketPlan>): TicketPlan => ({
  id: 'p',
  eventId: 'ev-principal',
  name: 'Entrada',
  tagline: '',
  price: 30000,
  serviceCharge: 0,
  mpLink: null,
  perks: [],
  kind: 'vip',
  ...over,
})

const TODOS = [
  plan({ id: 'sab-night-vip', eventId: 'ev-principal', price: 30000, kind: 'vip' }),
  plan({ id: 'combo-vip', eventId: 'ev-principal', price: 50000, kind: 'vip' }),
  plan({ id: 'sab-general', eventId: 'ev-principal', price: 0, kind: 'general' }),
  // El tier barato de OTRO evento: es el que contamina.
  plan({ id: 'taller-vip', eventId: 'ev-taller', price: 8000, kind: 'vip' }),
]

const delEvento = (eventId: string) => TODOS.filter((p) => p.eventId === eventId)

describe('el "VIP desde" es del evento que se está mostrando', () => {
  it('acotado al principal da su propio mínimo', () => {
    expect(vipDesde(delEvento('ev-principal'))).toBe(30000)
  })

  it('SIN acotar, el tier de otro evento le baja el precio al principal', () => {
    // Ésta es exactamente la regresión que el filtro previene. Se deja escrita para que quede
    // claro qué pasa si alguien saca el eventId de una de las pantallas.
    expect(vipDesde(TODOS)).toBe(8000)
    expect(vipDesde(TODOS)).not.toBe(vipDesde(delEvento('ev-principal')))
  })

  it('cada evento anuncia lo suyo', () => {
    expect(vipDesde(delEvento('ev-taller'))).toBe(8000)
  })

  it('un evento sin entradas VIP no anuncia precio en vez de mostrar el de otro', () => {
    expect(vipDesde(delEvento('ev-sin-entradas'))).toBeNull()
  })

  it('las generales no cuentan aunque sean más baratas', () => {
    // sab-general está en $0 y no debe convertirse en "VIP desde $0".
    expect(vipDesde(delEvento('ev-principal'))).toBe(30000)
  })
})
