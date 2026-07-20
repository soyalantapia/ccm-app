/**
 * Claves de identidad de una persona. Son las ÚNICAS con las que se unifica: coincidencia
 * exacta tras normalizar. Nada de heurísticas por nombre — dos "Juan Pérez" no son la misma
 * persona, y fusionar de más es peor que no fusionar.
 */
export interface IdentityKeys {
  email: string | null
  dni: string | null
}

/** Minúsculas y sin espacios. Devuelve null si no parece un email. */
export function normalizeEmail(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  // Validación deliberadamente laxa: acá no rechazamos direcciones raras pero válidas,
  // solo descartamos lo que claramente no es un email y ensuciaría el índice único.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null
  return s
}

/** Solo dígitos. Devuelve null fuera del rango de largo de un documento (7 a 11). */
export function normalizeDni(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const digits = v.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 11) return null
  return digits
}

/** Extrae las claves del `data` (JSON libre) de una postulación. */
export function keysFromApplicationData(data: unknown): IdentityKeys {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { email: null, dni: null }
  }
  const d = data as Record<string, unknown>
  return {
    email: normalizeEmail(typeof d.email === 'string' ? d.email : null),
    dni: normalizeDni(typeof d.dni === 'string' ? d.dni : null),
  }
}
