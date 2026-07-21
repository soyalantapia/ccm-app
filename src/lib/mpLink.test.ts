import { describe, it, expect } from 'vitest'
import { mpLinkValido } from './mpLink'

/**
 * El QR de Membresía y Publicidad apuntaba a `mercadopago.com.ar/checkout/ccm?…`, una URL
 * inventada: Mercado Pago responde "La página que buscás ya no existe". El usuario escaneaba
 * y no podía pagar. Hasta que haya links reales, sólo aceptamos un cobro de MP de verdad.
 */
describe('mpLinkValido — sólo un link de cobro real habilita el QR', () => {
  it('sin variable de entorno devuelve null', () => {
    expect(mpLinkValido(undefined)).toBeNull()
    expect(mpLinkValido('')).toBeNull()
    expect(mpLinkValido('   ')).toBeNull()
  })

  it('rechaza la URL inventada que rompía el pago', () => {
    expect(
      mpLinkValido('https://www.mercadopago.com.ar/checkout/ccm?tipo=membresia&plan=socio&monto=25000'),
    ).toBeNull()
  })

  it('rechaza la home pelada de MP (el placeholder del seed, no un cobro)', () => {
    expect(mpLinkValido('https://www.mercadopago.com.ar')).toBeNull()
    expect(mpLinkValido('https://www.mercadopago.com.ar/')).toBeNull()
  })

  it('rechaza dominios que no son de Mercado Pago y todo lo que no sea https', () => {
    expect(mpLinkValido('https://mercadopago.com.ar.phishing.net/abc')).toBeNull()
    expect(mpLinkValido('http://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123')).toBeNull()
    expect(mpLinkValido('javascript:alert(1)')).toBeNull()
    expect(mpLinkValido('no-es-una-url')).toBeNull()
  })

  it('acepta un link de pago real de Mercado Pago', () => {
    const link = 'https://mpago.la/2abcDeF'
    expect(mpLinkValido(link)).toBe(link)
    const pref = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-abc'
    expect(mpLinkValido(pref)).toBe(pref)
  })
})
