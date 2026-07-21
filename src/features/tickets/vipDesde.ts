import type { TicketPlan } from '../../data/types'

/**
 * Precio "VIP desde": el MÁS BARATO de los planes VIP con precio confirmado.
 *
 * Antes cada pantalla resolvía esto con `.find((p) => p.kind === 'vip' && p.price !== null)`,
 * o sea el PRIMER VIP de la lista, no el más barato. La API real devuelve el Combo VIP
 * ($50.000) antes que el Night/Sunset VIP ($30.000), así que producción anunciaba
 * "Desde $50.000" mientras la demo —con el seed en el orden inverso— se veía bien.
 * Costura demo/prod clásica: el cartel mentía justo en el número que decide la compra.
 *
 * Devuelve `null` cuando no hay ningún VIP con precio: `Math.min()` de un array vacío da
 * `Infinity`, y los tres llamadores esperan `null` para ocultar el "Desde …".
 */
export function vipDesde(plans: readonly TicketPlan[]): number | null {
  const precios = plans
    .filter((p) => p.kind === 'vip' && p.price !== null)
    .map((p) => p.price as number)
  return precios.length > 0 ? Math.min(...precios) : null
}
