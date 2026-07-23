import { useEffect, useState, type FormEvent } from 'react'
import { Check, X } from 'lucide-react'
import { Button, Field, Img, Input, Select, Sheet, Textarea, toast, ImageUpload } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { newId } from '../../lib/storage'
import type { CatalogProfile, PortfolioPiece, SpeakerAppearanceInput } from '../../data/types'

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

/** Precio saneado: entero no negativo y acotado; cualquier otra cosa se descarta. */
function precioValido(raw: string): number | undefined {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return undefined
  return Math.round(n)
}

/**
 * Pieza del portfolio en edición: imagen + título + precio (string para el input).
 * Lleva también `id` y `caption` aunque el form no los edite: si no viajan de ida y vuelta,
 * el guardado los borra. En prod hay 50 obras con epígrafe escrito a mano que se veían en la
 * ficha pública y desaparecían al tocar "Guardar cambios".
 */
type PieceForm = { id?: string; image: string; title: string; caption?: string; price: string }

type Kind = 'participante' | 'expositor' | 'speaker'
/** Cupo de imágenes de portfolio por tipo (feedback Gastón: participante 4, expositor 2). */
const IMG_CAP: Record<Kind, number> = { participante: 4, expositor: 2, speaker: 4 }

/**
 * Quién puede cargar en qué eventos habla: un speaker puro y un expositor que además da una
 * charla (caso explícito de la reunión con Mica). Un participante no da charlas.
 * Gobierna dos cosas a la vez, y por eso es un solo predicado: (1) si se muestra el bloque
 * "¿En qué eventos habla?", (2) si el submit manda las apariciones o manda `[]`. Mandar SIEMPRE
 * la clave `speakerAppearances` (con `[]` cuando no es orador) es lo que hace que reclasificar
 * un speaker/expositor a participante borre sus filas EventSpeaker; si la omitiéramos, el
 * backend lo leería como "no tocar" y quedarían huérfanas saliendo en /speakers.
 */
export const esOrador = (kind: Kind): boolean => kind === 'speaker' || kind === 'expositor'

type Form = {
  name: string
  role: string
  kind: Kind
  platform: string
  city: string
  bio: string
  projects: string
  photo: string
  instagram: string
  whatsapp: string
  verified: boolean
  participatesIn: string
  portfolio: PieceForm[]
  /** "Corazón que inspira" — visible siempre, sólo se manda al store para speakers. */
  quote: string
  /** En qué eventos habla (Entrega 1: sin bloque, `blockId` siempre null). */
  apps: SpeakerAppearanceInput[]
}

const empty: Form = {
  name: '',
  role: '',
  kind: 'participante',
  platform: PLATFORM_OPTIONS[0].value,
  city: '',
  bio: '',
  projects: '',
  photo: PHOTO_OPTIONS[0].value,
  instagram: '',
  whatsapp: '',
  verified: false,
  participatesIn: 'CCM 2026',
  portfolio: [],
  quote: '',
  apps: [],
}

/**
 * Apariciones del speaker derivadas de `getSpeakersByEvent()`: `CatalogProfile` no trae sus
 * propias apariciones, así que al editar hay que reconstruirlas mirando en qué grupos de
 * evento aparece este perfil. Entrega 1: siempre `blockId: null` (elegir bloque es Entrega 2).
 */
function deriveApps(profileId: string): SpeakerAppearanceInput[] {
  return store
    .getSpeakersByEvent()
    .filter((grupo) => grupo.speakers.some((sp) => sp.id === profileId))
    .map((grupo) => ({ eventId: grupo.eventId, blockId: null }))
}

function fromProfile(p: CatalogProfile): Form {
  return {
    name: p.name,
    role: p.role,
    kind: p.kind ?? 'participante',
    platform: p.platform,
    city: p.city,
    bio: p.bio,
    projects: p.projects ?? '',
    photo: p.photo,
    instagram: p.instagram ?? '',
    whatsapp: p.whatsapp ?? '',
    verified: p.verified,
    participatesIn: p.participatesIn.join(', '),
    portfolio: p.portfolio.map((pf) => ({ id: pf.id, image: pf.image, title: pf.title, caption: pf.caption, price: pf.price != null ? String(pf.price) : '' })),
    quote: p.quote ?? '',
    apps: deriveApps(p.id),
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
  const [verPool, setVerPool] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const eventos = useStore((s) => s.getEvents())

  useEffect(() => {
    if (open) {
      setF(profile ? fromProfile(profile) : empty)
      setError('')
    }
  }, [open, profile])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const quitarObra = (i: number) =>
    setF((prev) => ({ ...prev, portfolio: prev.portfolio.filter((_, j) => j !== i) }))

  const togglePortfolio = (image: string) =>
    setF((prev) => {
      if (prev.portfolio.some((p) => p.image === image)) {
        return { ...prev, portfolio: prev.portfolio.filter((p) => p.image !== image) }
      }
      if (prev.portfolio.length >= IMG_CAP[prev.kind]) return prev // no exceder el cupo del tipo
      return { ...prev, portfolio: [...prev.portfolio, { image, title: '', price: '' }] }
    })

  const setPiece = (image: string, key: 'title' | 'price' | 'caption') => (e: { target: { value: string } }) =>
    setF((prev) => ({
      ...prev,
      portfolio: prev.portfolio.map((p) => (p.image === image ? { ...p, [key]: e.target.value } : p)),
    }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim() || !f.role.trim() || !f.platform || !f.bio.trim() || !f.photo) {
      setError('Completá los campos obligatorios.')
      return
    }
    if (subiendo) {
      setError('Esperá a que terminen de subir las imágenes.')
      return
    }
    const participatesIn = f.participatesIn
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    // Conservamos id y caption de las obras que ya existían: el form no edita el epígrafe,
    // y si no lo devolvemos tal cual, el guardado lo borra.
    const portfolio: PortfolioPiece[] = f.portfolio.map((p, i) => ({
      id: p.id ?? newId('pf'),
      image: p.image,
      title: p.title.trim() || `Obra ${i + 1}`,
      ...(p.caption !== undefined ? { caption: p.caption } : {}),
      // Number() crudo aceptaba negativos, NaN e Infinity y ninguna capa lo acotaba después.
      price: p.price.trim() ? precioValido(p.price) : undefined,
    }))
    const data = {
      name: f.name.trim(),
      role: f.role.trim(),
      kind: f.kind,
      platform: f.platform,
      city: f.city.trim(),
      bio: f.bio.trim(),
      projects: f.kind === 'expositor' && f.projects.trim() ? f.projects.trim() : undefined,
      photo: f.photo,
      instagram: f.instagram.trim() || undefined,
      whatsapp: f.whatsapp.trim() || undefined,
      verified: f.verified,
      participatesIn,
      portfolio,
      quote: f.quote.trim() || undefined,
      // Verdad completa del set de apariciones (ver esOrador): las suyas si es orador, `[]` si
      // no. deriveApps() reconstruye f.apps por igual para speaker y expositor al editar.
      speakerAppearances: esOrador(f.kind) ? f.apps : [],
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
          <Input value={f.name} onChange={set('name')} placeholder="Nombre y apellido" required />
        </Field>
        <Field label="Tipo" hint="Participante (hasta 4 imágenes) o expositor (hasta 2 + cuenta proyectos)">
          <Select
            options={[
              { value: 'participante', label: 'Participante' },
              { value: 'expositor', label: 'Expositor' },
              { value: 'speaker', label: 'Speaker · Corazón que inspira' },
            ]}
            value={f.kind}
            onChange={(e) =>
              setF((prev) => {
                const kind = e.target.value as Kind
                // NO se recorta el portfolio al cambiar de tipo. Antes, pasar de participante a
                // expositor BORRABA en el acto las imágenes que sobraban del cupo nuevo, sin
                // preguntar y sin poder deshacer: se subían cuatro fotos, se corregía el tipo y
                // desaparecían dos. El cupo sigue frenando lo que se SUBE de más (línea 132);
                // lo ya cargado se conserva y se avisa abajo del campo.
                return { ...prev, kind }
              })
            }
          />
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
          <Field label="Ciudad" hint="Opcional">
            <Input value={f.city} onChange={set('city')} placeholder="Ej: Córdoba" />
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

        <Field label='Frase · "Corazón que inspira"' hint="Opcional">
          <Input value={f.quote} onChange={set('quote')} placeholder="Ej: La moda del interior también es negocio." />
        </Field>

        {f.kind === 'expositor' && (
          <Field label="Cuenta proyectos" hint="Opcional — narrativa del expositor: qué proyectos presenta">
            <Textarea value={f.projects} onChange={set('projects')} rows={3} placeholder="Los proyectos que trae el expositor…" />
          </Field>
        )}

        {esOrador(f.kind) && (
          <fieldset className="rounded-sm border border-line p-3">
            <legend className="px-1 text-[13px] font-medium text-ink-soft">¿En qué eventos habla?</legend>
            {eventos.map((ev) => {
              const marcado = f.apps.some((a) => a.eventId === ev.id)
              return (
                <label key={ev.id} className="flex items-center gap-2 py-1 text-[14px]">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={(e) =>
                      setF((prev) => ({
                        ...prev,
                        apps: e.target.checked
                          ? [...prev.apps, { eventId: ev.id, blockId: null }]
                          : prev.apps.filter((a) => a.eventId !== ev.id),
                      }))
                    }
                    className="size-4 accent-accent"
                  />
                  {ev.title}
                </label>
              )
            })}
          </fieldset>
        )}

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

        {/* De acá para abajo, todo lo visual junto: retrato + obras. Antes "Participa en" y
            "Perfil verificado" caían entre medio y partían la zona de imágenes en dos. */}
        <div className="border-t border-line pt-4">
          <p className="eyebrow text-[10px] text-ink-soft">Imágenes</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Retrato" required hint="Elegí uno del set o subí la foto real del participante">
            <div className="flex items-center gap-2">
              <Select options={PHOTO_OPTIONS} value={f.photo} onChange={set('photo')} className="flex-1" />
              <ImageUpload label="Subir" onUrl={(url) => setF((p) => ({ ...p, photo: url }))} />
            </div>
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

        <Field
          label={`Portfolio · ${f.portfolio.length}/${IMG_CAP[f.kind]} imágenes`}
          hint={
            f.portfolio.length > IMG_CAP[f.kind]
              ? `Tenés ${f.portfolio.length} imágenes y el cupo de ${f.kind} es ${IMG_CAP[f.kind]}. No se borra ninguna: se guardan todas, pero no vas a poder sumar más hasta bajar alguna.`
              : `Hasta ${IMG_CAP[f.kind]} obras (${f.kind}). Cambiá el tipo arriba para el otro cupo.`
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <ImageUpload
              label="Subir obras"
              multiple
              max={Math.max(0, IMG_CAP[f.kind] - f.portfolio.length)}
              onBusyChange={setSubiendo}
              onUrl={(url) =>
                setF((prev) =>
                  prev.portfolio.length >= IMG_CAP[prev.kind]
                    ? prev
                    : { ...prev, portfolio: [...prev.portfolio, { image: url, title: '', price: '' }] },
                )
              }
            />
            <button
              type="button"
              onClick={() => setVerPool((v) => !v)}
              className="text-xs text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink"
            >
              {verPool ? 'Ocultar el set de demo' : 'o elegir del set de demo'}
            </button>
          </div>
        </Field>

        {/* Set de demo, colapsado: antes esta grilla era LA vista del portfolio, así que las obras
            reales (que no están en el pool) quedaban invisibles — 20 de 23 perfiles en prod. */}
        {verPool && (
          <div className="rounded-sm border border-line p-2.5">
            <p className="mb-2 text-[11px] text-ink-soft">
              Set de demostración — <strong>no son obras del participante</strong>.
            </p>
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
          </div>
        )}

        {/* Esta lista es LA selección de obras: acá se ven TODAS (subidas o del set), se editan
            y se quitan. Antes las obras reales no aparecían en la grilla y no había forma de sacarlas. */}
        {f.portfolio.length > 0 ? (
          <div className="space-y-2.5 rounded-md border border-line bg-surface p-3">
            <p className="eyebrow text-[10px] text-ink-soft">Las obras de esta ficha (el precio es opcional)</p>
            {f.portfolio.map((p, i) => (
              <div key={p.id ?? `nueva-${i}-${p.image}`} className="flex items-center gap-2.5">
                <Img src={p.image} alt="" ratio="1/1" className="w-12 shrink-0 rounded-sm" />
                <div className="flex flex-1 flex-col gap-2">
                  <Input
                    value={p.title}
                    onChange={setPiece(p.image, 'title')}
                    placeholder="Título de la obra"
                  />
                  <Input
                    value={p.caption ?? ''}
                    onChange={setPiece(p.image, 'caption')}
                    placeholder="Epígrafe (se ve en la ficha pública)"
                  />
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100000000}
                  step={1}
                  value={p.price}
                  onChange={setPiece(p.image, 'price')}
                  placeholder="Precio $"
                  className="w-28 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => quitarObra(i)}
                  aria-label={`Quitar obra ${i + 1}`}
                  title="Quitar del portfolio"
                  className="shrink-0 rounded-sm border border-line px-2.5 py-2.5 text-danger transition-colors hover:bg-danger/10"
                >
                  <X className="size-3.5" strokeWidth={2.5} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-sm border border-dashed border-line px-3 py-5 text-center text-xs text-ink-soft">
            Todavía no hay obras cargadas. Subilas con el botón de arriba.
          </p>
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
