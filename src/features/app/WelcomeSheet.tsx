import { useEffect, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Image as ImageIcon, QrCode } from 'lucide-react'
import { Button, Sheet } from '../../components/ui'
import { store } from '../../data/store'
import { registerFree } from '../../lib/actions'

const WELCOMED_KEY = 'ccm:welcomed'

function alreadyWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED_KEY) === '1'
  } catch {
    return false
  }
}

const STEPS: { icon: ComponentType<{ size?: number; strokeWidth?: number }>; title: string; text: string }[] = [
  { icon: QrCode, title: 'Tu acceso por QR', text: 'Te registrás una vez y tu entrada vive en el teléfono.' },
  { icon: CalendarDays, title: 'Armá tu agenda', text: 'Inscribite a charlas, masterclasses y desfiles con cupo.' },
  { icon: ImageIcon, title: 'Llevate las fotos', text: 'Galerías del evento para ver y descargar, gratis.' },
]

/**
 * Onboarding de primera vez (PRD §8 — first-aha). Bottom sheet con las 3 cosas
 * que se hacen en la app + la acción principal (registro). Aparece una sola vez
 * por dispositivo, poco después de abrir la app.
 */
export function WelcomeSheet() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (alreadyWelcomed()) return
    let cancelled = false
    const t = window.setTimeout(() => {
      if (!cancelled && !alreadyWelcomed()) setOpen(true)
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [])

  const finish = (then?: () => void) => {
    try {
      localStorage.setItem(WELCOMED_KEY, '1')
    } catch {
      /* no-op */
    }
    store.track('onboarding_completed')
    setOpen(false)
    then?.()
  }

  return (
    <Sheet open={open} onClose={() => finish()} title="Bienvenido a CCM 2026">
      <p className="text-sm leading-relaxed text-ink-soft">
        Córdoba Corazón de Moda, en tu bolsillo. Esto es lo que podés hacer:
      </p>

      <div className="mt-5 space-y-4">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-bg text-accent">
              <Icon size={17} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-ink">{title}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-7 flex flex-col gap-2.5">
        <Button size="lg" className="w-full" onClick={() => finish(() => void registerFree(navigate))}>
          Registrate gratis
        </Button>
        <Button variant="ghost" size="lg" className="w-full" onClick={() => finish()}>
          Explorar primero
        </Button>
      </div>
    </Sheet>
  )
}
