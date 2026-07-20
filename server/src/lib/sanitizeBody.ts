/**
 * Sanitización del cuerpo de las notas en el SERVIDOR — el límite de confianza real.
 *
 * Se aplica al guardar (create/update), de modo que lo que queda en la base ya está limpio:
 * cualquier consumidor futuro (otro front, un export, un feed) recibe HTML seguro sin
 * depender de que se acuerde de sanitizar.
 *
 * La lista de etiquetas/atributos NO se define acá: sale de la política compartida con el
 * front (../../../src/lib/htmlPolicy.ts) para que no puedan divergir.
 */
import sanitizeHtmlLib from 'sanitize-html'
import { ALLOWED_TAGS, ALLOWED_ATTR_BY_TAG, ALLOWED_SCHEMES, hasMarkup } from '../../../src/lib/htmlPolicy.js'

const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: ALLOWED_ATTR_BY_TAG,
  allowedSchemes: [...ALLOWED_SCHEMES],
  // Permite rutas relativas (/uploads/foto.png) en href y src.
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  // Descarta el contenido de las etiquetas peligrosas en vez de dejar su texto suelto.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  // Todo link externo abre en pestaña nueva y sin pasar el referrer.
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? ''
      const external = /^https?:\/\//i.test(href)
      return {
        tagName,
        attribs: {
          ...attribs,
          ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        },
      }
    },
    // Las imágenes del cuerpo siempre cargan diferido: una nota con muchas fotos no
    // debe frenar la primera pintada.
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
  },
}

/**
 * Limpia el cuerpo de una nota.
 *
 * Se sanitiza ante CUALQUIER marcado, no solo ante el permitido: un cuerpo hecho solo de
 * `<script>`/`<svg onload>`/`<form>` también tiene que pasar por acá. El texto plano
 * heredado (sin una sola etiqueta) se devuelve tal cual, para no escapar `<` legítimos.
 */
export function sanitizeNotaBody(body: string): string {
  if (!hasMarkup(body)) return body
  return sanitizeHtmlLib(body, OPTIONS)
}
