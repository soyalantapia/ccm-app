import { badRequest } from './errors.js'

/**
 * Normaliza y valida una URL que se va a guardar y servir a un <a href> público
 * (destino de banner, link de beneficio). Defense-in-depth server-side:
 *  - http(s)/mailto/tel y rutas internas ('/...') → tal cual.
 *  - scheme-less tipo dominio (wa.me/…) → antepone https://.
 *  - javascript:/data:/vbscript: y otros esquemas → 400 (no se persisten).
 * Devuelve la URL limpia, o null si venía vacía.
 */
export function cleanStoredUrl(raw: string | null | undefined, field = 'url'): string | null {
  if (raw == null) return null
  const url = String(raw).trim()
  if (!url) return null
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url
  if (url.startsWith('/')) return url
  // Cualquier otro esquema explícito (javascript:, data:, vbscript:, file:…) se rechaza.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) throw badRequest('INVALID_URL', `Esquema de URL no permitido en ${field}`)
  // Scheme-less que parece dominio → https.
  if (/^[\w-]+(\.[\w-]+)+/.test(url)) return `https://${url}`
  throw badRequest('INVALID_URL', `URL inválida en ${field}`)
}
