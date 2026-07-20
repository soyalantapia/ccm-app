import type { AdminRole, Permission } from './adminRoles'

/**
 * La sesión del organizador, en un solo lugar.
 *
 * Antes el token se leía suelto de sessionStorage en tres archivos distintos (el cliente HTTP,
 * el subidor de imágenes y el arranque del store). Con tres lectores independientes, cambiar
 * cómo se autentica obligaba a acordarse de los tres — y olvidarse de uno no rompía nada visible
 * hasta que alguien intentaba subir una foto. Ahora todos le preguntan a este módulo.
 */

const KEY = 'ccm:admin-token'

export interface AdminMe {
  id: string | null
  email: string | null
  name: string | null
  role: AdminRole
  permissions: Permission[]
}

/** Se guarda en sessionStorage y NO en localStorage: cerrar la pestaña cierra la sesión.
 *  Va en el header Authorization, no en una cookie, porque el panel puede correr en un origen
 *  distinto de la API (dev local, GitHub Pages) y ahí una cookie no viaja. */
export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(KEY, token)
    else sessionStorage.removeItem(KEY)
  } catch {
    /* modo privado o storage lleno: la sesión vive sólo en memoria */
  }
}

export function hasAdminToken(): boolean {
  return !!getAdminToken()
}

/** Headers de autenticación para pegarle a las rutas del panel. */
export function adminAuthHeaders(): Record<string, string> {
  const t = getAdminToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

/* ─── Estado en memoria de quién está logueado ─── */

let me: AdminMe | null = null
const listeners = new Set<() => void>()

export function getMe(): AdminMe | null {
  return me
}

export function setMe(next: AdminMe | null): void {
  me = next
  listeners.forEach((l) => l())
}

export function onSessionChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** ¿La persona logueada puede hacer esto? Sin sesión cargada todavía, no. */
export function can(permission: Permission): boolean {
  return !!me?.permissions.includes(permission)
}

export function clearSession(): void {
  setAdminToken(null)
  setMe(null)
}
