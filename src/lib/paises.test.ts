import { describe, it, expect } from 'vitest'
import { PAISES, PAIS_POR_DEFECTO, banderaDe, separarTelefono, unirTelefono } from './paises'

/**
 * El teléfono se guarda como UN string («+54 3511234567»), igual que antes de que existiera el
 * selector de país. Lo delicado es el ida y vuelta: los números que ya están cargados se
 * escribieron a mano, con formato libre, y ninguno puede perderse al abrir el formulario.
 */

describe('catálogo de países', () => {
  it('tiene todos los países y ninguno repetido', () => {
    expect(PAISES.length).toBeGreaterThan(200)
    const isos = PAISES.map((p) => p.iso)
    expect(new Set(isos).size, 'hay ISOs duplicados').toBe(isos.length)
  })

  it('todos los prefijos tienen forma válida', () => {
    for (const p of PAISES) {
      expect(p.prefijo, `${p.nombre} tiene un prefijo raro`).toMatch(/^\+\d{1,4}$/)
      expect(p.iso, `${p.nombre} tiene un ISO raro`).toMatch(/^[A-Z]{2}$/)
      expect(p.nombre.trim().length).toBeGreaterThan(0)
    }
  })

  it('arranca con Argentina: el evento es en Córdoba', () => {
    expect(PAIS_POR_DEFECTO.iso).toBe('AR')
    expect(PAIS_POR_DEFECTO.prefijo).toBe('+54')
  })

  it('los vecinos están arriba, no perdidos entre 200 opciones', () => {
    const primeros = PAISES.slice(0, 11).map((p) => p.iso)
    for (const iso of ['AR', 'UY', 'CL', 'BR', 'PY', 'BO']) {
      expect(primeros, `${iso} debería estar entre los primeros`).toContain(iso)
    }
  })

  it('la bandera sale del ISO, sin imágenes', () => {
    expect(banderaDe('AR')).toBe('🇦🇷')
    expect(banderaDe('BR')).toBe('🇧🇷')
    expect(banderaDe('us')).toBe('🇺🇸') // tolera minúsculas
  })
})

describe('separarTelefono — leer lo que ya está guardado', () => {
  it('separa un número con prefijo', () => {
    const r = separarTelefono('+54 3511234567')
    expect(r.pais.iso).toBe('AR')
    expect(r.numero).toBe('3511234567')
  })

  it('reconoce prefijos largos y no se queda con el corto', () => {
    // +598 empieza igual que +5: si se eligiera por orden y no por longitud, Uruguay se
    // confundiría con otro país.
    expect(separarTelefono('+598 99123456').pais.iso).toBe('UY')
    expect(separarTelefono('+595 981123456').pais.iso).toBe('PY')
    expect(separarTelefono('+591 71234567').pais.iso).toBe('BO')
  })

  it('con prefijo compartido elige el país de la región (el primero de la lista)', () => {
    // +1 lo comparten Estados Unidos, Canadá y medio Caribe: no se puede adivinar cuál es, pero
    // sí ser consistente.
    expect(separarTelefono('+1 3055551234').pais.prefijo).toBe('+1')
  })

  it('un número SIN prefijo no se pierde: queda tal cual con el país por defecto', () => {
    const r = separarTelefono('3511234567')
    expect(r.pais.iso).toBe('AR')
    expect(r.numero, 'se perdió el número que ya estaba cargado').toBe('3511234567')
  })

  it('aguanta los formatos que la gente escribe a mano', () => {
    for (const escrito of ['0351 15 1234567', '(351) 123-4567', '351-123-4567', '15 1234567']) {
      const r = separarTelefono(escrito)
      expect(r.numero, `se perdió «${escrito}»`).toBe(escrito)
    }
  })

  it('vacío o nulo no rompe', () => {
    expect(separarTelefono('').numero).toBe('')
    expect(separarTelefono('   ').numero).toBe('')
    expect(separarTelefono(undefined as never).numero).toBe('')
  })
})

describe('unirTelefono — lo que se persiste', () => {
  it('arma el string con prefijo', () => {
    expect(unirTelefono(PAIS_POR_DEFECTO, '3511234567')).toBe('+54 3511234567')
  })

  it('sin número devuelve vacío, no un prefijo suelto', () => {
    // Guardar «+54» solo sería un teléfono que no sirve para nada y que además pasaría por
    // «campo completado».
    expect(unirTelefono(PAIS_POR_DEFECTO, '')).toBe('')
    expect(unirTelefono(PAIS_POR_DEFECTO, '   ')).toBe('')
  })

  it('ida y vuelta: lo que se guarda se vuelve a leer igual', () => {
    for (const pais of PAISES.slice(0, 20)) {
      const guardado = unirTelefono(pais, '1234567')
      const leido = separarTelefono(guardado)
      expect(leido.numero, `${pais.nombre}: se perdió el número`).toBe('1234567')
      expect(leido.pais.prefijo, `${pais.nombre}: cambió el prefijo`).toBe(pais.prefijo)
    }
  })
})
