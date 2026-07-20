import { describe, it, expect } from 'vitest'
import { tsConfiable } from './analyticsService.js'

/**
 * POST /api/v1/analytics es ingesta PÚBLICA (se trackea antes de que el device tenga token),
 * y el `ts` lo declaraba el cliente sin ninguna cota. Cualquiera podía sembrar eventos con
 * fechas arbitrarias y corromper las series temporales del panel del organizador y del
 * reporte que se le vende al sponsor — que es un entregable comercial.
 */

const AHORA = new Date('2026-07-20T12:00:00.000Z')
const iso = (ms: number) => new Date(AHORA.getTime() + ms).toISOString()

describe('tsConfiable — el ts del cliente solo vale dentro de una ventana razonable', () => {
  it('respeta un ts reciente (el caso normal: el buffer se flushea en segundos)', () => {
    const hace30s = iso(-30_000)
    expect(tsConfiable(hace30s, AHORA).toISOString()).toBe(hace30s)
  })

  it('respeta un ts de hace horas (app cerrada con buffer pendiente)', () => {
    const hace6h = iso(-6 * 60 * 60 * 1000)
    expect(tsConfiable(hace6h, AHORA).toISOString()).toBe(hace6h)
  })

  it('tolera un reloj adelantado unos minutos', () => {
    const en2min = iso(2 * 60 * 1000)
    expect(tsConfiable(en2min, AHORA).toISOString()).toBe(en2min)
  })

  it('DESCARTA un ts del futuro lejano (envenenaría los KPIs de meses que no pasaron)', () => {
    expect(tsConfiable(iso(365 * 24 * 60 * 60 * 1000), AHORA)).toEqual(AHORA)
  })

  it('DESCARTA un ts del pasado lejano (reescribiría el histórico del reporte al sponsor)', () => {
    expect(tsConfiable(iso(-30 * 24 * 60 * 60 * 1000), AHORA)).toEqual(AHORA)
  })

  it('DESCARTA una fecha inválida en vez de persistir un Invalid Date', () => {
    expect(tsConfiable('no-es-una-fecha', AHORA)).toEqual(AHORA)
    expect(tsConfiable('', AHORA)).toEqual(AHORA)
  })

  it('sin ts usa la hora del server', () => {
    expect(tsConfiable(undefined, AHORA)).toEqual(AHORA)
  })

  it('los bordes exactos de la ventana se aceptan', () => {
    expect(tsConfiable(iso(-24 * 60 * 60 * 1000), AHORA).toISOString()).toBe(iso(-24 * 60 * 60 * 1000))
    expect(tsConfiable(iso(5 * 60 * 1000), AHORA).toISOString()).toBe(iso(5 * 60 * 1000))
  })
})
