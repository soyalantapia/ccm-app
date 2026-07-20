import type { AdSlot } from '../data/types.js'

/**
 * Precios que el SERVIDOR debe conocer para cobrar.
 *
 * Vive en src/lib/ (no en features/) porque el backend lo importa por ruta relativa, igual que
 * htmlPolicy.ts — ver server/src/lib/sanitizeBody.ts. Una sola constante para los dos lados:
 * si el precio viviera solo en el front, el server no tendría con qué validar lo que le mandan.
 */

/** Membresía Socio CCM. */
export const SOCIO_PRICE = 9900

/** Tarifa por hora de cada espacio publicitario. S5 no existe en el dominio (hueco intencional). */
export const PRICE_PER_HOUR_BY_SLOT: Record<AdSlot, number> = {
  S1: 9000,
  S2: 6000,
  S3: 4500,
  S4: 5000,
  S6: 3000,
}

/**
 * Total de una campaña. Normaliza las horas (entero ≥ 1) y cae al feed ante un slot desconocido:
 * devolver 0 sería regalar el espacio, y NaN rompería la columna Int de Postgres.
 */
export function priceForCampaign(slot: AdSlot, hours: number): number {
  const perHora = PRICE_PER_HOUR_BY_SLOT[slot] ?? PRICE_PER_HOUR_BY_SLOT.S2
  const horas = Math.max(1, Math.floor(Number(hours) || 1))
  return perHora * horas
}
