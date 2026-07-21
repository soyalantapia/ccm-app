import { describe, it, expect } from 'vitest'
import { contraste, luminancia, oscurecer, revisarPaleta, MINIMO_AA } from './contraste'

describe('contraste — ratio WCAG', () => {
  it('negro sobre blanco es 21 (el máximo posible)', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('un color contra sí mismo es 1', () => {
    expect(contraste('#b8860b', '#b8860b')).toBeCloseTo(1, 5)
  })

  it('es simétrico: no importa cuál va de texto y cuál de fondo', () => {
    expect(contraste('#33261d', '#f5f0e8')).toBeCloseTo(contraste('#f5f0e8', '#33261d')!, 10)
  })

  it('acepta con y sin numeral, en mayúsculas o minúsculas', () => {
    const esperado = contraste('#000000', '#ffffff')
    expect(contraste('000000', 'FFFFFF')).toBeCloseTo(esperado!, 10)
  })

  it('devuelve null si el color no es un hex de 6 dígitos', () => {
    expect(contraste('rojo', '#ffffff')).toBeNull()
    expect(contraste('#fff', '#ffffff')).toBeNull() // 3 dígitos: el editor siempre emite 6
    expect(luminancia('#zzzzzz')).toBeNull()
  })

  it('el caso real que motivó esto: blanco sobre el dorado NO llega a AA', () => {
    // #b8860b es el dorado de marca. Los CTAs eran blanco sobre ese fondo.
    const r = contraste('#ffffff', '#b8860b')!
    expect(r).toBeCloseTo(3.25, 2)
    expect(r).toBeLessThan(MINIMO_AA)
  })

  it('el dorado profundo de marca SÍ llega', () => {
    const r = contraste('#ffffff', '#8a6208')!
    expect(r).toBeCloseTo(5.48, 2)
    expect(r).toBeGreaterThanOrEqual(MINIMO_AA)
  })
})

describe('oscurecer — replica el color-mix de accent-strong', () => {
  it('78% del dorado da el mismo color que pinta el botón (medido en el navegador)', () => {
    expect(oscurecer('#b8860b')).toBe('#906909') // rgb(144, 105, 9)
  })

  it('el resultado del botón cumple AA con el dorado de CCM', () => {
    expect(contraste('#ffffff', oscurecer('#b8860b')!)).toBeGreaterThanOrEqual(MINIMO_AA)
  })

  it('devuelve null si el color no es válido', () => {
    expect(oscurecer('violeta')).toBeNull()
  })
})

describe('revisarPaleta — avisa solo cuando hay algo que decir', () => {
  const paletaCCM = {
    bg: '#f5f0e8',
    surface: '#ffffff',
    ink: '#33261d',
    'ink-soft': '#666666',
    accent: '#8a6208',
    'accent-ink': '#ffffff',
    night: '#33261d',
    'night-ink': '#f5f0e8',
  }

  it('la paleta de CCM no genera avisos', () => {
    expect(revisarPaleta(paletaCCM)).toEqual([])
  })

  it('la paleta REAL de CCM (dorado #b8860b) no genera ningún aviso', () => {
    // Este es el caso que importa: es lo que ve el cliente al abrir el editor sin tocar nada.
    // El botón usa el acento oscurecido (4,99 ✓) y la sigla del sponsor es texto grande, que
    // rige contra 3 (3,25 ✓). Un aviso permanente acá enseñaría a ignorar todos los avisos.
    expect(revisarPaleta({ ...paletaCCM, accent: '#b8860b' })).toEqual([])
  })

  it('la sigla del sponsor se mide contra el mínimo de texto grande, no contra 4,5', () => {
    // 3,25 pasa el mínimo de texto grande (3) pero no el de texto normal (4,5): si el par
    // estuviera mal configurado, este caso avisaría.
    const avisos = revisarPaleta({ ...paletaCCM, accent: '#b8860b' })
    expect(avisos.some((a) => /sigla/i.test(a.donde))).toBe(false)
  })

  it('pero si el acento es tan claro que ni el texto grande se lee, avisa', () => {
    const avisos = revisarPaleta({ ...paletaCCM, accent: '#f7e9b0' })
    expect(avisos.some((a) => /sigla/i.test(a.donde))).toBe(true)
  })

  it('avisa por los botones cuando el acento es tan claro que ni oscurecido alcanza', () => {
    const avisos = revisarPaleta({ ...paletaCCM, accent: '#ffe680' })
    expect(avisos.some((a) => /botones/i.test(a.donde))).toBe(true)
  })

  it('detecta texto principal ilegible sobre el fondo', () => {
    const avisos = revisarPaleta({ ...paletaCCM, ink: '#e8e0d0' })
    expect(avisos.some((a) => a.texto === 'ink' && a.fondo === 'bg')).toBe(true)
  })

  it('puede avisar de varios pares a la vez', () => {
    const avisos = revisarPaleta({ ...paletaCCM, accent: '#b8860b', ink: '#cccccc' })
    expect(avisos.length).toBeGreaterThan(1)
  })

  it('ignora los tokens que falten en vez de romper', () => {
    expect(() => revisarPaleta({ ink: '#000000' })).not.toThrow()
    expect(revisarPaleta({ ink: '#000000' })).toEqual([])
  })

  it('un color inválido no genera un aviso falso', () => {
    expect(revisarPaleta({ ...paletaCCM, accent: 'no-es-un-color' })).toEqual([])
  })
})
