import { badRequest } from './errors.js'

/**
 * Parsea una fecha del cliente y falla con 400 INVALID_DATE (no un 500 INTERNAL opaco) si es
 * inválida o ausente. Un solo guard para todas las escrituras admin con fecha (eventos, contenido,
 * notas, convocatorias) — antes cada una hacía `new Date(x)` crudo y una fecha basura reventaba
 * el `new Date()` o Prisma con 500. Espeja el comportamiento que ya tenía createNota.
 */
export function parseDate(v: unknown, field: string): Date {
  const d = new Date(v as string)
  if (!v || isNaN(d.getTime())) throw badRequest('INVALID_DATE', `Fecha inválida en ${field}`)
  return d
}
