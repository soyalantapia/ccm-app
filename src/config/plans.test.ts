import { describe, it, expect } from 'vitest'
import { MP_PLACEHOLDER, esLinkDePagoReal, seedPlans } from './plans'

/**
 * `MP_PLACEHOLDER` es la PORTADA de Mercado Pago: no cobra nada. Se lo trataba como link de pago
 * y el comprador terminaba ahí, sin poder pagar, mientras la UI le decía que su pago se estaba
 * confirmando. Este predicado es la única puerta por la que un link puede llegar a ser un cobro.
 */
describe('esLinkDePagoReal', () => {
  it('rechaza el placeholder: la portada de Mercado Pago no es un cobro', () => {
    expect(esLinkDePagoReal(MP_PLACEHOLDER)).toBe(false)
    expect(esLinkDePagoReal('https://www.mercadopago.com.ar/')).toBe(false)
    expect(esLinkDePagoReal('http://mercadopago.com.ar')).toBe(false)
  })

  it('rechaza vacío, null y cualquier cosa que no sea una URL http(s)', () => {
    expect(esLinkDePagoReal(null)).toBe(false)
    expect(esLinkDePagoReal('')).toBe(false)
    expect(esLinkDePagoReal('   ')).toBe(false)
    expect(esLinkDePagoReal('mercadopago.com.ar/checkout/x')).toBe(false)
    expect(esLinkDePagoReal('javascript:alert(1)')).toBe(false)
  })

  it('acepta un link de cobro real cargado a mano por el organizador', () => {
    expect(esLinkDePagoReal('https://mpago.la/2abc9Xy')).toBe(true)
    expect(
      esLinkDePagoReal('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-abc'),
    ).toBe(true)
  })
})

describe('seedPlans', () => {
  it('ningún plan viene sembrado con el placeholder como link de pago', () => {
    expect(seedPlans.filter((p) => p.mpLink === MP_PLACEHOLDER)).toEqual([])
  })
})
