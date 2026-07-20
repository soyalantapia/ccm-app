/**
 * Resuelve rutas de assets de `public/` respetando el base path de GH Pages.
 * El seed guarda rutas relativas ('img/gallery/g01.jpg'); la UI SIEMPRE
 * renderiza con asset(path).
 */
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

export function asset(path: string): string {
  // URLs absolutas (CDN / portada externa) pasan sin tocar: solo prefijamos rutas relativas.
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path
  // Las imágenes que sube el organizador las sirve el BACKEND, no el bundle, y llegan como ruta
  // de raíz ('/uploads/<uuid>.jpg'). Prefijarlas con BASE_URL las rompía: con el base por defecto
  // del repo ('/ccm-app/') quedaban en '/ccm-app/uploads/…' → 404. Van contra el origen de la API.
  if (path.startsWith('/')) return API_BASE + path
  return import.meta.env.BASE_URL + path.replace(/^\//, '')
}
