import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * Atrapa el foco dentro de `containerRef` mientras `active`.
 * - Al activar: guarda el foco previo y mueve el foco al primer elemento focusable
 *   (o al contenedor mismo si no hay ninguno).
 * - Tab / Shift+Tab ciclan dentro del contenedor.
 * - Escape llama a `onClose` (si se pasa).
 * - Al desactivar / desmontar: restituye el foco al elemento previamente enfocado.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Foco inicial dentro del diálogo.
    const focusFirst = () => {
      const focusable = getFocusable(container)
      if (focusable.length > 0) {
        focusable[0].focus()
      } else {
        if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
        container.focus()
      }
    }
    // rAF: el panel puede estar animando su entrada al montar.
    const raf = requestAnimationFrame(focusFirst)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = getFocusable(container)
      if (focusable.length === 0) {
        // Sin elementos focusables: mantené el foco en el contenedor.
        e.preventDefault()
        container.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeEl = document.activeElement

      if (e.shiftKey) {
        if (activeEl === first || activeEl === container || !container.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (activeEl === last || activeEl === container || !container.contains(activeEl)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      // Restituí el foco al elemento previo si sigue en el DOM.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [active, containerRef, onClose])
}
