/**
 * RichTextEditor — editor visual de notas que produce HTML limpio.
 *
 * Pensado para que el equipo de prensa escriba sin saber HTML (barra con negrita, títulos,
 * listas, cita, link, imagen) pero sin encerrar a quien SÍ quiere HTML: el botón `</>`
 * muestra y deja editar el código directo.
 *
 * Por qué TipTap: el pegado desde Word/Google Docs/otra web se limpia solo. TipTap descarta
 * todo lo que no esté en su esquema, así que el `<span style=…>` que arrastra Word no llega
 * nunca al cuerpo de la nota. El esquema se configura para reflejar `htmlPolicy`: si algo no
 * está permitido al guardar, tampoco se puede escribir acá.
 */
import { useEffect, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote,
  Link2, Link2Off, Image as ImageIcon, Undo2, Redo2, Code2, Minus,
} from 'lucide-react'
import { ImageUpload } from './ImageUpload'
import { toast } from './Toast'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

/** Botón de la barra. `active` = el formato está aplicado donde está el cursor. */
function TbBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`rounded-xs p-1.5 transition-colors disabled:opacity-30 ${
        active ? 'bg-accent/15 text-accent' : 'text-ink-soft hover:bg-ink/8 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor, onHtmlMode }: { editor: Editor; onHtmlMode: () => void }) {
  const setLink = () => {
    const previo = editor.getAttributes('link').href ?? ''
    const url = window.prompt('Link (dejá vacío para quitarlo):', previo)
    if (url === null) return
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run()
      return
    }
    // Solo esquemas seguros: lo mismo que acepta el sanitizador al guardar.
    const href = url.trim()
    if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(href)) {
      toast('El link debe empezar con https://, mailto:, tel: o /', 'info')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface px-2 py-1.5">
      <TbBtn title="Negrita" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
        <Bold size={15} />
      </TbBtn>
      <TbBtn title="Itálica" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
        <Italic size={15} />
      </TbBtn>
      <span className="mx-1 h-4 w-px bg-line" />
      <TbBtn title="Título" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
        <Heading2 size={15} />
      </TbBtn>
      <TbBtn title="Subtítulo" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
        <Heading3 size={15} />
      </TbBtn>
      <span className="mx-1 h-4 w-px bg-line" />
      <TbBtn title="Lista con viñetas" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
        <List size={15} />
      </TbBtn>
      <TbBtn title="Lista numerada" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
        <ListOrdered size={15} />
      </TbBtn>
      <TbBtn title="Cita destacada" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
        <Quote size={15} />
      </TbBtn>
      <TbBtn title="Separador" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus size={15} />
      </TbBtn>
      <span className="mx-1 h-4 w-px bg-line" />
      <TbBtn title="Poner o editar link" onClick={setLink} active={editor.isActive('link')}>
        <Link2 size={15} />
      </TbBtn>
      <TbBtn title="Quitar link" onClick={() => editor.chain().focus().unsetLink().run()} disabled={!editor.isActive('link')}>
        <Link2Off size={15} />
      </TbBtn>
      {/* Insertar imagen: reusa la subida al volumen; también acepta pegar una URL. */}
      <ImageUpload
        label=""
        className="!border-0 !bg-transparent !px-1.5 !py-1.5"
        onUrl={(url) => editor.chain().focus().setImage({ src: url, alt: '' }).run()}
      />
      <TbBtn
        title="Insertar imagen por URL"
        onClick={() => {
          const url = window.prompt('URL de la imagen:')
          if (!url?.trim()) return
          if (!/^(https?:\/\/|\/)/i.test(url.trim())) {
            toast('La URL debe empezar con https:// o /', 'info')
            return
          }
          editor.chain().focus().setImage({ src: url.trim(), alt: '' }).run()
        }}
      >
        <ImageIcon size={15} />
      </TbBtn>
      <span className="mx-1 h-4 w-px bg-line" />
      <TbBtn title="Deshacer" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 size={15} />
      </TbBtn>
      <TbBtn title="Rehacer" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 size={15} />
      </TbBtn>
      <div className="ml-auto">
        <button
          type="button"
          onClick={onHtmlMode}
          title="Ver y editar el HTML"
          className="flex items-center gap-1.5 rounded-xs px-2 py-1.5 text-[12px] text-ink-soft transition-colors hover:bg-ink/8 hover:text-ink"
        >
          <Code2 size={14} /> HTML
        </button>
      </div>
    </div>
  )
}

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const [htmlMode, setHtmlMode] = useState(false)
  const [draft, setDraft] = useState(value) // buffer del modo HTML

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Solo h2-h4: el h1 es el título de la nota (ver htmlPolicy).
        heading: { levels: [2, 3, 4] },
        link: false, // se configura aparte, abajo
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto', 'tel'],
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          'min-h-[220px] max-h-[520px] overflow-y-auto px-3.5 py-3 text-[15px] leading-relaxed text-ink focus:outline-none ' +
          // Espejo (reducido) de la tipografía pública, para que escribir se parezca a publicar.
          '[&_p]:mb-3 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-[22px] ' +
          '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:font-display [&_h3]:text-[18px] ' +
          '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold ' +
          '[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 ' +
          '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-3 [&_blockquote]:text-ink/85 ' +
          '[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-sm ' +
          '[&_a]:text-accent [&_a]:underline [&_hr]:my-4 [&_hr]:border-ink/15',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Si el cuerpo cambia desde afuera (abrir el sheet para editar otra nota), recargar.
  useEffect(() => {
    if (!editor || htmlMode) return
    if (value !== editor.getHTML()) editor.commands.setContent(value || '', { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  const salirDeHtml = () => {
    onChange(draft)
    editor?.commands.setContent(draft || '', { emitUpdate: false })
    setHtmlMode(false)
  }

  if (!editor) return null

  return (
    <div className="overflow-hidden rounded-sm border border-line bg-bg/50 focus-within:border-accent">
      {htmlMode ? (
        <>
          <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-1.5">
            <span className="eyebrow text-[10px] text-ink-soft">Editando HTML</span>
            <button
              type="button"
              onClick={salirDeHtml}
              className="rounded-xs px-2 py-1 text-[12px] text-accent transition-colors hover:bg-accent/10"
            >
              ← Volver al editor visual
            </button>
          </div>
          <textarea
            value={draft}
            // Se propaga en cada tecla, no sólo al volver al editor visual. Antes lo escrito acá
            // vivía SOLO en el estado interno: quien pegaba el texto en HTML y guardaba derecho
            // perdía todo. Creando, el formulario le pedía completar un cuerpo que estaba a la
            // vista; EDITANDO era peor — guardaba contento y dejaba el cuerpo VIEJO.
            onChange={(e) => {
              setDraft(e.target.value)
              onChange(e.target.value)
            }}
            rows={14}
            spellCheck={false}
            placeholder="<h2>Título</h2>&#10;<p>Párrafo…</p>"
            className="w-full resize-y bg-transparent px-3.5 py-3 font-mono text-[13px] leading-relaxed text-ink focus:outline-none"
          />
          <p className="border-t border-line px-3.5 py-2 text-[11px] text-ink-soft">
            Al volver al editor visual se descarta lo que no esté permitido (scripts, estilos, iframes).
          </p>
        </>
      ) : (
        <>
          <Toolbar editor={editor} onHtmlMode={() => { setDraft(editor.getHTML()); setHtmlMode(true) }} />
          {editor.isEmpty && placeholder && (
            <p className="pointer-events-none absolute px-3.5 py-3 text-[15px] text-ink-soft/50">{placeholder}</p>
          )}
          <EditorContent editor={editor} />
        </>
      )}
    </div>
  )
}
