import { useEffect, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button, Field, Img, ImageUpload, Input, Select, Sheet, Textarea, toast } from '../../components/ui'
import { store } from '../../data/store'
import { slugify } from '../../data/store/overlay'
import type { Convocatoria, ConvocatoriaField } from '../../data/types'

const TYPE_OPTIONS: { value: ConvocatoriaField['type']; label: string }[] = [
  { value: 'text', label: 'Texto corto' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'select', label: 'Selección (opciones)' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Teléfono' },
  { value: 'url', label: 'Link / URL' },
]

type FieldForm = {
  key: string
  label: string
  type: ConvocatoriaField['type']
  required: boolean
  options: string // coma-separado (solo para 'select')
  placeholder: string
  help: string
  showIf?: ConvocatoriaField['showIf'] // lógica condicional — preservada al editar (no editable en el form)
}

type LogoForm = { name: string; logoUrl: string; url: string; rubro: string }

type Form = {
  title: string
  slug: string
  intro: string
  deadline: string
  eventId: string
  ctaLabel: string
  ctaUrl: string
  fields: FieldForm[]
  logos: LogoForm[]
}

const emptyField: FieldForm = { key: '', label: '', type: 'text', required: false, options: '', placeholder: '', help: '' }
const emptyLogo: LogoForm = { name: '', logoUrl: '', url: '', rubro: '' }

interface Props {
  open: boolean
  /** Convocatoria a editar; omitida = crear nueva. */
  convocatoria?: Convocatoria
  onClose: () => void
}

export function OpsConvocatoriaForm({ open, convocatoria, onClose }: Props) {
  const events = store.getAdminEvents()
  const eventOptions = events.map((e) => ({ value: e.id, label: e.title }))

  const empty: Form = {
    title: '',
    slug: '',
    intro: '',
    deadline: '',
    eventId: events[0]?.id ?? '',
    ctaLabel: '',
    ctaUrl: '',
    fields: [{ ...emptyField }],
    logos: [],
  }

  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (convocatoria) {
      setF({
        title: convocatoria.title,
        slug: convocatoria.slug,
        intro: convocatoria.intro,
        deadline: convocatoria.deadline,
        eventId: convocatoria.eventId,
        ctaLabel: convocatoria.ctaLabel ?? '',
        ctaUrl: convocatoria.ctaUrl ?? '',
        fields: convocatoria.fields.map((ff) => ({
          key: ff.key,
          label: ff.label,
          type: ff.type,
          required: ff.required,
          options: (ff.options ?? []).join(', '),
          placeholder: ff.placeholder ?? '',
          help: ff.help ?? '',
          showIf: ff.showIf, // preservar la lógica condicional al editar
        })),
        logos: (convocatoria.logos ?? []).map((l) => ({
          name: l.name,
          logoUrl: l.logoUrl,
          url: l.url ?? '',
          rubro: l.rubro ?? '',
        })),
      })
    } else {
      setF({ ...empty, eventId: events[0]?.id ?? '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, convocatoria])

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  const setField = (i: number, patch: Partial<FieldForm>) =>
    setF((p) => ({ ...p, fields: p.fields.map((ff, idx) => (idx === i ? { ...ff, ...patch } : ff)) }))
  const addField = () => setF((p) => ({ ...p, fields: [...p.fields, { ...emptyField }] }))
  const removeField = (i: number) => setF((p) => ({ ...p, fields: p.fields.filter((_, idx) => idx !== i) }))
  const moveField = (i: number, dir: -1 | 1) =>
    setF((p) => {
      const j = i + dir
      if (j < 0 || j >= p.fields.length) return p
      const fields = [...p.fields]
      ;[fields[i], fields[j]] = [fields[j], fields[i]]
      return { ...p, fields }
    })

  const setLogo = (i: number, patch: Partial<LogoForm>) =>
    setF((p) => ({ ...p, logos: p.logos.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  const addLogo = () => setF((p) => ({ ...p, logos: [...p.logos, { ...emptyLogo }] }))
  const removeLogo = (i: number) => setF((p) => ({ ...p, logos: p.logos.filter((_, idx) => idx !== i) }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.title.trim() || !f.intro.trim() || !f.deadline.trim() || !f.eventId) {
      setError('Completá título, intro, fecha de cierre y evento.')
      return
    }
    const cleanFields = f.fields.filter((ff) => ff.label.trim())
    if (cleanFields.length === 0) {
      setError('Agregá al menos un campo con etiqueta.')
      return
    }
    // Un select sin opciones es un control cuyo dominio de valores válidos es el conjunto
    // vacío, mientras el form público exige un valor no vacío: el postulante queda trabado
    // sin poder enviar y sin entender por qué. Se corta acá, en el único lugar donde se
    // crean los campos, en vez de dejar que llegue al formulario público.
    const selectSinOpciones = cleanFields.find(
      (ff) => ff.type === 'select' && ff.options.split(',').filter((o) => o.trim()).length === 0,
    )
    if (selectSinOpciones) {
      setError(`El campo "${selectSinOpciones.label.trim()}" es una lista desplegable: cargale al menos una opción.`)
      return
    }
    const fields: ConvocatoriaField[] = cleanFields.map((ff) => ({
      key: ff.key.trim() || slugify(ff.label),
      label: ff.label.trim(),
      type: ff.type,
      required: ff.required,
      ...(ff.type === 'select' && ff.options.trim()
        ? { options: ff.options.split(',').map((s) => s.trim()).filter(Boolean) }
        : {}),
      ...(ff.placeholder.trim() ? { placeholder: ff.placeholder.trim() } : {}),
      ...(ff.help.trim() ? { help: ff.help.trim() } : {}),
      ...(ff.showIf ? { showIf: ff.showIf } : {}),
    }))
    const logos = f.logos
      .filter((l) => l.name.trim() && l.logoUrl.trim())
      .map((l) => ({
        name: l.name.trim(),
        logoUrl: l.logoUrl.trim(),
        ...(l.url.trim() ? { url: l.url.trim() } : {}),
        ...(l.rubro.trim() ? { rubro: l.rubro.trim() } : {}),
      }))
    const data = {
      title: f.title.trim(),
      intro: f.intro.trim(),
      deadline: f.deadline.trim(),
      eventId: f.eventId,
      ctaLabel: f.ctaLabel.trim() || undefined,
      ctaUrl: f.ctaUrl.trim() || undefined,
      fields,
      logos,
      ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
    }
    if (convocatoria) {
      store.updateConvocatoria(convocatoria.id, data)
      toast('✓ Convocatoria actualizada')
    } else {
      store.createConvocatoria(data)
      toast('✓ Convocatoria creada · disponible en /c/:slug')
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={convocatoria ? 'Editar convocatoria' : 'Crear convocatoria'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Título" required>
          <Input value={f.title} onChange={set('title')} placeholder="Ej: Convocatoria Siglo 21" required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Evento" required>
            <Select options={eventOptions} value={f.eventId} onChange={set('eventId')} />
          </Field>
          <Field label="Cierre" required hint="Fecha límite (AAAA-MM-DD)">
            <Input type="date" value={f.deadline} onChange={set('deadline')} required />
          </Field>
        </div>
        <Field label="Slug" hint="Opcional — la URL /c/&lt;slug&gt;. Si lo dejás vacío, se genera del título.">
          <Input value={f.slug} onChange={set('slug')} placeholder="convocatoria-siglo-21" />
        </Field>
        <Field label="Intro" required hint="Aparece arriba del formulario">
          <Textarea value={f.intro} onChange={set('intro')} rows={3} placeholder="Contales de qué se trata y qué buscás…" required />
        </Field>

        <div className="rounded-md border border-line bg-surface p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow text-[10px] text-ink-soft">Campos del formulario · {f.fields.length}</p>
            <Button type="button" variant="ghost" size="sm" onClick={addField}>
              <Plus size={13} /> Agregar campo
            </Button>
          </div>

          <div className="space-y-3">
            {f.fields.map((ff, i) => (
              <div key={i} className="rounded-sm border border-line bg-bg p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="eyebrow text-[10px] text-ink-soft">Campo {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveField(i, -1)} aria-label="Subir" disabled={i === 0}
                      className="rounded-sm p-1 text-ink-soft hover:bg-ink/5 disabled:opacity-30">
                      <ChevronUp size={14} />
                    </button>
                    <button type="button" onClick={() => moveField(i, 1)} aria-label="Bajar" disabled={i === f.fields.length - 1}
                      className="rounded-sm p-1 text-ink-soft hover:bg-ink/5 disabled:opacity-30">
                      <ChevronDown size={14} />
                    </button>
                    <button type="button" onClick={() => removeField(i)} aria-label="Quitar campo"
                      className="rounded-sm p-1 text-ink-soft hover:bg-danger/10 hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input value={ff.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Etiqueta (ej: Tu historia)" />
                  <Select
                    options={TYPE_OPTIONS}
                    value={ff.type}
                    onChange={(e) => setField(i, { type: e.target.value as ConvocatoriaField['type'] })}
                  />
                </div>
                {ff.type === 'select' && (
                  <Input
                    className="mt-2"
                    value={ff.options}
                    onChange={(e) => setField(i, { options: e.target.value })}
                    placeholder="Opciones separadas por coma: Sí, No, Tal vez"
                  />
                )}
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input value={ff.placeholder} onChange={(e) => setField(i, { placeholder: e.target.value })} placeholder="Placeholder (opcional)" />
                  <Input value={ff.help} onChange={(e) => setField(i, { help: e.target.value })} placeholder="Ayuda (opcional)" />
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ff.required}
                    onChange={(e) => setField(i, { required: e.target.checked })}
                    className="size-4 accent-accent"
                  />
                  <span className="text-[13px] text-ink">Obligatorio</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* CTA opcional */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Botón CTA · texto" hint="Opcional (ej. Sumá tu universidad)">
            <Input value={f.ctaLabel} onChange={set('ctaLabel')} placeholder="Sumá tu universidad" />
          </Field>
          <Field label="Botón CTA · destino" hint="Opcional — link o wa.me/…">
            <Input value={f.ctaUrl} onChange={set('ctaUrl')} placeholder="https://…" />
          </Field>
        </div>

        {/* Logos por rubro */}
        <div className="rounded-md border border-line bg-surface p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow text-[10px] text-ink-soft">Logos (universidades / sponsors) · {f.logos.length}</p>
            <Button type="button" variant="ghost" size="sm" onClick={addLogo}>
              <Plus size={13} /> Agregar logo
            </Button>
          </div>
          {f.logos.length === 0 ? (
            <p className="text-[13px] text-ink-soft">Sin logos. Agregá universidades o sponsors y agrupalos por rubro.</p>
          ) : (
            <div className="space-y-2.5">
              {f.logos.map((l, i) => (
                <div key={i} className="rounded-sm border border-line bg-bg p-2.5">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input value={l.name} onChange={(e) => setLogo(i, { name: e.target.value })} placeholder="Nombre (ej: Siglo 21)" />
                    <Input value={l.rubro} onChange={(e) => setLogo(i, { rubro: e.target.value })} placeholder="Rubro (ej: Universidades)" />
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      {l.logoUrl.trim() && (
                        <div className="size-10 shrink-0 overflow-hidden rounded-sm border border-line bg-surface">
                          <Img src={l.logoUrl.trim()} alt="" ratio="1/1" className="w-full" imgClassName="object-contain" />
                        </div>
                      )}
                      <Input value={l.logoUrl} onChange={(e) => setLogo(i, { logoUrl: e.target.value })} placeholder="URL del logo: https://…/logo.png" className="flex-1" />
                      <ImageUpload
                        label=""
                        onUrl={(url) => setLogo(i, { logoUrl: url })}
                        className="px-2"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input value={l.url} onChange={(e) => setLogo(i, { url: e.target.value })} placeholder="Link (opcional)" className="flex-1" />
                      <button type="button" onClick={() => removeLogo(i)} aria-label="Quitar logo"
                        className="rounded-sm p-1.5 text-ink-soft hover:bg-danger/10 hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="sm:order-2">
            {convocatoria ? 'Guardar cambios' : 'Crear convocatoria'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
