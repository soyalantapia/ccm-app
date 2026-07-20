/**
 * RichText — pinta el cuerpo de una nota en la vista pública.
 *
 * Dos caminos, elegidos automáticamente (ver `isHtmlBody`):
 *  - HTML (notas nuevas, escritas con el editor): se sanitiza con DOMPurify y se inyecta.
 *    El servidor YA limpió al guardar; esto es defensa en profundidad para cubrir datos
 *    viejos, una base tocada a mano o cualquier vía que se saltee el servicio.
 *  - Texto plano (notas viejas): markdown mínimo con `renderInline`, un salto de línea =
 *    un párrafo. Se conserva para que las notas ya publicadas se sigan viendo igual.
 *
 * La tipografía se define acá y NO en el HTML de la nota: quien escribe aporta la
 * estructura (títulos, listas, citas) y el diseño de CCM aporta el aspecto. Por eso la
 * política de HTML no admite `style` ni `class`.
 */
import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { ALLOWED_TAGS, ALLOWED_ATTR, isHtmlBody } from '../../lib/htmlPolicy'
import { renderInline } from '../../lib/richText'

/**
 * Estilos del contenido editorial. Tailwind 4 sin plugin de typography: se aplican con
 * selectores de hijo directo para no depender de clases dentro del HTML de la nota.
 */
const PROSE = [
  'text-[17px] leading-relaxed text-ink',
  // Bloques
  '[&>p]:mb-4',
  '[&>h2]:mt-10 [&>h2]:mb-3 [&>h2]:font-display [&>h2]:text-[26px] [&>h2]:leading-tight [&>h2]:text-ink',
  '[&>h3]:mt-8 [&>h3]:mb-2.5 [&>h3]:font-display [&>h3]:text-[21px] [&>h3]:leading-tight [&>h3]:text-ink',
  '[&>h4]:mt-6 [&>h4]:mb-2 [&>h4]:text-[17px] [&>h4]:font-semibold [&>h4]:text-ink',
  // Primer bloque sin margen superior: la nota arranca pegada a su encabezado
  '[&>*:first-child]:mt-0',
  // Listas
  '[&>ul]:mb-4 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1.5',
  '[&>ol]:mb-4 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:space-y-1.5',
  '[&_li]:pl-1',
  // Cita destacada — barra en color de marca
  '[&>blockquote]:my-6 [&>blockquote]:border-l-2 [&>blockquote]:border-accent [&>blockquote]:pl-4',
  '[&>blockquote]:font-display [&>blockquote]:text-[20px] [&>blockquote]:leading-snug [&>blockquote]:text-ink/85',
  '[&>blockquote>p]:mb-0',
  // Imágenes y figuras
  '[&_img]:my-6 [&_img]:w-full [&_img]:rounded-sm',
  '[&>figure]:my-6 [&>figure>img]:my-0',
  '[&_figcaption]:mt-2 [&_figcaption]:text-[13px] [&_figcaption]:text-ink-soft',
  // Links
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80',
  // Separador y código
  '[&>hr]:my-8 [&>hr]:border-ink/10',
  '[&_code]:rounded-xs [&_code]:bg-ink/8 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[15px]',
  '[&>pre]:my-5 [&>pre]:overflow-x-auto [&>pre]:rounded-sm [&>pre]:bg-ink/8 [&>pre]:p-4 [&>pre]:text-[14px]',
  '[&>pre>code]:bg-transparent [&>pre>code]:p-0',
  // Último bloque sin margen: evita el hueco extra contra el cierre de la nota
  '[&>*:last-child]:mb-0',
].join(' ')

interface Props {
  /** Cuerpo de la nota: HTML del editor o texto plano heredado. */
  body: string
  className?: string
}

export function RichText({ body, className = '' }: Props) {
  const html = useMemo(() => {
    if (!isHtmlBody(body)) return null
    return DOMPurify.sanitize(body, {
      ALLOWED_TAGS: [...ALLOWED_TAGS],
      ALLOWED_ATTR: [...ALLOWED_ATTR],
      // Sin `data-*` ni namespaces raros: solo lo declarado arriba.
      ALLOW_DATA_ATTR: false,
    })
  }, [body])

  if (html === null) {
    // Camino heredado: un salto de línea = un párrafo.
    return (
      <div className={`space-y-4 text-[17px] leading-relaxed text-ink ${className}`}>
        {body.split('\n').filter((p) => p.trim()).map((p, i) => (
          <p key={i}>{renderInline(p)}</p>
        ))}
      </div>
    )
  }

  return <div className={`${PROSE} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
