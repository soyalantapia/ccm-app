import { describe, it, expect } from 'vitest'
import { toAdCampaign } from './serialize.js'

/**
 * INVARIANTE: el precio de una campaña NO viaja en el listado público.
 *
 * `GET /api/v1/campaigns` es público —lo consume el front sin sesión para pintar el banner del
 * sponsor— y el serializador metía `hours` y `total` adentro. O sea que cualquiera con curl leía
 * cuánto pagó cada marca y cuántas horas contrató: el dato comercial que sostiene la negociación
 * por rubro y la exclusividad que se vende en el pitch de sponsors.
 *
 * No se cerró el endpoint a propósito: cerrarlo apaga el banner del sponsor que pagó, en
 * silencio, porque el front se traga ese error. Se saca el precio, no el acceso.
 */

const FILA = {
  id: 'camp_1',
  slot: 'home' as const,
  brand: 'Marca',
  headline: 'Un título',
  hours: 48,
  total: 250000,
  ts: new Date('2026-07-23T10:00:00Z'),
  cta: null,
  tagline: null,
} as never

describe('toAdCampaign — el precio sólo viaja cuando se pide', () => {
  it('por defecto NO incluye hours ni total (es el caso del listado público)', () => {
    const c = toAdCampaign(FILA)
    expect(c).not.toHaveProperty('hours')
    expect(c).not.toHaveProperty('total')
  })

  it('sigue trayendo lo que el banner necesita para pintarse', () => {
    const c = toAdCampaign(FILA)
    expect(c.brand).toBe('Marca')
    expect(c.headline).toBe('Un título')
    expect(c.slot).toBe('home')
  })

  it('con conPrecio los incluye (la compra propia, y el panel del organizador)', () => {
    const c = toAdCampaign(FILA, true)
    expect(c.hours).toBe(48)
    expect(c.total).toBe(250000)
  })

  /**
   * El modo de falla más silencioso posible, y por eso tiene test propio:
   * `rows.map(toAdCampaign)` le pasa (valor, ÍNDICE, array). El índice caía en `conPrecio`, así
   * que la PRIMERA campaña salía bien (índice 0, falsy) y de la segunda en adelante filtraba el
   * precio igual. Una lista de una sola campaña —que es el caso de prueba obvio— nunca lo mostraba.
   */
  it('pasado directo a .map() no filtra el precio de la segunda fila en adelante', () => {
    const salida = [FILA, FILA, FILA].map((r) => toAdCampaign(r))
    for (const [i, c] of salida.entries()) {
      expect(c, `la campaña ${i} filtró el precio`).not.toHaveProperty('total')
      expect(c, `la campaña ${i} filtró las horas`).not.toHaveProperty('hours')
    }
  })
})
