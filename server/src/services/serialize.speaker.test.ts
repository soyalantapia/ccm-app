import { describe, it, expect } from 'vitest'
import { toCatalogProfile } from '../lib/serialize.js'

const base = {
  id: 'cat-x', slug: 'x', name: 'X', role: 'Speaker', platform: 'Moda',
  city: 'Córdoba', bio: 'b', projects: null, photo: 'p', instagram: null,
  whatsapp: null, verified: false, participatesIn: [], quote: null,
  createdAt: new Date(), updatedAt: new Date(),
}

describe('toCatalogProfile — preserva el kind speaker', () => {
  it('un kind speaker NO se colapsa a participante', () => {
    expect(toCatalogProfile({ ...base, kind: 'speaker' }).kind).toBe('speaker')
  })
  it('expositor sigue siendo expositor', () => {
    expect(toCatalogProfile({ ...base, kind: 'expositor' }).kind).toBe('expositor')
  })
  it('un valor desconocido cae a participante (fallback seguro)', () => {
    expect(toCatalogProfile({ ...base, kind: 'basura' as never }).kind).toBe('participante')
  })
})
