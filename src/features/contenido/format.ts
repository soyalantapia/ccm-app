/** '2025-10-06' → '6 de octubre de 2025' (es-AR). Mediodía para evitar saltos de zona horaria. */
export function formatPublishedAt(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
