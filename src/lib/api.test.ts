import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApi, ApiError } from './api'

/**
 * En un PATCH, `undefined` significa "vaciá este campo". Pero JSON.stringify BORRA las claves
 * con valor undefined, así que la clave nunca llegaba al backend, y el backend actualiza con
 * `if (k in patch) data[k] = ...` — sin la clave, no toca la columna.
 *
 * Efecto real: el organizador borra el subtítulo de un evento (o el código de un beneficio, o
 * el autor de una nota), guarda, ve "✓ guardado" y el valor viejo sigue publicado. Los forms
 * del admin codifican "campo vacío" como `campo.trim() || undefined` en 18 lugares.
 */

let body: string | undefined

beforeEach(() => {
  body = undefined
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: { body?: string }) => {
      body = init?.body
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('ApiClient — un PATCH puede VACIAR un campo opcional', () => {
  it('convierte undefined en null para que la clave sobreviva al JSON', async () => {
    await createApi('https://api.test').patch('/admin/eventos/ev_1', {
      title: 'Título nuevo',
      subtitle: undefined, // el organizador borró el subtítulo
    })
    const enviado = JSON.parse(body!)
    expect('subtitle' in enviado, 'la clave subtitle se perdió en el JSON').toBe(true)
    expect(enviado.subtitle).toBeNull()
    expect(enviado.title).toBe('Título nuevo')
  })

  it('no toca los valores presentes (incluidos falsy legítimos)', async () => {
    await createApi('https://api.test').patch('/admin/x/1', {
      vacio: '',
      cero: 0,
      falso: false,
      nulo: null,
      lista: [],
    })
    expect(JSON.parse(body!)).toEqual({ vacio: '', cero: 0, falso: false, nulo: null, lista: [] })
  })

  it('no rompe con arrays anidados ni objetos (solo normaliza el primer nivel)', async () => {
    await createApi('https://api.test').patch('/admin/galleries/g1', {
      photos: [{ id: 'ph-1', src: 's', alt: 'a' }],
      cover: undefined,
    })
    const enviado = JSON.parse(body!)
    expect(enviado.photos).toEqual([{ id: 'ph-1', src: 's', alt: 'a' }])
    expect(enviado.cover).toBeNull()
  })

  it('un POST NO se normaliza: crear no es vaciar', async () => {
    await createApi('https://api.test').post('/admin/notas', { title: 'N', author: undefined })
    const enviado = JSON.parse(body!)
    expect('author' in enviado).toBe(false)
  })
})

/**
 * El backend responde {error:{code,message}} de forma consistente, pero el cliente lo tiraba
 * a la basura y dejaba un Error de string con solo el status. Sin `code`, el llamador no puede
 * distinguir un rechazo real (BLOCK_FULL) de uno que en realidad es éxito (ALREADY_REGISTERED),
 * ni mostrarle al organizador por qué no se guardó lo que acaba de cargar.
 */
describe('ApiError — el error del backend llega entero al llamador', () => {
  function fetchQueFalla(status: number, cuerpo: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status, json: () => Promise.resolve(cuerpo) })),
    )
  }

  it('conserva status, code y el mensaje del backend', async () => {
    fetchQueFalla(400, { error: { code: 'INVALID_URL', message: 'Esquema de URL no permitido en CTA' } })
    const err = (await createApi('https://api.test')
      .post('/admin/convocatorias', {})
      .catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.code).toBe('INVALID_URL')
    expect(err.userMessage).toBe('Esquema de URL no permitido en CTA')
  })

  it('con un cuerpo que no es JSON no rompe: cae al mensaje genérico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error('not json')) })),
    )
    const err = (await createApi('https://api.test').patch('/admin/notas/n1', {}).catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
    expect(err.code).toBeUndefined()
    expect(err.userMessage).toContain('No se pudo guardar')
  })

  it('distingue rechazos entre sí por code', async () => {
    fetchQueFalla(409, { error: { code: 'ALREADY_REGISTERED', message: 'Ya estás inscripto.' } })
    const err = (await createApi('https://api.test').post('/registrations', {}).catch((e) => e)) as ApiError
    expect(err.code).toBe('ALREADY_REGISTERED')
    expect(err.code).not.toBe('BLOCK_FULL')
  })
})
