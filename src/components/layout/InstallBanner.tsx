import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, Share, Smartphone, X } from 'lucide-react'
import { store } from '../../data/store'
import { useInstallPrompt } from '../../lib/useInstallPrompt'

const DISMISS_KEY = 'ccm:install-dismissed'
/** Demora la aparición para no pisar el interstitial S1 (skippeable a los 3s). */
const APPEAR_DELAY_MS = 4200

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Nudge de instalación (PRD §17). Tarjeta inferior, solo mobile, que demuestra
 * en vivo que la demo es una app instalable de verdad. En Android dispara el
 * prompt nativo; en iOS muestra el paso manual (Compartir → Agregar a inicio).
 * Aparece 1× (descartable, persistente) y nunca sobre el panel admin.
 */
export function InstallBanner() {
  const { canPrompt, installed, ios, promptInstall } = useInstallPrompt()
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)
  const [iosOpen, setIosOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const shown = useRef(false)

  const isAdmin = pathname.includes('/admin')
  const eligible = !installed && !dismissed && !isAdmin && (canPrompt || ios)

  useEffect(() => {
    if (!eligible) {
      setVisible(false)
      return
    }
    const t = window.setTimeout(() => {
      setVisible(true)
      if (!shown.current) {
        shown.current = true
        store.track('pwa_prompt_shown', { platform: ios ? 'ios' : 'android' })
      }
    }, APPEAR_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [eligible, ios])

  if (!eligible || !visible) return null

  const persistDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* no-op */
    }
    setDismissed(true)
  }

  const close = () => {
    store.track('pwa_prompt_dismissed', { platform: ios ? 'ios' : 'android' })
    persistDismiss()
  }

  const install = async () => {
    if (ios) {
      setIosOpen((v) => !v)
      return
    }
    setBusy(true)
    const outcome = await promptInstall()
    setBusy(false)
    if (outcome === 'accepted') {
      store.track('pwa_install_accepted', { platform: 'android' })
      persistDismiss()
    } else if (outcome === 'dismissed') {
      // El usuario rechazó el prompt nativo: lo ocultamos esta sesión sin nag.
      setVisible(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Instalar la app"
      className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 animate-rise rounded-lg border border-night-soft bg-night text-night-ink shadow-2xl md:hidden"
    >
      <div className="flex items-center gap-3 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink">
          <Smartphone size={19} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight text-night-ink">Instalá CCM como app</p>
          <p className="mt-0.5 text-[11px] leading-snug text-night-ink/55">
            Acceso directo, pantalla completa y tu QR siempre a mano.
          </p>
        </div>
        <button
          onClick={install}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-accent px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink transition-all duration-200 hover:brightness-105 active:scale-[0.97] disabled:opacity-60"
        >
          {ios ? <Share size={13} strokeWidth={2} /> : <Download size={13} strokeWidth={2} />}
          {ios ? 'Cómo' : 'Instalar'}
        </button>
        <button
          onClick={close}
          aria-label="Ahora no"
          className="-mr-1 shrink-0 rounded-sm p-1.5 text-night-ink/50 transition-colors hover:bg-night-soft hover:text-night-ink"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      {ios && iosOpen && (
        <div className="border-t border-night-soft px-3.5 py-3 motion-safe:animate-fade">
          <p className="text-[12px] leading-relaxed text-night-ink/75">
            Tocá <Share size={13} className="mx-0.5 inline align-[-2px] text-accent" /> <em className="text-accent">Compartir</em> en
            la barra de Safari y elegí <em className="text-accent">«Agregar a inicio»</em>.
          </p>
        </div>
      )}
    </div>
  )
}
