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
 * Pila de traps activos. "Hay un diálogo abierto" NO es un booleano: puede haber un Sheet
 * sobre un Modal, o el reporte a sponsors sobre un Sheet. Sin pila, los N traps montados
 * escuchan el MISMO keydown de document, así que un solo Escape cerraba todos a la vez y el
 * Tab lo manejaban varios contenedores peleándose el foco. Solo el tope de la pila responde.
 */
const pilaDeTraps: symbol[] = []

/**
 * Bloqueo de scroll con CONTEO, no con flag. `document.body.style.overflow` se usaba como
 * booleano en 4 lugares: si dos diálogos se solapaban, el primero en cerrarse devolvía el
 * scroll al body con el otro todavía abierto (el fondo scrolleaba detrás del diálogo).
 */
let bloqueosDeScroll = 0

export function bloquearScroll(): () => void {
  if (bloqueosDeScroll === 0) document.body.style.overflow = 'hidden'
  bloqueosDeScroll++
  let liberado = false
  return () => {
    if (liberado) return // idempotente: un cleanup que corre dos veces no descuenta de más
    liberado = true
    bloqueosDeScroll = Math.max(0, bloqueosDeScroll - 1)
    if (bloqueosDeScroll === 0) document.body.style.overflow = ''
  }
}

/**
 * Atrapa el foco dentro de `containerRef` mientras `active`.
 * - Al activar: guarda el foco previo y mueve el foco al primer elemento focusable
 *   (o al contenedor mismo si no hay ninguno).
 * - Tab / Shift+Tab ciclan dentro del contenedor.
 * - Escape llama a `onClose` (si se pasa) — SOLO si este trap es el tope de la pila.
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

    const id = Symbol('focus-trap')
    pilaDeTraps.push(id)
    const soyElTope = () => pilaDeTraps[pilaDeTraps.length - 1] === id

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
      if (!soyElTope()) return // hay un diálogo por encima: el evento es suyo
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
      // Sacar POR IDENTIDAD, no con pop(): los desmontajes no tienen por qué ser LIFO.
      const i = pilaDeTraps.indexOf(id)
      if (i !== -1) pilaDeTraps.splice(i, 1)
      // Restituí el foco al elemento previo si sigue en el DOM.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [active, containerRef, onClose])
}
