import { describe, it, expect } from 'vitest'
import { toSponsor, gateSocioContents } from './serialize'
import type { ContentItem } from '@domain/types'

/** Sponsor Prisma mínimo para el mapeo (los campos que toSponsor lee). */
function baseSponsor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp-1',
    name: 'Banco Distrito',
    industry: 'Banca',
    level: 'Principal',
    exclusive: true,
    tagline: 'El banco que invierte en la industria creativa',
    banner: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    creatives: [],
    ...overrides,
  }
}

describe('toSponsor — regresión P1#1 (serialización de banner)', () => {
  it('emite `banner` cuando está presente', () => {
    const out = toSponsor(baseSponsor({ banner: 'img/sponsors/distrito.svg' }) as never)
    expect(out.banner).toBe('img/sponsors/distrito.svg')
  })

  it('OMITE la clave `banner` cuando es null → el SponsorCarousel no filtra sponsors falsos', () => {
    const out = toSponsor(baseSponsor({ banner: null }) as never)
    expect('banner' in out).toBe(false)
  })

  it('mapea creatives (slot/headline) y omite sub/cta vacíos', () => {
    const out = toSponsor(
      baseSponsor({
        creatives: [
          { id: 'c1', sponsorId: 'sp-1', slot: 'S2', headline: 'H', sub: null, cta: null, order: 0 },
          { id: 'c2', sponsorId: 'sp-1', slot: 'S1', headline: 'H2', sub: 'Sub', cta: 'Ver', order: 1 },
        ],
      }) as never,
    )
    expect(out.creatives).toEqual([
      { slot: 'S2', headline: 'H' },
      { slot: 'S1', headline: 'H2', sub: 'Sub', cta: 'Ver' },
    ])
  })

  it('devuelve creatives:[] cuando el sponsor no trae creatives', () => {
    const out = toSponsor(baseSponsor({ creatives: undefined }) as never)
    expect(out.creatives).toEqual([])
  })
})

describe('gateSocioContents — gate server-side de contenido premium', () => {
  const premium: ContentItem = { id: 'v1', type: 'video', title: 'Backstage', description: '', youtubeId: 'SECRET_ID', publishedAt: '2026-01-01', socioOnly: true }
  const libre: ContentItem = { id: 'v2', type: 'video', title: 'Trailer', description: '', youtubeId: 'PUBLIC_ID', publishedAt: '2026-01-01', socioOnly: false }

  it('a un NO socio le vacía el youtubeId de los videos socioOnly (no filtra el asset)', () => {
    const [p, l] = gateSocioContents([premium, libre], false)
    expect(p.youtubeId).toBe('')
    expect(p.socioOnly).toBe(true) // el item sigue apareciendo (portada + candado)
    expect(l.youtubeId).toBe('PUBLIC_ID') // el libre no se toca
  })

  it('a un SOCIO le deja el youtubeId intacto', () => {
    const [p] = gateSocioContents([premium, libre], true)
    expect(p.youtubeId).toBe('SECRET_ID')
  })

  it('nunca toca el youtubeId de items NO socioOnly', () => {
    expect(gateSocioContents([libre], false)[0].youtubeId).toBe('PUBLIC_ID')
  })
})
