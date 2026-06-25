import { getDeviceToken } from './identity'

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

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    // Identidad del device: token firmado por el server (vacío hasta el primer POST /devices).
    const deviceToken = getDeviceToken()
    if (deviceToken) headers['X-Device-Token'] = deviceToken
    // Auth del organizador (Fase G): token Bearer en las rutas /admin/*.
    if (path.startsWith('/admin')) {
      const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ccm:admin-token') : null
      if (token) headers.Authorization = `Bearer ${token}`
    }
    const res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`)
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    patch: (p, b) => call('PATCH', p, b),
    put: (p) => call<void>('PUT', p).then(() => undefined),
    del: (p) => call<void>('DELETE', p).then(() => undefined),
    postBatch: (p, b) => call<void>('POST', p, b).then(() => undefined),
  }
}
