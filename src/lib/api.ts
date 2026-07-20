import { getDeviceToken, clearDeviceCredentials } from './identity'

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

/**
 * En un PATCH, `undefined` significa "vaciá este campo" — pero JSON.stringify BORRA las claves
 * con valor undefined, así que la clave nunca llegaba y el backend (`if (k in patch) ...`) no
 * tocaba la columna: el organizador borraba un campo opcional, veía "✓ guardado", y el valor
 * viejo seguía ahí. Los forms del admin codifican "vacío" como `campo.trim() || undefined` en
 * 18 lugares; normalizamos acá, en la costura, en vez de en cada form.
 * Solo el primer nivel: es donde viven los campos escalares del patch.
 */
function undefinedANull(body: unknown): unknown {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return body
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) out[k] = v === undefined ? null : v
  return out
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
      const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ccm:admin-token') : null
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
      throw new Error(`API ${method} ${path} → ${res.status}`)
    }
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    patch: (p, b) => call('PATCH', p, undefinedANull(b)),
    put: (p) => call<void>('PUT', p).then(() => undefined),
    del: (p) => call<void>('DELETE', p).then(() => undefined),
    postBatch: (p, b) => call<void>('POST', p, b, true).then(() => undefined),
  }
}
