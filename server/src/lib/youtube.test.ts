import { describe, it, expect } from 'vitest'
import { normalizarYoutubeId } from './youtube'

/**
 * El backend guardaba cualquier cosa en youtubeId. Reproducido contra la base local: 7 de 7
 * entradas basura aceptadas con HTTP 201, incluida la URL completa de YouTube — que es
 * justamente lo que uno pega sin pensar. El resultado era una miniatura rota y un video que
 * no carga, sin aviso, porque el id se interpola en la URL de la imagen y del embed.
 */
describe('normalizarYoutubeId', () => {
  it('deja pasar un id ya válido', () => {
    expect(normalizarYoutubeId('gCwUaYOvxSg')).toBe('gCwUaYOvxSg')
  })

  it('extrae el id de las formas en que YouTube reparte un video', () => {
    const casos: [string, string][] = [
      ['https://www.youtube.com/watch?v=gCwUaYOvxSg', 'gCwUaYOvxSg'],
      ['https://youtube.com/watch?v=gCwUaYOvxSg&t=42s', 'gCwUaYOvxSg'],
      ['https://youtu.be/gCwUaYOvxSg', 'gCwUaYOvxSg'],
      ['https://youtu.be/gCwUaYOvxSg?si=abc123', 'gCwUaYOvxSg'],
      ['https://www.youtube.com/embed/gCwUaYOvxSg', 'gCwUaYOvxSg'],
      ['https://www.youtube.com/shorts/gCwUaYOvxSg', 'gCwUaYOvxSg'],
      ['https://www.youtube.com/live/gCwUaYOvxSg', 'gCwUaYOvxSg'],
    ]
    for (const [entrada, esperado] of casos) {
      expect(normalizarYoutubeId(entrada), entrada).toBe(esperado)
    }
  })

  it('limpia los espacios de copiar y pegar', () => {
    expect(normalizarYoutubeId('  gCwUaYOvxSg  ')).toBe('gCwUaYOvxSg')
  })

  it('vacío y null son válidos: el video es opcional', () => {
    expect(normalizarYoutubeId('')).toBe('')
    expect(normalizarYoutubeId('   ')).toBe('')
    expect(normalizarYoutubeId(null)).toBe('')
    expect(normalizarYoutubeId(undefined)).toBe('')
  })

  it('RECHAZA lo que no contiene un id, en vez de guardarlo roto', () => {
    for (const malo of [
      'no soy un id',
      '"><script>alert(1)</script>',
      'https://vimeo.com/123456789',
      'gCwUaYOvx', // 9 caracteres
      'gCwUaYOvxSgXX', // 13
      'https://www.youtube.com/watch?v=corto',
    ]) {
      expect(() => normalizarYoutubeId(malo), malo).toThrowError()
    }
  })

  it('rechaza lo que no es texto', () => {
    expect(() => normalizarYoutubeId(42)).toThrowError()
    expect(() => normalizarYoutubeId({ v: 'x' })).toThrowError()
  })
})
