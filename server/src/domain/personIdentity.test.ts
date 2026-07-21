import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizeDni, keysFromApplicationData, enmascararClave } from './personIdentity.js'

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

/**
 * El log sirve para auditar; no para llevarse los datos de la gente. Los logs de la app no
 * tienen control de acceso por rol, así que un email o un DNI completo escrito ahí sale del
 * único lugar donde está protegido.
 */
describe('enmascararClave — auditar sin exponer', () => {
  it('del email conserva el dominio y apenas el arranque del usuario', () => {
    expect(enmascararClave('email', 'juanperez@gmail.com')).toBe('email=ju*******@gmail.com')
  })

  it('del documento conserva sólo los últimos tres, como un resumen bancario', () => {
    expect(enmascararClave('dni', '30123456')).toBe('dni=*****456')
  })

  it('NUNCA deja el valor completo en el texto', () => {
    for (const [clave, valor] of [
      ['email', 'brendacaceres.arte@gmail.com'],
      ['dni', '27888999'],
      ['cuit', '20308889991'],
    ] as const) {
      expect(enmascararClave(clave, valor)).not.toContain(valor)
    }
  })

  it('un usuario de una sola letra tampoco queda al descubierto', () => {
    const salida = enmascararClave('email', 'a@x.com')
    expect(salida).toContain('*')
    expect(salida).toBe('email=a*@x.com')
  })

  it('dos personas distintas siguen distinguiéndose al leer el log', () => {
    // El punto del log es poder auditar: dos casos diferentes no pueden verse iguales.
    expect(enmascararClave('email', 'ana@gmail.com')).not.toBe(
      enmascararClave('email', 'luis@gmail.com'),
    )
  })

  it('un valor vacío o ausente se dice, no se inventa', () => {
    expect(enmascararClave('dni', null)).toBe('dni=(vacío)')
    expect(enmascararClave('email', '')).toBe('email=(vacío)')
  })
})
