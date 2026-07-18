import type { ReactNode } from 'react'

/**
 * Render inline MÍNIMO y SEGURO para el cuerpo de las notas (feedback Gastón: "poder
 * poner negritas"). Soporta **negrita**, *itálica* y [texto](url), construyendo
 * elementos React — NO usa dangerouslySetInnerHTML, así el texto de la nota nunca
 * puede inyectar HTML/scripts. Los links se validan a http(s)/mailto/relativos.
 */
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('*')) {
      out.push(<em key={key++}>{tok.slice(1, -1)}</em>)
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
      if (link) {
        const href = /^(https?:\/\/|mailto:|\/)/i.test(link[2]) ? link[2] : '#'
        out.push(
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
            {link[1]}
          </a>,
        )
      } else {
        out.push(tok)
      }
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
