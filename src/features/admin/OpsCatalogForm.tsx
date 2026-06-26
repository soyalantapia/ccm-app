import { useEffect, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { Button, Field, Img, Input, Select, Sheet, Textarea, toast } from '../../components/ui'
import { store } from '../../data/store'
import { newId } from '../../lib/storage'
import type { CatalogProfile, PortfolioPiece } from '../../data/types'

/** Plataformas del ecosistema CCM (PRD §6.4). */
const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'Moda', label: 'Moda' },
  { value: 'Belleza', label: 'Belleza' },
  { value: 'Arte', label: 'Arte' },
  { value: 'Turismo', label: 'Turismo' },
  { value: 'Gastronomía', label: 'Gastronomía' },
  { value: 'Tecnología', label: 'Tecnología' },
  { value: 'Sustentabilidad', label: 'Sustentabilidad' },
]

/** Pool de retratos disponibles en public/img/people (rutas que resuelve asset()). */
const PHOTO_OPTIONS: { value: string; label: string }[] = Array.from({ length: 10 }, (_, i) => ({
  value: `img/people/p${String(i + 1).padStart(2, '0')}.jpg`,
  label: `Retrato ${i + 1}`,
}))

/** Pool de obras disponibles en public/img/gallery para armar el portfolio. */
const PORTFOLIO_POOL: string[] = Array.from(
  { length: 20 },
  (_, i) => `img/gallery/g${String(i + 1).padStart(2, '0')}.jpg`,
)

/** Pieza del portfolio en edición: imagen + título + precio (string para el input). */
type PieceForm = { image: string; title: string; price: string }

type Form = {
  name: string
  role: string
  platform: string
  city: string
  bio: string
  photo: string
  instagram: string
  whatsapp: string
  verified: boolean
  participatesIn: string
  portfolio: PieceForm[]
}

const empty: Form = {
  name: '',
  role: '',
  platform: PLATFORM_OPTIONS[0].value,
  city: '',
  bio: '',
  photo: PHOTO_OPTIONS[0].value,
  instagram: '',
  whatsapp: '',
  verified: false,
  participatesIn: 'CCM 2026',
  portfolio: [],
}

function fromProfile(p: CatalogProfile): Form {
  return {
    name: p.name,
    role: p.role,
    platform: p.platform,
    city: p.city,
    bio: p.bio,
    photo: p.photo,
    instagram: p.instagram ?? '',
    whatsapp: p.whatsapp ?? '',
    verified: p.verified,
    participatesIn: p.participatesIn.join(', '),
    portfolio: p.portfolio.map((pf) => ({ image: pf.image, title: pf.title, price: pf.price != null ? String(pf.price) : '' })),
  }
}

interface Props {
  open: boolean
  /** Expositor a editar; omitido = crear nuevo. */
  profile?: CatalogProfile
  onClose: () => void
}

/** Alta y edición de expositores del Catálogo desde el admin (CRUD real sobre la capa local). */
export function OpsCatalogForm({ open, profile, onClose }: Props) {
  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setF(profile ? fromProfile(profile) : empty)
      setError('')
    }
  }, [open, profile])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const togglePortfolio = (image: string) =>
    setF((prev) => ({
      ...prev,
      portfolio: prev.portfolio.some((p) => p.image === image)
        ? prev.portfolio.filter((p) => p.image !== image)
        : [...prev.portfolio, { image, title: '', price: '' }],
    }))

  const setPiece = (image: string, key: 'title' | 'price') => (e: { target: { value: string } }) =>
    setF((prev) => ({
      ...prev,
      portfolio: prev.portfolio.map((p) => (p.image === image ? { ...p, [key]: e.target.value } : p)),
    }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim() || !f.role.trim() || !f.platform || !f.city.trim() || !f.bio.trim() || !f.photo) {
      setError('Completá los campos obligatorios.')
      return
    }
    const participatesIn = f.participatesIn
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const portfolio: PortfolioPiece[] = f.portfolio.map((p, i) => ({
      id: newId('pf'),
      image: p.image,
      title: p.title.trim() || `Obra ${i + 1}`,
      price: p.price.trim() ? Number(p.price) : undefined,
    }))
    const data = {
      name: f.name.trim(),
      role: f.role.trim(),
      platform: f.platform,
      city: f.city.trim(),
      bio: f.bio.trim(),
      photo: f.photo,
      instagram: f.instagram.trim() || undefined,
      whatsapp: f.whatsapp.trim() || undefined,
      verified: f.verified,
      participatesIn,
      portfolio,
    }
    if (profile) {
      store.updateCatalogProfile(profile.id, data)
      toast('✓ Expositor actualizado')
    } else {
      store.createCatalogProfile(data)
      toast('✓ Expositor creado · ya aparece en el Catálogo')
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={profile ? 'Editar expositor' : 'Crear expositor'}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre" required>
          <Input value={f.name} onChange={set('name')} placeholder="Ej: Valentina Roldán" required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Rol" required>
            <Input value={f.role} onChange={set('role')} placeholder="Ej: Diseñadora" required />
          </Field>
          <Field label="Plataforma" required>
            <Select options={PLATFORM_OPTIONS} value={f.platform} onChange={set('platform')} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ciudad" required>
            <Input value={f.city} onChange={set('city')} placeholder="Ej: Córdoba" required />
          </Field>
          <Field label="Instagram" hint="Opcional">
            <Input value={f.instagram} onChange={set('instagram')} placeholder="@usuario" />
          </Field>
        </div>
        <Field label="WhatsApp / contacto" hint="Opcional — wa.me/… o número, para el botón Contactar">
          <Input value={f.whatsapp} onChange={set('whatsapp')} placeholder="https://wa.me/549…" />
        </Field>
        <Field label="Bio" required>
          <Textarea
            value={f.bio}
            onChange={set('bio')}
            rows={4}
            placeholder="Quién es, qué hace y por qué participa en CCM…"
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Retrato" required>
            <Select options={PHOTO_OPTIONS} value={f.photo} onChange={set('photo')} />
          </Field>
          {f.photo && (
            <Img
              src={f.photo}
              alt="Vista previa del retrato"
              ratio="1/1"
              className="max-w-[8rem] rounded-sm border border-line"
            />
          )}
        </div>

        <Field label="Participa en" hint="Separá con comas. Ej: CCM 2026, Camino a CCM · Junio">
          <Input
            value={f.participatesIn}
            onChange={set('participatesIn')}
            placeholder="CCM 2026"
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={f.verified}
            onChange={(e) => setF((prev) => ({ ...prev, verified: e.target.checked }))}
            className="size-4 accent-accent"
          />
          <span className="text-[15px] text-ink">Perfil verificado</span>
        </label>

        <Field
          label={`Portfolio · ${f.portfolio.length} obras elegidas`}
          hint="Opcional — elegí las obras que se muestran en su ficha."
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {PORTFOLIO_POOL.map((image, i) => {
              const on = f.portfolio.some((p) => p.image === image)
              return (
                <button
                  key={image}
                  type="button"
                  onClick={() => togglePortfolio(image)}
                  aria-pressed={on}
                  className={`relative overflow-hidden rounded-sm transition ${
                    on ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'ring-1 ring-line'
                  }`}
                >
                  <Img src={image} alt={`Obra ${i + 1}`} ratio="1/1" />
                  {on && (
                    <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-accent text-accent-ink">
                      <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Field>

        {f.portfolio.length > 0 && (
          <div className="space-y-2.5 rounded-md border border-line bg-surface p-3">
            <p className="eyebrow text-[10px] text-ink-soft">Título y precio por obra (el precio es opcional)</p>
            {f.portfolio.map((p) => (
              <div key={p.image} className="flex items-center gap-2.5">
                <Img src={p.image} alt="" ratio="1/1" className="w-12 shrink-0 rounded-sm" />
                <Input
                  value={p.title}
                  onChange={setPiece(p.image, 'title')}
                  placeholder="Título de la obra"
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={p.price}
                  onChange={setPiece(p.image, 'price')}
                  placeholder="Precio $"
                  className="w-28 shrink-0"
                />
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" className="sm:order-2">
            {profile ? 'Guardar cambios' : 'Crear expositor'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
