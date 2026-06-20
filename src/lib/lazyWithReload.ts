import { lazy, type ComponentType } from 'react'

const RELOAD_FLAG = 'ccm:chunk-reload'

// Guarda en memoria por carga de página: evita recargar dos veces si fallan
// dos chunks a la vez. Se reinicia con cada navegación, por eso NO alcanza
// como única defensa contra loops (ver writeReloadFlag).
let reloadedThisLoad = false

// `any` acá es deliberado: replica la firma de `React.lazy` para preservar la
// inferencia de props del componente (p. ej. Legales recibe `kind`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>

/**
 * Núcleo testeable de [[lazyWithReload]]: intenta cargar el módulo y, si falla,
 * recarga una sola vez. `reload` es inyectable para poder testearlo sin tocar
 * la página real.
 */
export async function loadOrReload<T>(
  factory: () => Promise<{ default: T }>,
  reload: () => void = () => window.location.reload(),
): Promise<{ default: T }> {
  try {
    const mod = await factory()
    // Cargó bien: limpiamos la marca para habilitar un futuro auto-reload.
    clearReloadFlag()
    return mod
  } catch (err) {
    const canReload =
      typeof window !== 'undefined' &&
      window.navigator.onLine !== false &&
      !reloadedThisLoad &&
      !readReloadFlag()
    // Solo recargamos si pudimos PERSISTIR la marca (writeReloadFlag devuelve
    // true). Si sessionStorage no está disponible no podríamos recordar el
    // reintento tras recargar → loop infinito; en ese caso preferimos mandar el
    // error al errorElement (recuperación de un toque) antes que un storm.
    if (canReload && writeReloadFlag()) {
      reloadedThisLoad = true
      reload()
      // La página se está recargando; devolvemos una promesa que nunca resuelve
      // para no renderizar nada en el ínterin.
      return new Promise<{ default: T }>(() => {})
    }
    // Ya reintentamos, estamos offline, o no podemos recordar el reintento:
    // que el error llegue al errorElement.
    throw err
  }
}

/**
 * `lazy()` resistente a deploys.
 *
 * En una SPA con rutas code-split, cuando sale un deploy nuevo el `index.html`
 * y el service worker pueden quedar un instante desfasados de los chunks
 * (GitHub Pages devuelve su `404.html` —HTML— mientras propaga el `.js`, o un
 * SW viejo sigue al mando). El import dinámico entonces falla con
 * "Failed to fetch dynamically imported module" y la ruta queda en blanco.
 *
 * Acá: si el import falla, recargamos UNA sola vez para tomar el index/SW
 * nuevos (la propagación tarda segundos). Si tras recargar vuelve a fallar,
 * propagamos el error al `errorElement` de la ruta — sin loop infinito.
 */
export function lazyWithReload<T extends AnyComponent>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() => loadOrReload(factory))
}

function readReloadFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1'
  } catch {
    return false
  }
}

/** Devuelve true si pudo persistir la marca (clave para no entrar en loop). */
function writeReloadFlag(): boolean {
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1')
    return true
  } catch {
    return false
  }
}

function clearReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* sessionStorage no disponible (modo privado) — no pasa nada */
  }
}
