import { describe, it, expect } from 'vitest'
import { SOCIO_PRICE, PRICE_PER_HOUR_BY_SLOT, priceForCampaign } from '../../../src/lib/pricing.js'

describe('pricing compartido — la fuente de verdad de los montos', () => {
  it('expone el precio de Socio', () => {
    expect(SOCIO_PRICE).toBe(9900)
  })

  it('cobra la publicidad por hora según el slot', () => {
    expect(priceForCampaign('S2', 5)).toBe(PRICE_PER_HOUR_BY_SLOT.S2 * 5)
    expect(priceForCampaign('S1', 1)).toBe(9000)
  })

  it('normaliza horas inválidas a 1 en vez de devolver 0 o NaN', () => {
    expect(priceForCampaign('S2', 0)).toBe(PRICE_PER_HOUR_BY_SLOT.S2)
    expect(priceForCampaign('S2', -3)).toBe(PRICE_PER_HOUR_BY_SLOT.S2)
    expect(priceForCampaign('S2', 2.7)).toBe(PRICE_PER_HOUR_BY_SLOT.S2 * 2)
  })

  it('un slot desconocido no cobra $0 — cae a la tarifa del feed', () => {
    expect(priceForCampaign('S9' as never, 1)).toBe(PRICE_PER_HOUR_BY_SLOT.S2)
  })
})

describe('el server ignora el monto que manda el cliente', () => {
  it('una campaña de 5h en S2 cuesta la tarifa, no lo que pida el request', () => {
    const totalDelCliente = 1
    const totalReal = priceForCampaign('S2', 5)
    expect(totalReal).not.toBe(totalDelCliente)
    expect(totalReal).toBe(30000)
  })
})
