import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { Button, Field, Img, Input, Select, Sheet, toast } from '../../components/ui'
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

type Form = {
  title: string
  eventLabel: string
  date: string
  cover: string
  sponsorId: string
  photos: string[]
  /** src → {id, alt} de las fotos ya persistidas, para no regenerarles identidad al editar. */
  existentes: Map<string, { id: string; alt: string }>
}

function fromGallery(g: Gallery): Form {
  return {
    title: g.title,
    eventLabel: g.eventLabel,
    date: g.date,
    cover: g.cover,
    sponsorId: g.sponsorId,
    photos: g.photos.map((p) => p.src),
    // Identidad + alt curado de las fotos que YA existen, indexados por src (la identidad
    // estable de una foto en su galería). Sin esto el submit regeneraba un id nuevo para cada
    // foto y pisaba el alt, y el backend trataba la edición como "reemplazar la colección".
    existentes: new Map(g.photos.map((p) => [p.src, { id: p.id, alt: p.alt }])),
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
    existentes: new Map(),
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
      photos: prev.photos.includes(src)
        ? prev.photos.filter((p) => p !== src)
        : [...prev.photos, src],
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
    // Una foto que ya existía conserva su id y su alt: regenerarlos convertía cualquier edición
    // (cambiar el título de la galería) en un borrado y alta de las filas Photo, y PhotoFavorite
    // y PhotoDownload cuelgan de Photo en cascada → se perdían favoritos y descargas de usuarios.
    const photos: Photo[] = f.photos.map((src, i) => {
      const previa = f.existentes.get(src)
      return previa
        ? { id: previa.id, src, alt: previa.alt }
        : { id: newId('ph'), src, alt: `${title} · foto ${i + 1}` }
    })
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
          <Field label="Portada" required>
            <Select options={COVER_OPTIONS} value={f.cover} onChange={set('cover')} />
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
              const on = f.photos.includes(src)
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
