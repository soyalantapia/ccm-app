import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Input, Select, Sheet, ImageUpload } from '../../components/ui'
import { store } from '../../data/store'
import type { Banner, BannerDestination } from '../../data/types'

const SLOT_OPTIONS = [
  { value: 'home', label: 'Home / App' },
  { value: 'eventos', label: 'Eventos' },
  { value: 'catalogo', label: 'Catálogo / Expositores' },
  { value: 'fotos', label: 'Fotos' },
  { value: 'contenido', label: 'Contenido' },
]
// Destinos de banner: solo link o formulario (feedback Gastón — el WhatsApp va en las
// fichas de artista/expositor, no en los banners publicitarios). El enum del dominio
// conserva 'whatsapp' por compatibilidad con datos viejos; acá no se ofrece.
const DEST_OPTIONS: { value: BannerDestination; label: string }[] = [
  { value: 'link', label: 'Link / sitio web' },
  { value: 'form', label: 'Formulario' },
]

type Form = {
  slot: string
  brand: string
  image: string
  alt: string
  destinationType: BannerDestination
  destinationUrl: string
  fixed: string
  order: string
  active: string
}

const empty: Form = {
  slot: 'home', brand: '', image: '', alt: '', destinationType: 'link',
  destinationUrl: '', fixed: 'false', order: '0', active: 'true',
}

function fromBanner(b: Banner): Form {
  return {
    slot: b.slot, brand: b.brand, image: b.image, alt: b.alt ?? '',
    destinationType: b.destinationType, destinationUrl: b.destinationUrl,
    fixed: b.fixed ? 'true' : 'false', order: String(b.order ?? 0), active: b.active ? 'true' : 'false',
  }
}

interface Props {
  open: boolean
  banner?: Banner
  onClose: () => void
}

/** Alta y edición de banners gestionados (lo carga marketing). */
export function OpsBannerForm({ open, banner, onClose }: Props) {
  const [f, setF] = useState<Form>(empty)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setF(banner ? fromBanner(banner) : empty)
      setError('')
    }
  }, [open, banner])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.brand.trim() || !f.image.trim() || !f.destinationUrl.trim()) {
      setError('Completá anunciante, imagen y destino.')
      return
    }
    const data = {
      slot: f.slot,
      brand: f.brand.trim(),
      image: f.image.trim(),
      alt: f.alt.trim() || undefined,
      destinationType: f.destinationType,
      destinationUrl: f.destinationUrl.trim(),
      fixed: f.fixed === 'true',
      order: Number(f.order) || 0,
      active: f.active === 'true',
    }
    if (banner) store.updateBanner(banner.id, data)
    else store.createBanner(data)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={banner ? 'Editar banner' : 'Crear banner'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Anunciante" required>
            <Input value={f.brand} onChange={set('brand')} placeholder="Banco Distrito" required />
          </Field>
          <Field label="Ubicación (slot)" required>
            <Select options={SLOT_OPTIONS} value={f.slot} onChange={set('slot')} />
          </Field>
        </div>

        <Field label="Imagen (URL)" required hint="Subila desde tu compu o pegá la URL, ya en el formato del slot">
          <div className="flex items-center gap-2">
            <Input value={f.image} onChange={set('image')} placeholder="https://…/banner.jpg" className="flex-1" required />
            <ImageUpload label="Subir" onUrl={(url) => setF((p) => ({ ...p, image: url }))} />
          </div>
        </Field>
        {f.image.trim() && (
          <img src={f.image.trim()} alt="Vista previa" className="aspect-[16/5] w-full rounded-sm border border-line object-cover" />
        )}

        <Field label="Texto alternativo" hint="Accesibilidad (opcional)">
          <Input value={f.alt} onChange={set('alt')} placeholder="Banco Distrito en CCM 2026" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo de destino" required>
            <Select options={DEST_OPTIONS} value={f.destinationType} onChange={set('destinationType')} />
          </Field>
          <Field label="Destino (link)" required hint="https://… · link al sitio o al formulario">
            <Input value={f.destinationUrl} onChange={set('destinationUrl')} placeholder="https://…" required />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Posición">
            <Select
              options={[{ value: 'true', label: 'Fijo (siempre)' }, { value: 'false', label: 'Rota' }]}
              value={f.fixed}
              onChange={set('fixed')}
            />
          </Field>
          <Field label="Orden">
            <Input type="number" value={f.order} onChange={set('order')} />
          </Field>
          <Field label="Estado">
            <Select
              options={[{ value: 'true', label: 'Activo' }, { value: 'false', label: 'Oculto' }]}
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
            {banner ? 'Guardar cambios' : 'Crear banner'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
