import { badRequest } from './errors.js'

/**
 * Normaliza lo que el organizador pega en el campo "video" a un id de YouTube.
 *
 * El campo pide el id pelado (`gCwUaYOvxSg`), pero lo natural es copiar la URL de la barra
 * del navegador. El backend guardaba cualquier string sin mirarlo, así que una URL completa
 * quedaba persistida tal cual y después se interpolaba en
 * `https://i.ytimg.com/vi/<id>/mqdefault.jpg` y en el embed: miniatura rota y video que no
 * carga, sin ningún aviso. Medido: 7 de 7 entradas basura aceptadas con HTTP 201, incluida
 * `"><script>alert(1)</script>` (que no es XSS —React escapa el src— pero sí un video muerto).
 *
 * Criterio: tolerante en la entrada, estricto en lo que se guarda. Se aceptan las formas en
 * que YouTube reparte un video y se extrae el id; lo que no contenga un id válido se rechaza
 * con 400 en vez de guardarse roto.
 */

/** Un id de YouTube son 11 caracteres de [A-Za-z0-9_-]. */
const ID = /^[A-Za-z0-9_-]{11}$/

const PATRONES = [
  /[?&]v=([A-Za-z0-9_-]{11})/, // youtube.com/watch?v=ID
  /youtu\.be\/([A-Za-z0-9_-]{11})/, // youtu.be/ID
  /\/embed\/([A-Za-z0-9_-]{11})/, // youtube.com/embed/ID
  /\/shorts\/([A-Za-z0-9_-]{11})/, // youtube.com/shorts/ID
  /\/live\/([A-Za-z0-9_-]{11})/, // youtube.com/live/ID
]

/**
 * @param raw   lo que vino en el payload
 * @param campo nombre para el mensaje de error
 * @returns el id normalizado, o '' si el campo venía vacío (el video es opcional)
 */
export function normalizarYoutubeId(raw: unknown, campo = 'video de YouTube'): string {
  if (raw == null) return ''
  if (typeof raw !== 'string') {
    throw badRequest('INVALID_YOUTUBE_ID', `El ${campo} tiene que ser texto.`)
  }
  const v = raw.trim()
  if (v === '') return '' // sin video: es válido, el contenido puede no tenerlo

  if (ID.test(v)) return v

  for (const p of PATRONES) {
    const m = v.match(p)
    if (m) return m[1]
  }

  throw badRequest(
    'INVALID_YOUTUBE_ID',
    `No pude reconocer el ${campo}. Pegá el enlace del video o su id de 11 caracteres.`,
  )
}
