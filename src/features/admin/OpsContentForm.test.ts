import { describe, it, expect } from 'vitest'
import { extraerYoutubeId } from './OpsContentForm'

/**
 * El campo pedía el id pelado ("el código después de v=") y lo que cualquiera hace es copiar
 * la URL de la barra del navegador. Eso se guardaba tal cual: miniatura gris, video que no
 * reproduce, y ni un mensaje que lo dijera. Ya pasó — en la base quedaron contenidos de prueba
 * llamados "URL completa" y "youtu.be", guardados rotos.
 */
describe('extraerYoutubeId — acepta lo que la gente realmente pega', () => {
  const ID = 'cPRpNqmziUs'

  const ACEPTA: [string, string][] = [
    ['el id pelado', ID],
    ['la URL de escritorio', `https://www.youtube.com/watch?v=${ID}`],
    ['sin https', `www.youtube.com/watch?v=${ID}`],
    ['con la lista de reproducción pegada atrás', `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`],
    ['con el tiempo de inicio', `https://www.youtube.com/watch?v=${ID}&t=42s`],
    ['la corta de Compartir', `https://youtu.be/${ID}`],
    ['la corta con tiempo', `https://youtu.be/${ID}?t=30`],
    ['la de móvil', `https://m.youtube.com/watch?v=${ID}`],
    ['la de embeber', `https://www.youtube.com/embed/${ID}`],
    ['un short', `https://www.youtube.com/shorts/${ID}`],
    ['una transmisión en vivo', `https://www.youtube.com/live/${ID}`],
    ['con espacios de más al copiar', `  https://youtu.be/${ID}  `],
  ]

  for (const [caso, entrada] of ACEPTA) {
    it(`saca el código de ${caso}`, () => {
      expect(extraerYoutubeId(entrada)).toBe(ID)
    })
  }

  const RECHAZA: [string, string][] = [
    ['vacío', ''],
    ['sólo espacios', '   '],
    ['un link que no es de YouTube', 'https://vimeo.com/123456789'],
    ['el título del video en vez del link', 'Backstage del desfile de gala'],
    ['una URL de YouTube sin video', 'https://www.youtube.com/'],
    ['un id demasiado corto', 'abc123'],
  ]

  for (const [caso, entrada] of RECHAZA) {
    it(`devuelve vacío con ${caso} (para poder avisar, en vez de guardar basura)`, () => {
      expect(extraerYoutubeId(entrada)).toBe('')
    })
  }

  it('no confunde un id de 11 caracteres con una URL', () => {
    // 'watch?v=xxx' no es un id válido aunque tenga largo parecido
    expect(extraerYoutubeId('watch?v=abc')).toBe('')
  })
})
