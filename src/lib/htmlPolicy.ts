/**
 * Política de HTML permitido en el cuerpo de las notas — ÚNICA fuente de verdad.
 *
 * La consume el servidor (sanitize-html, al guardar: es el límite de confianza real) y
 * el front (DOMPurify, al renderizar: defensa en profundidad). Si las dos listas se
 * separan aparecen bugs raros —contenido que se guarda pero no se ve—, así que viven acá.
 *
 * El server importa este archivo por ruta relativa; el Dockerfile copia `/app/src` a la
 * imagen y el proceso arranca con tsx, así que resuelve el .ts en runtime.
 *
 * Criterio de la lista: lo que necesita una NOTA EDITORIAL y nada más.
 *  - Sin `script`, `style`, `iframe`, `object`, `embed`, `form`, `input` → nada ejecutable
 *    ni embebible. El video va por el campo `youtubeId`, no pegando un iframe en el cuerpo.
 *  - Sin `h1`: el título de la nota ya es el h1 de la página; otro h1 rompe la jerarquía.
 *  - Sin `style`/`class`/`id`: la tipografía la define el diseño de CCM, no el que pega el
 *    HTML. Evita que una nota se lleve puesto el layout.
 */

/** Etiquetas permitidas en el cuerpo de una nota. */
export const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's',
  'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'blockquote',
  'a',
  'img', 'figure', 'figcaption',
  'code', 'pre',
] as const

/** Atributos permitidos, por etiqueta. Todo lo demás (incluido on*) se descarta. */
export const ALLOWED_ATTR_BY_TAG: Record<string, string[]> = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
}

/** Lista plana de atributos, para DOMPurify (que no distingue por etiqueta). */
export const ALLOWED_ATTR = [...new Set(Object.values(ALLOWED_ATTR_BY_TAG).flat())]

/** Esquemas de URL admitidos en href/src. Se permiten además rutas relativas (/uploads/…). */
export const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'] as const

/**
 * ¿Hay CUALQUIER marcado? — decide si hay que sanitizar (pregunta de seguridad).
 *
 * Deliberadamente amplia: incluye etiquetas que NO están permitidas (`<script>`, `<svg>`,
 * `<form>`, `<object>`) y los comentarios. Si acá usáramos la lista de etiquetas seguras,
 * un cuerpo compuesto solo por etiquetas peligrosas no matchearía, se tomaría por "texto
 * plano" y se guardaría crudo. Ante la duda: sanitizar.
 *
 * Un texto como "5 < 10" no matchea porque exige una letra, `/` o `!` pegados al `<`.
 */
export function hasMarkup(body: string): boolean {
  return /<[a-zA-Z!/][^>]*>/.test(body)
}

/**
 * ¿El cuerpo tiene estructura HTML? — decide cómo RENDERIZAR (pregunta de presentación).
 *
 * Las notas viejas se guardaron como texto con un markdown mínimo (**negrita**, un salto
 * de línea = párrafo). Se detecta por una etiqueta estructural real para que sigan
 * renderizando igual, sin migración ni columna nueva. Es más angosta que `hasMarkup` a
 * propósito: elegir mal acá solo cambia el aspecto, no la seguridad — el camino heredado
 * escapa el texto (React) y lo que se guardó ya pasó por el sanitizador.
 */
export function isHtmlBody(body: string): boolean {
  return /<(p|br|hr|strong|b|em|i|u|s|h2|h3|h4|ul|ol|li|blockquote|a|img|figure|figcaption|code|pre|div|span)\b[^>]*>/i.test(body)
}
