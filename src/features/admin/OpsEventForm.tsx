import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Img, Input, Select, Sheet, Textarea, toast, ImageUpload } from '../../components/ui'
import { store } from '../../data/store'
import type { EventItem, EventType } from '../../data/types'
import { fechaEnTexto, esTextoAutomatico, textoContradiceLaFecha } from '../../lib/eventDate'
import { validarPrecioEvento } from '../eventos/precioEvento'
import { config } from '../../config'

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
  /** Precio en pesos, como texto porque viene de un input. Vacío = sin precio (no se vende). */
  price: string
  /** Cupo total del evento. Vacío = sin tope, que es como se comportó siempre. */
  capacity: string
  /** Los que el organizador ya anotó por fuera (WhatsApp, planilla) y no están en la base. */
  seedTaken: string
  // Flags de visibilidad: sin estos en el Form, nunca entraban al patch y la whitelist
  // `if (k in patch)` del backend jamás los veía → quedaban congelados en el default del
  // create. El organizador no podía archivar un evento ni marcarlo exclusivo de Socios.
  past: boolean
  socioOnly: boolean
}

// La sede de siempre viene puesta: los seis eventos cargados usan la misma. Es editable —hay
// Caminos fuera del hotel— pero no tiene sentido hacer retipear en cada alta algo que el sistema
// ya sabe.
const empty: Form = {
  title: '',
  type: 'camino',
  subtitle: '',
  dateLabel: '',
  startDate: '',
  timeLabel: '',
  venue: config.venue.name,
  address: config.venue.address,
  description: '',
  price: '',
  capacity: '',
  seedTaken: '',
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
    price: e.price != null ? String(e.price) : '',
    capacity: e.capacity != null ? String(e.capacity) : '',
    seedTaken: e.seedTaken ? String(e.seedTaken) : '',
    past: e.past ?? false,
    socioOnly: e.socioOnly ?? false,
  }
}

interface Props {
  open: boolean
  /** Evento a editar; omitido = crear nuevo. */
  event?: EventItem
  /**
   * Al crear: de qué evento cuelga esta INICIATIVA. Se pasa desde la ficha del padre, así el
   * organizador no elige "qué tipo de entidad es" — elige dónde está parado y el sistema
   * completa el resto.
   */
  parentId?: string
  onClose: () => void
}

/** Alta y edición de eventos desde el admin (CRUD real sobre la capa local). */
export function OpsEventForm({ open, event, parentId, onClose }: Props) {
  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  // ¿El texto de la fecha lo escribió una persona, o lo derivamos nosotros? Al editar un evento
  // que ya existe se deduce: si el texto guardado no es el que produciría su fecha, alguien lo
  // escribió a propósito (el evento principal dice "19 y 20 de septiembre") y no hay que pisarlo.
  const [textoPersonalizado, setTextoPersonalizado] = useState(false)

  useEffect(() => {
    if (!open) return
    const inicial = event ? fromEvent(event) : empty
    setF(inicial)
    setError('')
    setTextoPersonalizado(
      !!event && !!inicial.dateLabel && !esTextoAutomatico(inicial.startDate, inicial.dateLabel),
    )
  }, [open, event])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  /** Al elegir la fecha, el texto se reescribe solo — salvo que lo hayan personalizado. */
  const onCambiarFecha = (e: { target: { value: string } }) => {
    const startDate = e.target.value
    setF((prev) => ({
      ...prev,
      startDate,
      dateLabel: textoPersonalizado ? prev.dateLabel : fechaEnTexto(startDate),
    }))
  }

  const volverAlTextoAutomatico = () => {
    setTextoPersonalizado(false)
    setF((prev) => ({ ...prev, dateLabel: fechaEnTexto(prev.startDate) }))
  }

  const textoFecha = f.startDate ? fechaEnTexto(f.startDate) : ''
  // Si personalizaron el texto y nombra un día de la semana que no es el de la fecha, avisamos.
  // No lo bloqueamos: puede haber un texto raro y válido; lo que no puede pasar es que nadie mire.
  const avisoFecha = textoPersonalizado ? textoContradiceLaFecha(f.startDate, f.dateLabel) : null

  /** ¿Este evento ya está a la vista del público? Uno nuevo nace borrador. */
  const yaPublicado = event?.published ?? false

  const submit = (e: FormEvent | React.MouseEvent, opts?: { publicar?: boolean }) => {
    e.preventDefault()
    // Sin `opts` es el submit del formulario, que es el botón de publicar/guardar cambios.
    const publicar = opts?.publicar ?? true
    const required = ['title', 'dateLabel', 'startDate', 'venue', 'address', 'description', 'cover'] as const
    if (required.some((k) => !f[k].trim())) {
      setError('Completá los campos obligatorios.')
      return
    }
    // Reglas del precio (vacío ≠ cero, y precio ≠ candado de Socios) en precioEvento.ts, con tests.
    const precio = validarPrecioEvento({ price: f.price, socioOnly: f.socioOnly })
    if (!precio.ok) {
      setError(precio.error)
      return
    }
    const price = precio.price
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
      // Explícito como los booleanos: borrar el precio tiene que llegar como null, no
      // desaparecer del patch y quedar congelado en el valor anterior.
      price,
      // Ídem cupo. Estos DOS faltaban acá: los campos se renderizaban, se guardaban en el
      // estado y se prellenaban al editar, pero nunca entraban al payload — así que el
      // organizador cargaba "50 lugares", veía el toast de guardado, y el número se tiraba
      // en silencio. El backend siempre los aceptó (adminService: create y update).
      capacity: f.capacity.trim() === '' ? null : Number(f.capacity),
      seedTaken: f.seedTaken.trim() === '' ? 0 : Number(f.seedTaken),
      // Booleanos SIEMPRE explícitos (no `|| undefined`): destildar un flag tiene que llegar
      // al backend como false, no desaparecer del patch.
      past: f.past,
      socioOnly: f.socioOnly,
      published: publicar,
    }
    if (event) {
      store.updateEvent(event.id, data)
      toast(
        publicar
          ? yaPublicado
            ? '✓ Cambios guardados'
            : '✓ Publicado · ya aparece en la app'
          : yaPublicado
            ? '✓ Despublicado · queda sólo para el equipo'
            : '✓ Borrador guardado',
      )
    } else {
      store.createEvent({ ...data, sponsorIds: [], ...(parentId ? { parentId } : {}) })
      toast(publicar ? '✓ Publicado · ya aparece en la app' : '✓ Borrador guardado · no lo ve el público')
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
        {/* UNA fecha. El texto que ve el público se escribe solo a partir de ella; antes eran dos
            campos independientes y nadie verificaba que dijeran lo mismo — en producción dos
            capacitaciones anunciaron el día de la semana equivocado durante semanas. */}
        <Field label="Fecha" required hint={textoFecha ? `Se va a mostrar: “${textoFecha}”` : undefined}>
          <Input type="date" value={f.startDate} onChange={onCambiarFecha} required />
        </Field>

        {textoPersonalizado ? (
          <Field
            label="Texto de la fecha"
            hint="Para casos como “19 y 20 de septiembre”, que no salen de una sola fecha."
          >
            <Input value={f.dateLabel} onChange={set('dateLabel')} placeholder={textoFecha} />
            {avisoFecha && <p className="mt-1.5 text-xs text-danger">{avisoFecha}</p>}
            <button
              type="button"
              onClick={volverAlTextoAutomatico}
              className="mt-2 text-xs text-accent-strong underline-offset-2 hover:underline"
            >
              Volver al texto automático
            </button>
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setTextoPersonalizado(true)}
            className="-mt-1 text-xs text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            Escribir otro texto (ej: un evento de dos días)
          </button>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Horario" hint="Opcional">
            <Input value={f.timeLabel} onChange={set('timeLabel')} placeholder="17 a 21 hs" />
          </Field>
          <Field
            label="Precio"
            hint="En pesos, sin puntos. Vacío = no se vende, se entra con inscripción."
          >
            <Input
              value={f.price}
              onChange={set('price')}
              inputMode="numeric"
              placeholder="45000"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cupo" hint="Lugares totales. Vacío = sin tope.">
            <Input value={f.capacity} onChange={set('capacity')} inputMode="numeric" placeholder="30" />
          </Field>
          <Field label="Inscriptos previos" hint="Los que ya anotaste por fuera de la app.">
            <Input value={f.seedTaken} onChange={set('seedTaken')} inputMode="numeric" placeholder="0" />
          </Field>
        </div>
        {f.price.trim() !== '' && f.socioOnly && (
          // El candado rechaza al no-socio antes de mirar el precio: con los dos puestos, la
          // venta no existe. Se avisa mientras escribe, no recién al guardar.
          <p className="text-[12px] leading-relaxed text-danger">
            Con precio cargado, «Solo Socios» impide que alguien que no es Socio pueda comprar.
            Sacá el candado, o dejá el precio vacío.
          </p>
        )}
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

        {/* Guardar y publicar son actos distintos. Quien lo tiene cerrado publica de una —mismo
            esfuerzo que antes—; quien lo va armando de a poco guarda y vuelve, sin que el público
            vea nada a medio hacer. Antes no existía la opción de no publicar. */}
        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={(e) => submit(e, { publicar: false })}
            className="sm:order-2"
          >
            {yaPublicado ? 'Guardar y despublicar' : 'Guardar borrador'}
          </Button>
          <Button type="submit" size="lg" className="sm:order-3">
            {yaPublicado ? 'Guardar cambios' : 'Publicar'}
          </Button>
        </div>
        {!yaPublicado && (
          <p className="text-right text-[11px] text-ink-soft/80">
            El borrador queda sólo para el equipo. Publicar lo pone a la vista de todos.
          </p>
        )}
      </form>
    </Sheet>
  )
}
