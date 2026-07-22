import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, Field, Input, Select, Sheet, Textarea, toast } from '../../components/ui'
import { store } from '../../data/store'
import type { ContentItem } from '../../data/types'

/**
 * Saca el código del video de lo que sea que hayan pegado.
 *
 * El campo pedía el id pelado ("el código después de v="), pero lo que cualquiera hace es
 * copiar la URL de la barra del navegador y pegarla entera. Eso se guardaba tal cual: la
 * miniatura quedaba en gris y el video no se reproducía, sin un solo mensaje que lo dijera.
 * Ya pasó — en la base quedaron contenidos de prueba llamados "URL completa" y "youtu.be",
 * guardados rotos.
 *
 * Cubre las formas en que YouTube reparte un link: la URL de escritorio, la corta de
 * compartir, la de móvil, /embed, /shorts y /live, con o sin parámetros extra.
 * Devuelve '' si no encuentra un id válido, para poder avisarlo en vez de guardar basura.
 */
export function extraerYoutubeId(entrada: string): string {
  const texto = entrada.trim()
  if (!texto) return ''
  // Un id de YouTube son 11 caracteres de [A-Za-z0-9_-]. Si ya pegaron eso, listo.
  const ID = /^[\w-]{11}$/
  if (ID.test(texto)) return texto
  const patrones = [
    /[?&]v=([\w-]{11})/, // youtube.com/watch?v=ID  y  ...&v=ID
    /youtu\.be\/([\w-]{11})/, // youtu.be/ID
    /\/(?:embed|shorts|live|v)\/([\w-]{11})/, // /embed/ID, /shorts/ID, /live/ID, /v/ID
  ]
  for (const p of patrones) {
    const m = texto.match(p)
    if (m) return m[1]
  }
  return ''
}

/** Plataformas/secciones del catálogo CCM. */
const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sin plataforma' },
  { value: 'Moda', label: 'Moda' },
  { value: 'Belleza', label: 'Belleza' },
  { value: 'Arte', label: 'Arte' },
  { value: 'Turismo', label: 'Turismo' },
  { value: 'Gastronomía', label: 'Gastronomía' },
  { value: 'Tecnología', label: 'Tecnología' },
  { value: 'Sustentabilidad', label: 'Sustentabilidad' },
]

type Form = {
  title: string
  youtubeId: string
  description: string
  duration: string
  platform: string
  sponsorId: string
  publishedAt: string
  /** Gating de contenido premium. Sin esto en el Form nunca entraba al patch y el organizador
   *  no podía marcar (ni desmarcar) un video como exclusivo de Socios desde el panel. */
  socioOnly: boolean
}

const empty: Form = {
  title: '',
  youtubeId: '',
  description: '',
  duration: '',
  platform: '',
  sponsorId: '',
  publishedAt: '',
  socioOnly: false,
}

function fromContent(c: ContentItem): Form {
  return {
    title: c.title,
    youtubeId: c.youtubeId,
    description: c.description,
    duration: c.duration ?? '',
    platform: c.platform ?? '',
    sponsorId: c.sponsorId ?? '',
    publishedAt: c.publishedAt.slice(0, 10),
    socioOnly: c.socioOnly ?? false,
  }
}

interface Props {
  open: boolean
  /** Video a editar; omitido = crear nuevo. */
  content?: ContentItem
  onClose: () => void
}

/** Alta y edición de videos del catálogo de Contenido (CRUD real sobre la capa local). */
export function OpsContentForm({ open, content, onClose }: Props) {
  const sponsorOptions = useMemo(
    () => [
      { value: '', label: 'Sin sponsor' },
      ...store.getSponsors().map((s) => ({ value: s.id, label: s.name })),
    ],
    [],
  )

  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setF(content ? fromContent(content) : empty)
      setError('')
    }
  }, [open, content])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.title.trim() || !f.youtubeId.trim() || !f.description.trim() || !f.publishedAt.trim()) {
      setError('Completá los campos obligatorios.')
      return
    }
    // No se guarda un video que no se va a poder ver. Antes esto entraba igual y el error
    // recién aparecía en la app pública, como una miniatura gris sin explicación.
    const id = extraerYoutubeId(f.youtubeId)
    if (!id) {
      setError('Ese link de YouTube no se entiende. Pegá la dirección del video o su código de 11 caracteres.')
      return
    }
    const data = {
      type: 'video' as const,
      title: f.title.trim(),
      description: f.description.trim(),
      youtubeId: id,
      duration: f.duration.trim() || undefined,
      platform: f.platform || undefined,
      sponsorId: f.sponsorId || undefined,
      publishedAt: f.publishedAt,
      socioOnly: f.socioOnly, // booleano explícito: destildarlo debe llegar como false
    }
    if (content) {
      store.updateContent(content.id, data)
      toast('✓ Video actualizado')
    } else {
      store.createContent(data)
      toast('✓ Video creado · ya aparece en Contenido')
    }
    onClose()
  }

  const youtubeId = extraerYoutubeId(f.youtubeId)
  // Se pegó una URL (o algo que no es un id) y pudimos sacarle el código: lo avisamos en vez de
  // corregir en silencio, así la próxima vez sabe qué pegar.
  const seCorrigioSolo = youtubeId !== '' && youtubeId !== f.youtubeId.trim()
  const idInvalido = f.youtubeId.trim() !== '' && youtubeId === ''

  return (
    <Sheet open={open} onClose={onClose} title={content ? 'Editar video' : 'Crear video'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Título" required>
          <Input
            value={f.title}
            onChange={set('title')}
            placeholder="Ej: Backstage del desfile de gala"
            required
          />
        </Field>

        <Field
          label="Video de YouTube"
          required
          hint="Pegá la dirección del video, tal cual la copiás de YouTube."
        >
          <Input
            value={f.youtubeId}
            onChange={set('youtubeId')}
            placeholder="https://www.youtube.com/watch?v=cPRpNqmziUs"
            required
          />
        </Field>

        {seCorrigioSolo && (
          <p className="-mt-2 text-[12px] leading-relaxed text-ink-soft">
            Listo: de ese link tomamos el video <strong className="text-ink">{youtubeId}</strong>.
          </p>
        )}

        {idInvalido && (
          <p className="-mt-2 text-[12px] leading-relaxed text-danger">
            No encontramos ningún video en eso. Copiá la dirección desde la barra del navegador o
            desde el botón Compartir de YouTube.
          </p>
        )}

        {youtubeId && (
          <img
            src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
            alt="Miniatura del video"
            className="aspect-video w-full rounded-sm border border-line object-cover"
          />
        )}

        <Field label="Descripción" required>
          <Textarea
            value={f.description}
            onChange={set('description')}
            rows={4}
            placeholder="De qué se trata el video…"
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Duración" hint="Opcional, ej: 3:12">
            <Input value={f.duration} onChange={set('duration')} placeholder="3:12" />
          </Field>
          <Field label="Fecha de publicación" required>
            <Input type="date" value={f.publishedAt} onChange={set('publishedAt')} required />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Plataforma" hint="Opcional">
            <Select options={PLATFORM_OPTIONS} value={f.platform} onChange={set('platform')} />
          </Field>
          <Field label="Sponsor" hint="Opcional">
            <Select options={sponsorOptions} value={f.sponsorId} onChange={set('sponsorId')} />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-surface p-3">
          <input
            type="checkbox"
            checked={f.socioOnly}
            onChange={(e) => setF((prev) => ({ ...prev, socioOnly: e.target.checked }))}
            className="size-4 accent-accent"
          />
          <span className="text-[15px] text-ink">
            Exclusivo para Socios CCM <span className="text-ink-soft">— el video se muestra con candado</span>
          </span>
        </label>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="sm:order-2">
            {content ? 'Guardar cambios' : 'Crear video'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
