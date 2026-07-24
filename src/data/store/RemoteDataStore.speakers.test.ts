import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'

let store: Record<string, string> = {}
function mem(): Storage {
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] }, clear: () => { store = {} },
    key: (i) => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length } } as Storage
}
const SPEAKERS = [{ eventId: 'ev-2026', eventTitle: 'CCM 2026', eventDate: '2026-09-19', speakers: [] }]

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', mem()); vi.stubGlobal('sessionStorage', mem())
  vi.stubGlobal('fetch', vi.fn((url: string) =>
    Promise.resolve({ ok: true, status: 200, json: () =>
      Promise.resolve(String(url).endsWith('/speakers') ? SPEAKERS
        : String(url).endsWith('/devices') ? { deviceId: 'd', token: 't' } : []) })))
})
afterEach(() => vi.unstubAllGlobals())

describe('RemoteDataStore — speakers', () => {
  it('hidrata /speakers y lo devuelve sincrónico', async () => {
    const s = new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(s.getSpeakersByEvent()).toHaveLength(1))
    expect(s.getSpeakersByEvent()[0].eventTitle).toBe('CCM 2026')
  })
})
