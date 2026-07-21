import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizeDni, keysFromApplicationData } from './personIdentity.js'

describe('normalizeEmail', () => {
  it('baja a minúsculas y recorta espacios', () => {
    expect(normalizeEmail('  Ana.Perez@Gmail.COM ')).toBe('ana.perez@gmail.com')
  })
  it('descarta lo que no parece un email', () => {
    expect(normalizeEmail('sin-arroba')).toBeNull()
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })
})

describe('normalizeDni', () => {
  it('deja solo dígitos', () => {
    expect(normalizeDni('38.456.120')).toBe('38456120')
    expect(normalizeDni('DNI 38 456 120')).toBe('38456120')
  })
  it('descarta los que no tienen largo de DNI', () => {
    expect(normalizeDni('123')).toBeNull()      // muy corto
    expect(normalizeDni('1234567890123')).toBeNull() // muy largo
    expect(normalizeDni(null)).toBeNull()
  })
  it('extrae el DNI de adentro de un CUIT/CUIL válido', () => {
    expect(normalizeDni('20-38456120-4')).toBe('38456120')
  })
  it('el DNI y su CUIT correspondiente normalizan a la misma clave (evita duplicar persona)', () => {
    expect(normalizeDni('38456120')).toBe(normalizeDni('20-38456120-4'))
  })
  it('saca los ceros a la izquierda', () => {
    expect(normalizeDni('07234567')).toBe('7234567')
    expect(normalizeDni('7234567')).toBe('7234567')
    expect(normalizeDni('07234567')).toBe(normalizeDni('7234567'))
  })
  it('descarta un teléfono de 10 dígitos tipeado por error en el campo DNI', () => {
    expect(normalizeDni('1123456789')).toBeNull()
  })
  it('descarta un número de 11 dígitos con prefijo de CUIT inválido', () => {
    expect(normalizeDni('12345678901')).toBeNull()
  })
})

describe('keysFromApplicationData', () => {
  it('saca email y dni del JSON de la postulación', () => {
    const data = { nombre: 'Milagros Soria', email: 'Milagros@Gmail.com', dni: '38.456.120' }
    expect(keysFromApplicationData(data)).toEqual({ email: 'milagros@gmail.com', dni: '38456120' })
  })
  it('tolera un JSON sin esos campos', () => {
    expect(keysFromApplicationData({ nombre: 'X', historia: 'Y' })).toEqual({ email: null, dni: null })
  })
  it('tolera basura', () => {
    expect(keysFromApplicationData(null)).toEqual({ email: null, dni: null })
    expect(keysFromApplicationData('texto')).toEqual({ email: null, dni: null })
  })
})
