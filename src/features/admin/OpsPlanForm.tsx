import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Input, Select, Sheet, Textarea, toast } from '../../components/ui'
import { store } from '../../data/store'

/**
 * Alta de un tipo de entrada dentro de un evento.
 *
 * Hasta acá los 5 tipos venían del seed y sólo se les podía editar precio y link: un evento
 * nuevo no podía vender absolutamente nada. Este formulario es lo que habilita "sábado, sábado
 * a la noche, combo, domingo, sunset — pero de cada evento".
 *
 * El id lo genera el server a partir del nombre, así que acá no se pide: "Sábado · Night VIP"
 * queda como `sabado-night-vip-a1b2c3`, que se lee cuando hay que conciliar una venta a mano.
 */

const KIND_OPTIONS = [
  { value: 'vip', label: 'VIP (se cobra)' },
  { value: 'general', label: 'General (entrada de acceso)' },
]

/** El día sólo aplica a eventos de varias jornadas. Vacío es lo normal. */
const DAY_OPTIONS = [
  { value: '', label: 'No aplica' },
  { value: 'sabado', label: 'Sábado' },
  { value: 'domingo', label: 'Domingo' },
  { value: 'combo', label: 'Los dos días (combo)' },
]

type Form = {
  name: string
  tagline: string
  price: string
  serviceCharge: string
  kind: string
  day: string
  perks: string
}

const empty: Form = {
  name: '',
  tagline: '',
  price: '',
  serviceCharge: '',
  kind: 'vip',
  day: '',
  perks: '',
}

interface Props {
  open: boolean
  eventId: string
  onClose: () => void
}

export function OpsPlanForm({ open, eventId, onClose }: Props) {
  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setF(empty)
    setError('')
  }, [open])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const name = f.name.trim()
    if (!name) {
      setError('Poné un nombre: es lo que ve el comprador al elegir.')
      return
    }
    // Sólo dígitos, igual que el precio del evento. "45.000" —como se escribe acá— Number() lo
    // lee como 45, y la entrada quedaría a cuarenta y cinco pesos.
    const numero = (raw: string, campo: string): number | null | 'error' => {
      const t = raw.trim()
      if (t === '') return null
      if (!/^\d+$/.test(t)) {
        setError(`Escribí el ${campo} sólo con números, sin puntos ni comas: 45000.`)
        return 'error'
      }
      return Number(t)
    }
    const price = numero(f.price, 'precio')
    if (price === 'error') return
    const serviceCharge = numero(f.serviceCharge, 'cargo por servicio')
    if (serviceCharge === 'error') return

    store.createPlan(eventId, {
      name,
      tagline: f.tagline.trim(),
      price,
      serviceCharge: serviceCharge ?? 0,
      mpLink: null,
      perks: f.perks
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
      kind: f.kind as 'general' | 'vip',
      ...(f.day ? { day: f.day as 'sabado' | 'domingo' | 'combo' } : {}),
    })
    toast('✓ Tipo de entrada creado')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nuevo tipo de entrada">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre" hint="Lo que ve el comprador al elegir." required>
          <Input value={f.name} onChange={set('name')} placeholder="Ej: Sábado · Night VIP" required />
        </Field>
        <Field label="Bajada" hint="Una línea corta que explique qué incluye.">
          <Input value={f.tagline} onChange={set('tagline')} placeholder="Desfile de las Estrellas · 19 a 21 hs" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Precio" hint="Sin puntos. Vacío = a confirmar, no se vende todavía.">
            <Input value={f.price} onChange={set('price')} inputMode="numeric" placeholder="30000" />
          </Field>
          <Field label="Cargo por servicio" hint="Se suma al precio. Vacío = 0.">
            <Input
              value={f.serviceCharge}
              onChange={set('serviceCharge')}
              inputMode="numeric"
              placeholder="3000"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <Select options={KIND_OPTIONS} value={f.kind} onChange={set('kind')} />
          </Field>
          <Field label="Día" hint="Sólo si el evento dura más de una jornada.">
            <Select options={DAY_OPTIONS} value={f.day} onChange={set('day')} />
          </Field>
        </div>
        <Field label="Qué incluye" hint="Una ventaja por línea.">
          <Textarea
            value={f.perks}
            onChange={set('perks')}
            rows={4}
            placeholder={'Acceso a la zona VIP\nCopa de bienvenida'}
          />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        <p className="text-[11px] leading-relaxed text-ink-soft">
          El link de pago se carga después, desde la tarjeta de esta entrada. Sin link, el
          comprador no puede pagar.
        </p>
        <Button type="submit" className="w-full justify-center">
          Crear tipo de entrada
        </Button>
      </form>
    </Sheet>
  )
}
