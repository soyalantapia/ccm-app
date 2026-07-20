import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Img, ImageUpload, Input, Select, Sheet, Textarea, toast } from '../../components/ui'
import { store } from '../../data/store'
import { newId } from '../../lib/storage'
import type { AdSlot, Sponsor, SponsorCreative } from '../../data/types'

const LEVEL_OPTIONS: { value: Sponsor['level']; label: string }[] = [
  { value: 'Principal', label: 'Principal' },
  { value: 'Oro', label: 'Oro' },
  { value: 'Plata', label: 'Plata' },
]

const SLOT_OPTIONS: { value: AdSlot; label: string }[] = [
  { value: 'S1', label: 'S1 · Bienvenida' },
  { value: 'S2', label: 'S2 · Feed nativo' },
  { value: 'S3', label: 'S3 · Pre-descarga' },
  { value: 'S4', label: 'S4 · Video' },
  { value: 'S6', label: 'S6 · Mi QR' },
]

/** Fila de creatividad con id local para keys y edición estable. */
type CreativeRow = SponsorCreative & { _key: string }

type Form = {
  name: string
  industry: string
  level: Sponsor['level']
  exclusive: boolean
  tagline: string
  banner: string
  creatives: CreativeRow[]
}

function newRow(slot: AdSlot = 'S2'): CreativeRow {
  return { _key: newId('cre'), slot, headline: '', sub: '', cta: '' }
}

const empty: Form = {
  name: '',
  industry: '',
  level: 'Oro',
  exclusive: false,
  tagline: '',
  banner: '',
  creatives: [newRow('S2')],
}

function fromSponsor(s: Sponsor): Form {
  return {
    name: s.name,
    industry: s.industry,
    level: s.level,
    exclusive: s.exclusive,
    tagline: s.tagline,
    banner: s.banner ?? '',
    creatives: s.creatives.length
      ? s.creatives.map((c) => ({
          _key: newId('cre'),
          slot: c.slot,
          headline: c.headline,
          sub: c.sub ?? '',
          cta: c.cta ?? '',
        }))
      : [newRow('S2')],
  }
}

interface Props {
  open: boolean
  /** Sponsor a editar; omitido = crear nuevo. */
  sponsor?: Sponsor
  onClose: () => void
}

/** Alta y edición de sponsors desde el admin (CRUD real sobre la capa local). */
export function OpsSponsorForm({ open, sponsor, onClose }: Props) {
  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setF(sponsor ? fromSponsor(sponsor) : empty)
      setError('')
    }
  }, [open, sponsor])

  const set = (k: 'name' | 'industry' | 'tagline' | 'banner') => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const setCreative =
    (key: string, field: keyof SponsorCreative) => (e: { target: { value: string } }) =>
      setF((prev) => ({
        ...prev,
        creatives: prev.creatives.map((c) =>
          c._key === key ? { ...c, [field]: e.target.value } : c,
        ),
      }))

  const addCreative = () =>
    setF((prev) => ({ ...prev, creatives: [...prev.creatives, newRow('S2')] }))

  const removeCreative = (key: string) =>
    setF((prev) => ({ ...prev, creatives: prev.creatives.filter((c) => c._key !== key) }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim() || !f.industry.trim() || !f.tagline.trim()) {
      setError('Completá los campos obligatorios.')
      return
    }
    if (f.creatives.some((c) => !c.headline.trim())) {
      setError('Cada creatividad necesita un titular (o eliminá la fila vacía).')
      return
    }
    const creatives: SponsorCreative[] = f.creatives
      .filter((c) => c.headline.trim())
      .map((c) => ({
        slot: c.slot,
        headline: c.headline.trim(),
        sub: c.sub?.trim() || undefined,
        cta: c.cta?.trim() || undefined,
      }))
    const data = {
      name: f.name.trim(),
      industry: f.industry.trim(),
      level: f.level,
      exclusive: f.exclusive,
      tagline: f.tagline.trim(),
      banner: f.banner.trim() || undefined,
      creatives,
    }
    if (sponsor) {
      store.updateSponsor(sponsor.id, data)
      toast('✓ Sponsor actualizado')
    } else {
      store.createSponsor(data)
      toast('✓ Sponsor creado')
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={sponsor ? 'Editar sponsor' : 'Crear sponsor'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre" required>
          <Input value={f.name} onChange={set('name')} placeholder="Ej: Vialux Eyewear" required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Rubro" required>
            <Input
              value={f.industry}
              onChange={set('industry')}
              placeholder="Óptica y eyewear"
              required
            />
          </Field>
          <Field label="Nivel" required>
            <Select
              options={LEVEL_OPTIONS}
              value={f.level}
              onChange={(e) =>
                setF((prev) => ({ ...prev, level: e.target.value as Sponsor['level'] }))
              }
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={f.exclusive}
            onChange={(e) => setF((prev) => ({ ...prev, exclusive: e.target.checked }))}
            className="size-4 rounded-sm border-line accent-accent"
          />
          Exclusividad de rubro
        </label>

        <Field label="Tagline" required hint="Una frase corta de marca">
          <Textarea
            value={f.tagline}
            onChange={set('tagline')}
            rows={2}
            placeholder="Lentes que acompañan tu mejor versión"
            required
          />
        </Field>

        <Field
          label="Banner (URL)"
          hint="Arte horizontal 3:1 para el carrusel. Opcional — sin él se muestra un lockup de marca."
        >
          <div className="flex items-center gap-2">
            <Input
              value={f.banner}
              onChange={set('banner')}
              placeholder="https://… o img/sponsors/marca.svg"
              className="flex-1"
            />
            <ImageUpload
              label="Subir"
              onUrl={(url) => setF((p) => ({ ...p, banner: url }))}
            />
          </div>
          {f.banner.trim() && (
            <div className="mt-2.5 overflow-hidden rounded-sm border border-line">
              <Img src={f.banner.trim()} alt="" ratio="3/1" className="w-full" />
            </div>
          )}
        </Field>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-[10px] text-ink-soft">Creatividades</span>
            <Button type="button" variant="ghost" size="sm" onClick={addCreative}>
              + Agregar creatividad
            </Button>
          </div>

          {f.creatives.map((c) => (
            <div key={c._key} className="space-y-3 rounded-sm border border-line bg-surface p-3.5">
              <div className="flex items-start gap-3">
                <Field label="Slot" className="flex-1">
                  <Select options={SLOT_OPTIONS} value={c.slot} onChange={setCreative(c._key, 'slot')} />
                </Field>
                <button
                  type="button"
                  onClick={() => removeCreative(c._key)}
                  aria-label="Eliminar creatividad"
                  className="mt-6 shrink-0 rounded-sm border border-line px-3 py-3 text-danger transition-colors hover:bg-danger/10"
                >
                  ✕
                </button>
              </div>
              <Field label="Titular" required>
                <Input
                  value={c.headline}
                  onChange={setCreative(c._key, 'headline')}
                  placeholder="Mirá distinto con Vialux"
                  required
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Subtítulo" hint="Opcional">
                  <Input
                    value={c.sub ?? ''}
                    onChange={setCreative(c._key, 'sub')}
                    placeholder="Colección 2026"
                  />
                </Field>
                <Field label="CTA" hint="Opcional">
                  <Input
                    value={c.cta ?? ''}
                    onChange={setCreative(c._key, 'cta')}
                    placeholder="Ver colección"
                  />
                </Field>
              </div>
            </div>
          ))}

          {f.creatives.length === 0 && (
            <p className="text-xs text-ink-soft">Sin creatividades. Agregá al menos una.</p>
          )}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="sm:order-2">
            {sponsor ? 'Guardar cambios' : 'Crear sponsor'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
