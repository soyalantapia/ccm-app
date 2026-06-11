/**
 * Resuelve rutas de assets de `public/` respetando el base path de GH Pages.
 * El seed guarda rutas relativas ('img/gallery/g01.jpg'); la UI SIEMPRE
 * renderiza con asset(path).
 */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '')
}
