import { lazy, type ComponentType } from 'react'

const RELOAD_FLAG = 'ccm:chunk-reload'

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
      !readReloadFlag()
    if (canReload) {
      writeReloadFlag()
      reload()
      // La página se está recargando; devolvemos una promesa que nunca resuelve
      // para no renderizar nada en el ínterin.
      return new Promise<{ default: T }>(() => {})
    }
    // Ya reintentamos (o estamos offline): que el error llegue al errorElement.
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

function writeReloadFlag(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    /* sin sessionStorage no podemos guardar la marca; igual recargamos una vez
       por carga de página, que es el caso común */
  }
}

function clearReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* sessionStorage no disponible (modo privado) — no pasa nada */
  }
}
