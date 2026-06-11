import { useMemo, useState, type FormEvent } from 'react'
import { Sparkles } from 'lucide-react'
import type { Application, Convocatoria, ConvocatoriaField } from '../../data/types'
import { Button, Card, Field, Input, Select, Textarea, toast } from '../../components/ui'
import { store } from '../../data/store'
import { buildPrefill, isFieldVisible } from './format'

const EMAIL_RE = /^\S+@\S+\.\S+$/

interface ConvocatoriaFormProps {
  convocatoria: Convocatoria
  onSubmitted: (application: Application) => void
}

/** Form dinámico renderizado desde `convocatoria.fields` (PRD §10.3). */
export function ConvocatoriaForm({ convocatoria, onSubmitted }: ConvocatoriaFormProps) {
  const prefill = useMemo(() => buildPrefill(convocatoria, store.getProfile()), [convocatoria])
  const [values, setValues] = useState<Record<string, string>>(prefill)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const wasPrefilled = Object.keys(prefill).length > 0

  function setValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const visibleFields = convocatoria.fields.filter((f) => isFieldVisible(f, values))

    const nextErrors: Record<string, string> = {}
    for (const field of visibleFields) {
      const value = (values[field.key] ?? '').trim()
      if (field.required && !value) nextErrors[field.key] = 'Completá este campo'
      else if (value && field.type === 'email' && !EMAIL_RE.test(value))
        nextErrors[field.key] = 'Revisá el formato del email'
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      toast('Revisá los campos marcados', 'info')
      return
    }

    // Solo los campos visibles viajan en la postulación (un showIf oculto no aplica).
    const data: Record<string, string> = {}
    for (const field of visibleFields) {
      const value = (values[field.key] ?? '').trim()
      if (value) data[field.key] = value
    }

    const application = store.submitApplication(convocatoria.id, data)
    store.saveProfileFields(
      { email: data.email, phone: data.telefono, dni: data.dni, instagram: data.instagram },
      'postulacion_camino',
    )
    onSubmitted(application)
  }

  function renderControl(field: ConvocatoriaField) {
    const common = {
      value: values[field.key] ?? '',
      placeholder: field.placeholder,
      'aria-invalid': errors[field.key] ? true : undefined,
    }
    if (field.type === 'textarea') {
      return (
        <Textarea
          rows={field.key === 'historia' ? 6 : 4}
          {...common}
          onChange={(e) => setValue(field.key, e.target.value)}
        />
      )
    }
    if (field.type === 'select') {
      return (
        <Select
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          {...common}
          placeholder="Elegí una opción"
          className={values[field.key] ? '' : 'text-ink-soft/50'}
          onChange={(e) => setValue(field.key, e.target.value)}
        />
      )
    }
    return <Input type={field.type} {...common} onChange={(e) => setValue(field.key, e.target.value)} />
  }

  return (
    <Card className="p-6 md:p-10">
      {wasPrefilled && (
        <p className="mb-7 flex items-start gap-2.5 border-b border-line pb-6 text-sm leading-relaxed text-ink-soft">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          Completamos los datos que ya nos diste. Revisalos antes de enviar: no te los volvemos a
          pedir.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-7">
        {convocatoria.fields.map((field) => {
          const visible = isFieldVisible(field, values)
          if (!visible) return null
          return (
            <div key={field.key} className={field.showIf ? 'animate-rise' : undefined}>
              <Field
                label={field.label}
                required={field.required}
                hint={field.help}
                error={errors[field.key]}
              >
                {renderControl(field)}
              </Field>
            </div>
          )
        })}

        <div className="border-t border-line pt-7">
          <Button type="submit" size="lg" className="w-full">
            Enviar postulación
          </Button>
          <p className="eyebrow mt-4 text-center text-[10px] text-ink-soft/70">
            Al enviar quedás preinscripta/o · Máximo 1 acompañante
          </p>
        </div>
      </form>
    </Card>
  )
}
