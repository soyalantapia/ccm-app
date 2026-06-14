import { useEffect, useState } from 'react'

/**
 * Instalación PWA (PRD §17 — "es instalable"). El navegador dispara
 * `beforeinstallprompt` cuando la app cumple los criterios de instalación;
 * lo capturamos a nivel de módulo (puede dispararse antes de montar el
 * componente) y lo exponemos vía hook. iOS Safari no dispara el evento, así
 * que ahí mostramos instrucciones manuales (Compartir → Agregar a inicio).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** ¿La app ya corre instalada (standalone)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari expone navigator.standalone
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** ¿iOS (iPhone/iPad)? incluye iPadOS que se reporta como Mac con touch. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iDevice = /iphone|ipad|ipod/i.test(ua)
  const iPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  return iDevice || iPadOS
}

export interface InstallState {
  /** Hay un prompt nativo disponible (Android/Chromium). */
  canPrompt: boolean
  /** La app ya está instalada / corre standalone. */
  installed: boolean
  /** Es iOS (sin prompt nativo: requiere instrucciones manuales). */
  ios: boolean
  /** Dispara el prompt nativo. Devuelve el resultado o 'unavailable'. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

export function useInstallPrompt(): InstallState {
  const [canPrompt, setCanPrompt] = useState(deferred !== null)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    const update = () => {
      setCanPrompt(deferred !== null)
      setInstalled(isStandalone())
    }
    listeners.add(update)
    update()
    return () => {
      listeners.delete(update)
    }
  }, [])

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable'
    await deferred.prompt()
    const choice = await deferred.userChoice
    deferred = null
    notify()
    return choice.outcome
  }

  return { canPrompt, installed, ios: isIOS(), promptInstall }
}
