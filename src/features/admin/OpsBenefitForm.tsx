import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Input, Select, Sheet, Textarea } from '../../components/ui'
import { store } from '../../data/store'
import type { Benefit, BenefitCategory } from '../../data/types'

const CATEGORY_OPTIONS: { value: BenefitCategory; label: string }[] = [
  { value: 'hotel', label: 'Alojamiento' },
  { value: 'spa', label: 'Bienestar / Spa' },
  { value: 'gastronomia', label: 'Gastronomía' },
  { value: 'entradas', label: 'Entradas' },
  { value: 'suscripcion', label: 'Membresía' },
  { value: 'otro', label: 'Otro' },
]

type Form = {
  partner: string
  category: BenefitCategory
  title: string
  description: string
  code: string
  discountLabel: string
  url: string
  order: string
  active: string
}

const empty: Form = {
  partner: '', category: 'otro', title: '', description: '',
  code: '', discountLabel: '', url: '', order: '0', active: 'true',
}

function fromBenefit(b: Benefit): Form {
  return {
    partner: b.partner, category: b.category, title: b.title, description: b.description,
    code: b.code ?? '', discountLabel: b.discountLabel ?? '', url: b.url ?? '',
    order: String(b.order ?? 0), active: b.active ? 'true' : 'false',
  }
}

interface Props {
  open: boolean
  /** Beneficio a editar; omitido = crear nuevo. */
  benefit?: Benefit
  onClose: () => void
}

/** Alta y edición de beneficios (lo edita marketing). CRUD real sobre el backend. */
export function OpsBenefitForm({ open, benefit, onClose }: Props) {
  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setF(benefit ? fromBenefit(benefit) : empty)
      setError('')
    }
  }, [open, benefit])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.partner.trim() || !f.title.trim() || !f.description.trim()) {
      setError('Completá empresa, título y descripción.')
      return
    }
    const data = {
      partner: f.partner.trim(),
      category: f.category,
      title: f.title.trim(),
      description: f.description.trim(),
      code: f.code.trim() || undefined,
      discountLabel: f.discountLabel.trim() || undefined,
      url: f.url.trim() || undefined,
      order: Number(f.order) || 0,
      active: f.active === 'true',
    }
    if (benefit) {
      store.updateBenefit(benefit.id, data)
    } else {
      store.createBenefit(data)
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={benefit ? 'Editar beneficio' : 'Crear beneficio'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Empresa / aliado" required>
            <Input value={f.partner} onChange={set('partner')} placeholder="Hotel Quinto Centenario" required />
          </Field>
          <Field label="Categoría" required>
            <Select options={CATEGORY_OPTIONS} value={f.category} onChange={set('category')} />
          </Field>
        </div>

        <Field label="Título del beneficio" required>
          <Input value={f.title} onChange={set('title')} placeholder="25% en alojamiento" required />
        </Field>

        <Field label="Descripción" required>
          <Textarea value={f.description} onChange={set('description')} rows={3} placeholder="Cómo se usa el beneficio…" required />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Código de descuento" hint="Se muestra solo a inscriptos">
            <Input value={f.code} onChange={set('code')} placeholder="CCM2026-HOTEL" />
          </Field>
          <Field label="Etiqueta" hint="Ej: 25% OFF / 2x1">
            <Input value={f.discountLabel} onChange={set('discountLabel')} placeholder="25% OFF" />
          </Field>
        </div>

        <Field label="Link para canjear" hint="Web, formulario o wa.me/… (opcional)">
          <Input value={f.url} onChange={set('url')} placeholder="https://wa.me/549…" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Orden" hint="Menor aparece primero">
            <Input type="number" value={f.order} onChange={set('order')} />
          </Field>
          <Field label="Estado">
            <Select
              options={[{ value: 'true', label: 'Activo (visible)' }, { value: 'false', label: 'Oculto' }]}
              value={f.active}
              onChange={set('active')}
            />
          </Field>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="sm:order-2">
            {benefit ? 'Guardar cambios' : 'Crear beneficio'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
