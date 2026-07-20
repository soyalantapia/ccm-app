import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Input, Select, Sheet, Textarea, ImageUpload } from '../../components/ui'
import { store } from '../../data/store'
import { asset } from '../../lib/assets'
import type { Nota } from '../../data/types'

const CATEGORY_OPTIONS = [
  { value: '', label: 'Sin categoría' },
  { value: 'evento', label: 'Evento' },
  { value: 'moda', label: 'Moda' },
  { value: 'belleza', label: 'Belleza' },
  { value: 'arte', label: 'Arte' },
  { value: 'gastronomia', label: 'Gastronomía' },
  { value: 'turismo', label: 'Turismo' },
  { value: 'tecnologia', label: 'Tecnología' },
]

type Form = {
  title: string
  slug: string
  excerpt: string
  body: string
  cover: string
  author: string
  category: string
  youtubeId: string
  published: string
  publishedAt: string
  order: string
}

const empty: Form = {
  title: '', slug: '', excerpt: '', body: '', cover: '', author: 'Prensa CCM',
  category: '', youtubeId: '', published: 'true', publishedAt: '', order: '0',
}

function fromNota(n: Nota): Form {
  return {
    title: n.title, slug: n.slug, excerpt: n.excerpt, body: n.body, cover: n.cover ?? '',
    author: n.author ?? '', category: n.category ?? '', youtubeId: n.youtubeId ?? '',
    published: n.published ? 'true' : 'false', publishedAt: n.publishedAt.slice(0, 10), order: String(n.order ?? 0),
  }
}

interface Props {
  open: boolean
  nota?: Nota
  onClose: () => void
}

/** Alta y edición de notas (lo edita prensa). CRUD real sobre el backend. */
export function OpsNotaForm({ open, nota, onClose }: Props) {
  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setF(nota ? fromNota(nota) : { ...empty, publishedAt: new Date().toISOString().slice(0, 10) })
      setError('')
    }
  }, [open, nota])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.title.trim() || !f.excerpt.trim() || !f.body.trim() || !f.publishedAt.trim()) {
      setError('Completá título, bajada, cuerpo y fecha.')
      return
    }
    const data = {
      title: f.title.trim(),
      ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
      excerpt: f.excerpt.trim(),
      body: f.body.trim(),
      cover: f.cover.trim() || undefined,
      author: f.author.trim() || undefined,
      category: f.category || undefined,
      youtubeId: f.youtubeId.trim() || undefined,
      published: f.published === 'true',
      publishedAt: f.publishedAt,
      order: Number(f.order) || 0,
    }
    if (nota) store.updateNota(nota.id, data)
    else store.createNota(data)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={nota ? 'Editar nota' : 'Crear nota'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Título" required>
          <Input value={f.title} onChange={set('title')} placeholder="Título de la nota" required />
        </Field>

        <Field label="Bajada / resumen" required hint="Aparece en la tarjeta">
          <Textarea value={f.excerpt} onChange={set('excerpt')} rows={2} placeholder="Resumen corto…" required />
        </Field>

        <Field
          label="Cuerpo"
          required
          hint="Un salto de línea = párrafo nuevo. Formato: **negrita**, *itálica*, [texto](https://link)."
        >
          <Textarea value={f.body} onChange={set('body')} rows={8} placeholder="El cuerpo de la nota…  Podés usar **negrita**." required />
        </Field>

        <Field label="Imagen de portada (URL)" hint="Opcional — subila desde tu compu o pegá la URL">
          <div className="flex items-center gap-2">
            <Input value={f.cover} onChange={set('cover')} placeholder="https://…/portada.jpg o img/gallery/g03.jpg" className="flex-1" />
            <ImageUpload label="Subir" onUrl={(url) => setF((p) => ({ ...p, cover: url }))} />
          </div>
        </Field>
        {f.cover.trim() && (
          <img src={asset(f.cover.trim())} alt="Vista previa"
            className="aspect-video w-full rounded-sm border border-line object-cover" />
        )}

        <Field label="Video de YouTube (ID)" hint="Opcional — para notas con video">
          <Input value={f.youtubeId} onChange={set('youtubeId')} placeholder="cPRpNqmziUs" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Categoría">
            <Select options={CATEGORY_OPTIONS} value={f.category} onChange={set('category')} />
          </Field>
          <Field label="Autor / firma">
            <Input value={f.author} onChange={set('author')} placeholder="Prensa CCM" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Fecha" required>
            <Input type="date" value={f.publishedAt} onChange={set('publishedAt')} required />
          </Field>
          <Field label="Orden">
            <Input type="number" value={f.order} onChange={set('order')} />
          </Field>
          <Field label="Estado">
            <Select
              options={[{ value: 'true', label: 'Publicada' }, { value: 'false', label: 'Borrador' }]}
              value={f.published}
              onChange={set('published')}
            />
          </Field>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="sm:order-2">
            {nota ? 'Guardar cambios' : 'Crear nota'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
