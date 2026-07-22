import { describe, it, expect } from 'vitest'
import { esDePrimerNivel } from './eventMeta'

/**
 * La regla que este test protege NO es el helper (que es trivial): es DÓNDE se aplica.
 *
 * El filtro de iniciativas va en los selectores de RENDER del front —la grilla de /eventos, la
 * landing, la lista de capacitaciones de la membresía— y NUNCA en getEvents/getEventsWithBlocks
 * del server. Si alguien lo "prolija" moviéndolo a la consulta, las iniciativas desaparecen de
 * la ficha de su propio evento padre y del panel, que son los dos únicos lugares donde tienen
 * que verse. Ese movimiento no rompe ningún test de tipos ni tira ningún error: simplemente la
 * sección queda vacía y nadie se entera.
 */
describe('iniciativas adentro de un evento', () => {
  it('un evento sin parentId es de primer nivel', () => {
    expect(esDePrimerNivel({})).toBe(true)
    expect(esDePrimerNivel({ parentId: null })).toBe(true)
    expect(esDePrimerNivel({ parentId: undefined })).toBe(true)
  })

  it('un evento con parentId NO es de primer nivel: no va a la grilla general', () => {
    expect(esDePrimerNivel({ parentId: 'ev-principal-2026' })).toBe(false)
  })

  it('filtrar una lista deja fuera sólo a las iniciativas', () => {
    const eventos = [
      { id: 'ev-principal', parentId: null },
      { id: 'ev-camino', parentId: undefined },
      { id: 'ini-workshop-claudia', parentId: 'ev-principal' },
      { id: 'ini-taller-precio', parentId: 'ev-principal' },
    ]
    expect(eventos.filter(esDePrimerNivel).map((e) => e.id)).toEqual(['ev-principal', 'ev-camino'])
    // Y el camino inverso, que es el que usa la ficha del padre y el panel:
    expect(eventos.filter((e) => e.parentId === 'ev-principal').map((e) => e.id)).toEqual([
      'ini-workshop-claudia',
      'ini-taller-precio',
    ])
  })
})
