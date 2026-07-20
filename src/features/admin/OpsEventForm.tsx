import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Img, Input, Select, Sheet, Textarea, toast, ImageUpload } from '../../components/ui'
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
  // Flags de visibilidad: sin estos en el Form, nunca entraban al patch y la whitelist
  // `if (k in patch)` del backend jamás los veía → quedaban congelados en el default del
  // create. El organizador no podía archivar un evento ni marcarlo exclusivo de Socios.
  past: boolean
  socioOnly: boolean
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
  past: false,
  socioOnly: false,
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
    past: e.past ?? false,
    socioOnly: e.socioOnly ?? false,
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
    const required = ['title', 'dateLabel', 'startDate', 'venue', 'address', 'description', 'cover'] as const
    if (required.some((k) => !f[k].trim())) {
      setError('Completá los campos obligatorios.')
      return
    }
    // El link de mapa se recalcula cuando cambia la SEDE. Antes la condición era
    // `event?.mapsUrl ? conservarlo : generarlo`, usando "existe" como proxy de "lo cargó el
    // organizador a mano" — pero el form nunca expuso mapsUrl y el create siempre lo genera,
    // así que en edición el proxy era siempre verdadero: mover un evento de sede dejaba el
    // mapa apuntando a la dirección vieja para siempre.
    const auto = (venue: string, address: string) =>
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.trim()} ${address.trim()}`)}`
    const sedeCambio = !event || f.venue.trim() !== event.venue || f.address.trim() !== event.address
    const mapsUrl = sedeCambio ? auto(f.venue, f.address) : event.mapsUrl
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
      // Booleanos SIEMPRE explícitos (no `|| undefined`): destildar un flag tiene que llegar
      // al backend como false, no desaparecer del patch.
      past: f.past,
      socioOnly: f.socioOnly,
    }
    if (event) {
      store.updateEvent(event.id, data)
      toast('✓ Evento actualizado')
    } else {
      store.createEvent({ ...data, sponsorIds: [] })
      toast('✓ Evento creado · ya aparece en la app')
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={event ? 'Editar evento' : 'Crear evento'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {/* Preview en vivo — "ver cómo queda" la ficha mientras se carga (feedback Gastón). */}
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-bg">
          <div className="relative">
            <Img src={f.cover || COVER_OPTIONS[0].value} alt="" ratio="16/9" className="w-full" />
            <span className="absolute left-2 top-2 rounded bg-ink/80 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
              {TYPE_OPTIONS.find((t) => t.value === f.type)?.label ?? f.type}
            </span>
          </div>
          <div className="p-3">
            <p className="type-serif text-lg leading-tight text-ink">{f.title || 'Título del evento'}</p>
            {f.subtitle && <p className="mt-0.5 text-sm text-ink-soft">{f.subtitle}</p>}
            <p className="mt-1.5 text-xs text-ink-soft">
              {[f.dateLabel, f.timeLabel, f.venue].filter(Boolean).join(' · ') || 'Fecha · horario · lugar'}
            </p>
          </div>
        </div>

        <Field label="Título" required>
          <Input value={f.title} onChange={set('title')} placeholder="Ej: Camino a CCM · Julio" required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <Select options={TYPE_OPTIONS} value={f.type} onChange={set('type')} />
          </Field>
          <Field label="Portada" required hint="Elegí una del set, subí la tuya o pegá una URL">
            <div className="grid gap-2">
              <Select options={COVER_OPTIONS} value={f.cover} onChange={set('cover')} />
              <div className="flex items-center gap-2">
                <Input value={f.cover} onChange={set('cover')} placeholder="…o pegá una URL: https://…/portada.jpg" className="flex-1" />
                <ImageUpload label="Subir" onUrl={(url) => setF((p) => ({ ...p, cover: url }))} />
              </div>
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

        <div className="space-y-2.5 rounded-md border border-line bg-surface p-3">
          <p className="eyebrow text-[10px] text-ink-soft">Visibilidad</p>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={f.socioOnly}
              onChange={(e) => setF((prev) => ({ ...prev, socioOnly: e.target.checked }))}
              className="size-4 accent-accent"
            />
            <span className="text-[15px] text-ink">Exclusivo para Socios CCM</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={f.past}
              onChange={(e) => setF((prev) => ({ ...prev, past: e.target.checked }))}
              className="size-4 accent-accent"
            />
            <span className="text-[15px] text-ink">
              Evento finalizado <span className="text-ink-soft">— se archiva y no admite inscripciones</span>
            </span>
          </label>
        </div>

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
