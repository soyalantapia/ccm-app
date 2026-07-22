import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Input, InputConSugerencias, Sheet, Textarea, toast } from '../../components/ui'
import { store } from '../../data/store'
import type { EventBlock } from '../../data/types'

/**
 * Sugerencias de tipo de actividad, NO una lista cerrada. La columna `kind` siempre fue texto
 * libre en la base; el que la encerraba era este formulario. La prueba está en producción: hay
 * un bloque con tipo "Art Show" que este selector nunca ofreció y que, con un Select, el
 * organizador no podía volver a cargar. Ahora se escribe lo que sea y esto sólo ahorra tipeo.
 */
const KIND_SUGERENCIAS = [
  'Charla',
  'Masterclass',
  'Desfile',
  'Workshop',
  'Networking',
  'Panel',
  'Art Show',
  'Cata',
  'Ronda de negocios',
  'Mentoría',
]

type Form = {
  title: string
  kind: string
  day: string
  start: string
  end: string
  room: string
  capacity: string
  seedTaken: string
  speakers: string
  description: string
}

const empty: Form = {
  title: '',
  kind: 'Charla',
  day: '',
  start: '',
  end: '',
  room: '',
  capacity: '40',
  seedTaken: '0',
  speakers: '',
  description: '',
}

function fromBlock(b: EventBlock): Form {
  return {
    title: b.title,
    kind: b.kind,
    day: b.day,
    start: b.start,
    end: b.end,
    room: b.room,
    capacity: String(b.capacity),
    seedTaken: String(b.seedTaken),
    speakers: b.speakers.join(', '),
    description: b.description ?? '',
  }
}

interface Props {
  open: boolean
  eventId: string
  /** Bloque a editar; omitido = crear nuevo. */
  block?: EventBlock
  onClose: () => void
}

/** Alta y edición de bloques (charlas/desfiles) de un evento desde el admin. */
export function OpsBlockForm({ open, eventId, block, onClose }: Props) {
  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setF(block ? fromBlock(block) : empty)
      setError('')
    }
  }, [open, block])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.title.trim() || !f.day.trim() || !f.start.trim()) {
      setError('Título, día y horario de inicio son obligatorios.')
      return
    }
    const capacity = Math.max(1, parseInt(f.capacity, 10) || 1)
    const seedTaken = Math.min(capacity, Math.max(0, parseInt(f.seedTaken, 10) || 0))
    const data = {
      eventId,
      title: f.title.trim(),
      kind: f.kind,
      day: f.day.trim(),
      start: f.start.trim(),
      end: f.end.trim() || f.start.trim(),
      room: f.room.trim() || 'A confirmar',
      capacity,
      seedTaken,
      speakers: f.speakers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      description: f.description.trim() || undefined,
    }
    if (block) {
      store.updateBlock(block.id, data)
      toast('✓ Bloque actualizado')
    } else {
      store.createBlock(data)
      toast('✓ Bloque agregado')
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={block ? 'Editar bloque' : 'Agregar bloque'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Título" required>
          <Input value={f.title} onChange={set('title')} placeholder="Ej: Masterclass de pasarela" required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" hint="Escribí lo que sea; las de abajo son sugerencias." required>
            <InputConSugerencias
              listId="block-kind-sugerencias"
              sugerencias={KIND_SUGERENCIAS}
              value={f.kind}
              onChange={set('kind')}
              placeholder="Workshop"
              required
            />
          </Field>
          <Field label="Sala">
            <Input value={f.room} onChange={set('room')} placeholder="Salón principal" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Día" required>
            <Input value={f.day} onChange={set('day')} placeholder="18/06" required />
          </Field>
          <Field label="Inicio" required>
            <Input value={f.start} onChange={set('start')} placeholder="17:00" required />
          </Field>
          <Field label="Fin">
            <Input value={f.end} onChange={set('end')} placeholder="18:00" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cupo" required>
            <Input type="number" min={1} value={f.capacity} onChange={set('capacity')} />
          </Field>
          <Field label="Inscriptos previos" hint="Para mostrar ocupación realista">
            <Input type="number" min={0} value={f.seedTaken} onChange={set('seedTaken')} />
          </Field>
        </div>
        <Field label="Speakers" hint="Separados por coma">
          <Input value={f.speakers} onChange={set('speakers')} placeholder="Néstor Moio, Invitada especial" />
        </Field>
        <Field label="Descripción" hint="Opcional">
          <Textarea value={f.description} onChange={set('description')} rows={3} />
        </Field>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="sm:order-2">
            {block ? 'Guardar cambios' : 'Agregar bloque'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
