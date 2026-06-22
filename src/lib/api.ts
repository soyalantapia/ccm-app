import { getDeviceId } from './identity'

/**
 * Cliente HTTP del backend de CCM (Fase 1). Manda el header X-Device-Id con el UUID
 * del dispositivo (identidad sin contraseña). Todo cuelga de `<VITE_API_URL>/api/v1`
 * (VITE_API_URL NO incluye el prefijo — canon 1).
 */
export interface ApiClient {
  get<T>(path: string): Promise<T>
  patch<T>(path: string, body: unknown): Promise<T>
  postBatch(path: string, body: unknown): Promise<void>
}

export function createApi(apiBase: string): ApiClient {
  const base = apiBase.replace(/\/+$/, '') + '/api/v1'

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': getDeviceId(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`)
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  return {
    get: (p) => call('GET', p),
    patch: (p, b) => call('PATCH', p, b),
    postBatch: (p, b) => call<void>('POST', p, b).then(() => undefined),
  }
}
