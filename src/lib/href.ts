/**
 * Normaliza y asegura una URL de destino que va a un <a href> (banners, beneficios, contacto).
 * - http(s)/mailto/tel → tal cual.
 * - scheme-less que parece dominio (wa.me/…, instagram.com/…) → le antepone https://.
 * - javascript:/data:/vbscript: → null (se bloquea: no se renderiza el link).
 * Devuelve null si no hay un destino seguro y usable.
 */
export function safeExternalHref(raw?: string | null): string | null {
  if (!raw) return null
  const url = raw.trim()
  if (!url) return null
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url
  // Esquemas peligrosos: bloquear.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null
  // Rutas internas (las maneja el router, no <a> externo) → no las tratamos como externas.
  if (url.startsWith('/')) return null
  // Scheme-less tipo "wa.me/549..." o "dominio.com/x" → asumimos https.
  if (/^[\w-]+(\.[\w-]+)+/.test(url)) return `https://${url}`
  return null
}

/** ¿La URL es interna (ruta del router) en vez de un destino externo? */
export function isInternalPath(raw?: string | null): boolean {
  return !!raw && raw.trim().startsWith('/')
}
