import { describe, it, expect } from 'vitest'
import { toSponsor, toContentItem } from './serialize'

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

function baseContent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ct-1', type: 'video', title: 'Masterclass', description: 'd', youtubeId: 'SECRET-ID',
    duration: null, platform: null, sponsorId: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'), socioOnly: false, ...overrides,
  }
}

describe('toContentItem — gate socioOnly server-side (blanquea youtubeId)', () => {
  it('emite el youtubeId real cuando withVideo=true', () => {
    expect(toContentItem(baseContent({ socioOnly: true }) as never, true).youtubeId).toBe('SECRET-ID')
  })
  it('BLANQUEA el youtubeId cuando withVideo=false (no filtra el video pago)', () => {
    expect(toContentItem(baseContent({ socioOnly: true }) as never, false).youtubeId).toBe('')
  })
  it('por default (sin flag) emite el id — contenido público', () => {
    expect(toContentItem(baseContent() as never).youtubeId).toBe('SECRET-ID')
  })
})
