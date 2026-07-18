import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Input, Select, Sheet, Textarea, toast } from '../../components/ui'
import { store } from '../../data/store'
import type { EventItem, EventType } from '../../data/types'

const TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'camino', label: 'Camino a CCM (previo)' },
  { value: 'capacitacion', label: 'Capacitación' },
  { value: 'principal', label: 'Evento principal' },
]

/** Portadas disponibles en public/img (rutas relativas que resuelve asset()). */
const COVER_OPTIONS: { value: string; label: string }[] = [
  { value: 'img/events/principal.jpg', label: 'Principal · pasarela' },
  { value: 'img/events/camino-18.jpg', label: 'Camino · charla' },
  { value: 'img/events/camino-30.jpg', label: 'Camino · networking' },
  { value: 'img/hero/hero-main.jpg', label: 'Hero · desfile' },
  { value: 'img/hero/hero-night.jpg', label: 'Hero · noche' },
  { value: 'img/hero/hero-sunset.jpg', label: 'Hero · atardecer' },
  { value: 'img/gallery/g03.jpg', label: 'Editorial 1' },
  { value: 'img/gallery/g12.jpg', label: 'Editorial 2' },
]

type Form = {
  title: string
  type: EventType
  subtitle: string
  dateLabel: string
  startDate: string
  timeLabel: string
  venue: string
  address: string
  description: string
  cover: string
}

const empty: Form = {
  title: '',
  type: 'camino',
  subtitle: '',
  dateLabel: '',
  startDate: '',
  timeLabel: '',
  venue: '',
  address: '',
  description: '',
  cover: COVER_OPTIONS[0].value,
}

function fromEvent(e: EventItem): Form {
  return {
    title: e.title,
    type: e.type,
    subtitle: e.subtitle ?? '',
    dateLabel: e.dateLabel,
    startDate: e.startDate.slice(0, 10),
    timeLabel: e.timeLabel ?? '',
    venue: e.venue,
    address: e.address,
    description: e.description,
    cover: e.cover,
  }
}

interface Props {
  open: boolean
  /** Evento a editar; omitido = crear nuevo. */
  event?: EventItem
  onClose: () => void
}

/** Alta y edición de eventos desde el admin (CRUD real sobre la capa local). */
export function OpsEventForm({ open, event, onClose }: Props) {
  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setF(event ? fromEvent(event) : empty)
      setError('')
    }
  }, [open, event])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const required: (keyof Form)[] = ['title', 'dateLabel', 'startDate', 'venue', 'address', 'description', 'cover']
    if (required.some((k) => !f[k].trim())) {
      setError('Completá los campos obligatorios.')
      return
    }
    const mapsUrl = event?.mapsUrl
      ? event.mapsUrl
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${f.venue} ${f.address}`)}`
    const data = {
      type: f.type,
      title: f.title.trim(),
      subtitle: f.subtitle.trim() || undefined,
      dateLabel: f.dateLabel.trim(),
      startDate: f.startDate,
      timeLabel: f.timeLabel.trim() || undefined,
      venue: f.venue.trim(),
      address: f.address.trim(),
      mapsUrl,
      description: f.description.trim(),
      cover: f.cover,
    }
    if (event) {
      store.updateEvent(event.id, data)
      toast('✓ Evento actualizado')
    } else {
      store.createEvent({ ...data, sponsorIds: [], past: false })
      toast('✓ Evento creado · ya aparece en la app')
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={event ? 'Editar evento' : 'Crear evento'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Título" required>
          <Input value={f.title} onChange={set('title')} placeholder="Ej: Camino a CCM · Julio" required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <Select options={TYPE_OPTIONS} value={f.type} onChange={set('type')} />
          </Field>
          <Field label="Portada" required hint="Elegí una del set o pegá la URL de tu imagen">
            <div className="grid gap-2">
              <Select options={COVER_OPTIONS} value={f.cover} onChange={set('cover')} />
              <Input value={f.cover} onChange={set('cover')} placeholder="…o pegá una URL: https://…/portada.jpg" />
            </div>
          </Field>
        </div>
        <Field label="Subtítulo" hint="Opcional, una línea corta">
          <Input value={f.subtitle} onChange={set('subtitle')} placeholder="Charlas, networking y desfile cápsula" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fecha (texto)" required>
            <Input value={f.dateLabel} onChange={set('dateLabel')} placeholder="18 de julio de 2026" required />
          </Field>
          <Field label="Fecha (para ordenar)" required>
            <Input type="date" value={f.startDate} onChange={set('startDate')} required />
          </Field>
        </div>
        <Field label="Horario" hint="Opcional">
          <Input value={f.timeLabel} onChange={set('timeLabel')} placeholder="17 a 21 hs" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Lugar" required>
            <Input value={f.venue} onChange={set('venue')} placeholder="Hotel Quinto Centenario" required />
          </Field>
          <Field label="Dirección" required>
            <Input value={f.address} onChange={set('address')} placeholder="Duarte Quirós 1300, Córdoba" required />
          </Field>
        </div>
        <Field label="Descripción" required>
          <Textarea
            value={f.description}
            onChange={set('description')}
            rows={4}
            placeholder="De qué se trata el evento…"
            required
          />
        </Field>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="sm:order-2">
            {event ? 'Guardar cambios' : 'Crear evento'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
