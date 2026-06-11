import { useState, type FormEvent } from 'react'
import { Button, Field, Input, Select, Textarea, toast } from '../../components/ui'
import { store } from '../../data/store'

const INDUSTRY_OPTIONS = [
  'Banca y finanzas',
  'Cosmética y skincare',
  'Bodegas y bebidas',
  'Moda y retail',
  'Turismo y hotelería',
  'Gastronomía',
  'Tecnología',
  'Automotriz',
  'Otro rubro',
].map((value) => ({ value, label: value }))

interface FormValues {
  name: string
  company: string
  industry: string
  email: string
  message: string
}

const EMPTY: FormValues = { name: '', company: '', industry: '', email: '', message: '' }

/**
 * Contacto comercial B2B (PRD §6.9): captura el lead con `sponsor_lead`
 * y responde con un estado de éxito editorial, sin sacar a nadie de la app.
 */
export function SponsorForm() {
  const [values, setValues] = useState<FormValues>(EMPTY)
  const [sent, setSent] = useState(false)

  function set<K extends keyof FormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!values.name.trim() || !values.company.trim() || !values.industry || !values.email.trim()) {
      return
    }
    store.track('sponsor_lead', { empresa: values.company.trim(), rubro: values.industry })
    setSent(true)
    toast('Recibimos tu consulta. Te contactamos en 48 hs.')
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start border-t border-line pt-10 animate-rise">
        <span aria-hidden className="mb-6 inline-block h-px w-10 bg-accent" />
        <p className="type-serif text-2xl text-ink md:text-3xl">
          Gracias — el equipo comercial te contacta en{' '}
          <em className="italic text-accent">48 hs</em>.
        </p>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-soft">
          Tomamos nota de {values.company.trim()} para el rubro {values.industry.toLowerCase()}.
          Si la categoría sigue libre, la propuesta llega con la exclusividad incluida.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-2">
      <Field label="Nombre y apellido" required>
        <Input
          name="name"
          autoComplete="name"
          placeholder="¿Quién nos escribe?"
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>
      <Field label="Empresa" required>
        <Input
          name="company"
          autoComplete="organization"
          placeholder="Tu marca"
          required
          value={values.company}
          onChange={(e) => set('company', e.target.value)}
        />
      </Field>
      <Field label="Rubro" required hint="La exclusividad se reserva por orden de llegada.">
        <Select
          name="industry"
          required
          options={INDUSTRY_OPTIONS}
          placeholder="Elegí tu categoría"
          value={values.industry}
          onChange={(e) => set('industry', e.target.value)}
        />
      </Field>
      <Field label="Email" required>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="nombre@empresa.com"
          required
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </Field>
      <Field label="Mensaje" className="md:col-span-2">
        <Textarea
          name="message"
          rows={4}
          placeholder="Contanos qué querés lograr en CCM 2026: stand, activación, charla, experiencia de marca…"
          value={values.message}
          onChange={(e) => set('message', e.target.value)}
        />
      </Field>
      <div className="flex flex-col items-start gap-4 md:col-span-2 md:flex-row md:items-center md:justify-between">
        <Button type="submit" size="lg">
          Enviar consulta
        </Button>
        <p className="text-[13px] text-ink-soft/80">
          Sin spam: te responde directo el equipo comercial de CCM.
        </p>
      </div>
    </form>
  )
}
