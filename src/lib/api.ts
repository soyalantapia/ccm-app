import { getDeviceToken, clearDeviceCredentials } from './identity'
import { getAdminToken, clearSession } from '../data/adminSession'

/**
 * Cliente HTTP del backend de CCM (Fase 1). Manda el token firmado del dispositivo en
 * X-Device-Token (identidad sin contraseña, emitida por POST /devices). Todo cuelga de
 * `<VITE_API_URL>/api/v1` (VITE_API_URL NO incluye el prefijo — canon 1).
 */
export interface ApiClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  patch<T>(path: string, body: unknown): Promise<T>
  put(path: string): Promise<void>
  del(path: string): Promise<void>
  postBatch(path: string, body: unknown): Promise<void>
}

export function createApi(apiBase: string): ApiClient {
  const base = apiBase.replace(/\/+$/, '') + '/api/v1'

  async function call<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    // Identidad del device: token firmado por el server (vacío hasta el primer POST /devices).
    const deviceToken = getDeviceToken()
    if (deviceToken) headers['X-Device-Token'] = deviceToken
    // Auth del organizador (Fase G): token Bearer en las rutas /admin/*.
    if (path.startsWith('/admin')) {
      const token = getAdminToken()
      if (token) headers.Authorization = `Bearer ${token}`
    }
    const res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // keepalive: el flush de analytics corre en pagehide/visibilitychange; sin esto el
      // navegador aborta el fetch al descartar el documento y se pierde el último batch.
      ...(keepalive ? { keepalive: true } : {}),
    })
    if (!res.ok) {
      // Token de device inválido/corrupto (401 en ruta no-admin): purgar credenciales para que el
      // próximo arranque re-emita identidad (antes ensureDeviceToken solo chequeaba existencia, no
      // validez → el device quedaba degradado para siempre). No tocar /admin (usa Bearer aparte).
      if (res.status === 401 && deviceToken && !path.startsWith('/admin')) clearDeviceCredentials()
      // Sesión de organizador vencida o revocada en medio del uso: limpiar el estado local. El
      // GateSesion del layout, al re-renderizar sin token, redirige al login — sin acoplar este
      // cliente HTTP al router. clearSession avisa a los suscriptores (el "quién soy" del sidebar).
      if (res.status === 401 && path.startsWith('/admin') && getAdminToken()) clearSession()
      throw new Error(`API ${method} ${path} → ${res.status}`)
    }
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    patch: (p, b) => call('PATCH', p, b),
    put: (p) => call<void>('PUT', p).then(() => undefined),
    del: (p) => call<void>('DELETE', p).then(() => undefined),
    postBatch: (p, b) => call<void>('POST', p, b, true).then(() => undefined),
  }
}
