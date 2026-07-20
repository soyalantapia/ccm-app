import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { Button, Field, Img, Input, Select, Sheet, toast, ImageUpload } from '../../components/ui'
import { store } from '../../data/store'
import { newId } from '../../lib/storage'
import type { Gallery, Photo } from '../../data/types'

/** Pool de fotos disponibles en public/img/gallery (rutas que resuelve asset()). */
const PHOTO_POOL: string[] = Array.from(
  { length: 20 },
  (_, i) => `img/gallery/g${String(i + 1).padStart(2, '0')}.jpg`,
)

/** Portadas: las primeras 8 del pool, con labels legibles. */
const COVER_OPTIONS: { value: string; label: string }[] = PHOTO_POOL.slice(0, 8).map((src, i) => ({
  value: src,
  label: `Foto ${i + 1}`,
}))

/**
 * Foto en edición. Lleva el `id` REAL de la foto y su `alt` tal como está guardado.
 * Antes el form guardaba solo la URL: al guardar regeneraba id y alt de todas, lo que
 * borraba los favoritos/descargas del asistente (cascade sobre Photo) y pisaba los
 * epígrafes escritos a mano. La identidad de una foto es su id, nunca su URL.
 */
type PhotoForm = { id?: string; src: string; alt: string }

type Form = {
  title: string
  eventLabel: string
  date: string
  cover: string
  sponsorId: string
  photos: PhotoForm[]
}

function fromGallery(g: Gallery): Form {
  return {
    title: g.title,
    eventLabel: g.eventLabel,
    date: g.date,
    cover: g.cover,
    sponsorId: g.sponsorId,
    photos: g.photos.map((p) => ({ id: p.id, src: p.src, alt: p.alt })),
  }
}

interface Props {
  open: boolean
  /** Galería a editar; omitida = crear nueva. */
  gallery?: Gallery
  onClose: () => void
}

/** Alta y edición de galerías de fotos desde el admin (CRUD real sobre la capa local). */
export function OpsGalleryForm({ open, gallery, onClose }: Props) {
  const sponsorOptions = useMemo(
    () => store.getSponsors().map((s) => ({ value: s.id, label: s.name })),
    [],
  )

  const empty: Form = {
    title: '',
    eventLabel: '',
    date: '',
    cover: COVER_OPTIONS[0].value,
    sponsorId: sponsorOptions[0]?.value ?? '',
    photos: [],
  }

  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setF(gallery ? fromGallery(gallery) : empty)
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gallery])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const togglePhoto = (src: string) =>
    setF((prev) => ({
      ...prev,
      photos: prev.photos.some((p) => p.src === src)
        ? prev.photos.filter((p) => p.src !== src)
        : [...prev.photos, { src, alt: '' }],
    }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.title.trim() || !f.eventLabel.trim() || !f.date.trim() || !f.cover || !f.sponsorId) {
      setError('Completá los campos obligatorios.')
      return
    }
    if (f.photos.length === 0) {
      setError('Elegí al menos una foto para la galería.')
      return
    }
    const title = f.title.trim()
    // Conservamos id y alt de las que ya existían; solo las nuevas estrenan id y epígrafe genérico.
    const photos: Photo[] = f.photos.map((p, i) => ({
      id: p.id ?? newId('ph'),
      src: p.src,
      alt: p.alt || `${title} · foto ${i + 1}`,
    }))
    const data = {
      title,
      eventLabel: f.eventLabel.trim(),
      date: f.date.trim(),
      cover: f.cover,
      sponsorId: f.sponsorId,
      photos,
    }
    if (gallery) {
      store.updateGallery(gallery.id, data)
      toast('✓ Galería actualizada')
    } else {
      store.createGallery(data)
      toast('✓ Galería creada · ya aparece en Fotos')
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={gallery ? 'Editar galería' : 'Crear galería'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Título" required>
          <Input
            value={f.title}
            onChange={set('title')}
            placeholder="Ej: Desfile de Gala · CCM 2025"
            required
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Etiqueta del evento" required>
            <Input
              value={f.eventLabel}
              onChange={set('eventLabel')}
              placeholder="Ej: Gala · CCM 2025"
              required
            />
          </Field>
          <Field label="Fecha (texto)" required>
            <Input value={f.date} onChange={set('date')} placeholder="Septiembre 2025" required />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Portada" required hint="Elegí una del set o subí la foto real">
            <div className="flex items-center gap-2">
              <Select options={COVER_OPTIONS} value={f.cover} onChange={set('cover')} className="flex-1" />
              <ImageUpload label="Subir" onUrl={(url) => setF((p) => ({ ...p, cover: url }))} />
            </div>
          </Field>
          <Field label="Sponsor (slot S3)" required>
            <Select
              options={sponsorOptions}
              value={f.sponsorId}
              onChange={set('sponsorId')}
              placeholder="Elegí un sponsor"
            />
          </Field>
        </div>

        {f.cover && (
          <Img
            src={f.cover}
            alt="Vista previa de la portada"
            ratio="16/10"
            className="rounded-sm border border-line"
          />
        )}

        <Field label={`Fotos de la galería · ${f.photos.length} elegidas`} required>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {PHOTO_POOL.map((src, i) => {
              const on = f.photos.some((p) => p.src === src)
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => togglePhoto(src)}
                  aria-pressed={on}
                  className={`relative overflow-hidden rounded-sm transition ${
                    on ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'ring-1 ring-line'
                  }`}
                >
                  <Img src={src} alt={`Foto ${i + 1}`} ratio="1/1" />
                  {on && (
                    <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-accent text-accent-ink">
                      <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Field>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="sm:order-2">
            {gallery ? 'Guardar cambios' : 'Crear galería'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
