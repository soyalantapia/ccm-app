/** Helpers de presentación de /entradas (solo formato, sin datos). */

/** Nro de orden corto y legible para mostrar al usuario (ej: #K3F9A). */
export function shortOrderId(id: string): string {
  return id.slice(-5).toUpperCase()
}

export function formatOrderDate(ts: string): string {
  const d = new Date(ts)
  const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time} hs`
}

/** Precio del plan: 0 → "Gratis" · null → null (precio a confirmar) · n → $ es-AR. */
export function formatPlanPrice(price: number | null): string | null {
  if (price === null) return null
  if (price === 0) return 'Gratis'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(price)
}
