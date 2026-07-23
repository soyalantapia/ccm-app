import { describe, expect, it } from 'vitest'
import type { SpeakerAppearanceInput } from '../../data/types'
import { esOrador } from './OpsCatalogForm'

/**
 * esOrador gobierna dos decisiones del form de catálogo a la vez: si se muestra el bloque
 * "¿En qué eventos habla?" y si el submit manda las apariciones o `[]`. El caso que importa
 * proteger es la reclasificación: un perfil que deja de ser orador debe mandar `[]` para que
 * el backend borre sus filas EventSpeaker y no quede como "participante" saliendo en /speakers.
 */
describe('esOrador', () => {
  it('es orador un speaker puro y un expositor que además da charla', () => {
    expect(esOrador('speaker')).toBe(true)
    expect(esOrador('expositor')).toBe(true)
  })

  it('un participante no es orador (no da charlas)', () => {
    expect(esOrador('participante')).toBe(false)
  })

  it('el set de apariciones a enviar es [] cuando el kind deja de ser orador', () => {
    const apps: SpeakerAppearanceInput[] = [{ eventId: 'ev-1', blockId: null }]
    // Réplica de la regla del submit: apariciones si es orador, [] si no.
    const enviar = (kind: Parameters<typeof esOrador>[0]) => (esOrador(kind) ? apps : [])
    expect(enviar('expositor')).toEqual(apps)
    expect(enviar('participante')).toEqual([])
  })
})
