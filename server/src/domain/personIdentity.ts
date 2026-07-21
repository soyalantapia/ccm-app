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

/**
 * Un DNI argentino tiene 7 u 8 dígitos, nunca más. Ese rango angosto es a propósito: un CUIT/CUIL
 * tiene 11 dígitos y trae el DNI incrustado en el medio (20-38456120-4 → DNI 38456120), así que si
 * lo tratáramos como un documento más, la misma persona quedaría con dos claves distintas —una por
 * DNI, otra por CUIT— y el CRM la duplicaría. Por eso, ante 11 dígitos, primero probamos si es un
 * CUIT válido (prefijo de persona física o jurídica conocido) y extraemos el DNI de adentro para
 * unificarla con quien cargó directamente el DNI. Si no matchea un prefijo válido, lo rechazamos:
 * son justo el largo donde se cuelan teléfonos tipeados por error en el campo equivocado.
 */
export function normalizeDni(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  let digits = v.replace(/\D/g, '')
  if (digits.length === 11) {
    const cuitPrefixes = ['20', '23', '24', '27', '30', '33', '34']
    if (!cuitPrefixes.includes(digits.slice(0, 2))) return null
    digits = digits.slice(2, 10)
  }
  digits = digits.replace(/^0+/, '')
  if (digits.length !== 7 && digits.length !== 8) return null
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

/**
 * Enmascara una clave de identidad para poder escribirla en un log.
 *
 * Los logs de la aplicación no tienen control de acceso por rol: quien puede leerlos ve todo.
 * Escribir ahí un email o un DNI completo saca ese dato del único lugar donde está protegido
 * —la base, detrás de un permiso— y lo deja en un canal sin permisos. CCM captura DNI, así que
 * esto además cae bajo la ley de datos personales (25.326).
 *
 * Lo que se conserva es lo justo para reconocer un caso al auditarlo: el dominio del email o
 * los últimos dígitos del documento. Nada de eso alcanza para identificar a alguien por sí solo.
 */
export function enmascararClave(clave: string, valor: string | null | undefined): string {
  if (!valor) return `${clave}=(vacío)`
  if (clave === 'email') {
    const [usuario = '', dominio = ''] = valor.split('@')
    // Una o dos letras iniciales: suficiente para distinguir dos casos al leer el log, muy poco
    // para reconstruir la dirección.
    const visible = usuario.slice(0, Math.min(2, usuario.length))
    return `email=${visible}${'*'.repeat(Math.max(1, usuario.length - visible.length))}@${dominio}`
  }
  // Documentos y cualquier otra clave: sólo los últimos 3, como en un resumen bancario.
  const cola = valor.slice(-3)
  return `${clave}=${'*'.repeat(Math.max(1, valor.length - cola.length))}${cola}`
}
