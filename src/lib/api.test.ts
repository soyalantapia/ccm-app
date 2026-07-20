import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApi } from './api'

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
