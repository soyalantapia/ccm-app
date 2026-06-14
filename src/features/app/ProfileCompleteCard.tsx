import { Check, Sparkles } from 'lucide-react'
import { Button } from '../../components/ui'
import { useStore } from '../../data/store'
import { missingFields } from '../../lib/identity'
import { FIELD_META, requireProfile } from '../../lib/profileRequest'
import { toast } from '../../components/ui'
import type { ProfileFieldKey } from '../../data/types'

const ALL_FIELDS = Object.keys(FIELD_META) as ProfileFieldKey[]

/**
 * CTA principal de perfil: completar TODOS los datos faltantes en UN solo paso.
 * Lee el perfil reactivo (useStore) → progreso en vivo: al cerrar el sheet,
 * la card pasa de "faltan N" a "completo" sola. requireProfile abre un único
 * sheet con todos los campos que faltan (D22); los ya dados no se re-piden.
 */
export function ProfileCompleteCard() {
  // Suscripción reactiva: cualquier escritura del perfil re-renderiza la card.
  const fields = useStore((s) => s.getProfile().fields)
  const total = ALL_FIELDS.length
  const missing = ALL_FIELDS.filter((f) => !fields[f]?.value?.trim())
  const captured = total - missing.length
  const isComplete = missing.length === 0
  const pct = Math.round((captured / total) * 100)

  const completeAll = async () => {
    const ok = await requireProfile(ALL_FIELDS, 'completar_perfil', {
      title: 'Completá tu perfil',
      message: 'Te lo pedimos una sola vez. Después la app ya los tiene siempre.',
    })
    if (ok && missingFields(ALL_FIELDS).length === 0) toast('Perfil completo ✓')
  }

  // Estado completo: card sutil con check dorado, sin botón.
  if (isComplete) {
    return (
      <div className="flex items-center gap-3.5 rounded-md border border-line bg-surface px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Check size={18} strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <div className="type-serif text-lg text-ink">Perfil completo</div>
          <p className="text-[13px] text-ink-soft">
            Tenés todos tus datos cargados. No te pedimos nada más.
          </p>
        </div>
      </div>
    )
  }

  // Estado con faltantes: card night, progreso y CTA grande.
  return (
    <div className="rounded-md bg-night p-6 text-night-ink md:p-7">
      <div className="flex items-start gap-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Sparkles size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div className="eyebrow text-[10px] text-accent">
            {missing.length === 1 ? 'Falta 1 dato' : `Faltan ${missing.length} datos`}
          </div>
          <h3 className="type-display mt-1.5 text-2xl">Completá tu perfil</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-night-ink/75">
            Completalo una sola vez y listo: te ahorra tiempo en cada{' '}
            <em className="text-accent">inscripción</em>, compra y descarga.
          </p>
        </div>
      </div>

      {/* Indicador de progreso (capturados / total) */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-[11px] text-night-ink/70">
          <span className="eyebrow text-[10px]">Tu progreso</span>
          <span className="type-serif text-night-ink">
            {captured}/{total}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-night-ink/15">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Button
        variant="primary"
        size="lg"
        className="mt-6 w-full"
        onClick={() => void completeAll()}
      >
        Completar mi perfil
      </Button>
    </div>
  )
}
