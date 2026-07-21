import { describe, it, expect } from 'vitest'
import { toSponsor, toContentItem, gateSocioContents, toApplication } from './serialize'
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

// El gate de contenido premium tiene DOS capas y testeamos las dos: toContentItem(withVideo)
// blanquea al serializar, y gateSocioContents lo vuelve a aplicar sobre la lista ya serializada.
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

// toApplication tiene el mismo gate que toContentItem, pero al revés: acá el default (forAdmin
// implícito false) es el SEGURO — la misma fila alimenta /admin/applications (forAdmin=true) y
// /applications ("Mis postulaciones", device-scoped, sin el flag). Sin este gate, decidedBy
// (email del admin) viajaba también a la propia ficha del postulante.
function baseApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    convocatoriaId: 'cv-1',
    ts: new Date('2026-06-10T11:00:00.000Z'),
    status: 'aceptada',
    data: { nombre: 'Milagros' },
    fromSeed: false,
    decidedAt: new Date('2026-06-11T09:00:00.000Z'),
    decidedBy: 'gaston@ccm.test',
    notifiedAt: null,
    notifyError: null,
    ...overrides,
  }
}

describe('toApplication — gate de decidedBy (admin vs. postulante)', () => {
  it('sin forAdmin (default), OMITE decidedBy — es lo que recibe "Mis postulaciones"', () => {
    const out = toApplication(baseApplication() as never)
    expect('decidedBy' in out).toBe(false)
  })

  it('con forAdmin=true, incluye decidedBy — solo /admin/applications lo pide así', () => {
    const out = toApplication(baseApplication() as never, true)
    expect(out.decidedBy).toBe('gaston@ccm.test')
  })

  it('con forAdmin=true pero sin decidedBy en la fila, no inventa la clave', () => {
    const out = toApplication(baseApplication({ decidedBy: null }) as never, true)
    expect('decidedBy' in out).toBe(false)
  })

  it('notifiedAt y notifyError viajan en AMBOS modos: son sobre el aviso de la propia postulación', () => {
    const notificada = baseApplication({ notifiedAt: new Date('2026-06-11T09:05:00.000Z') })
    expect(toApplication(notificada as never).notifiedAt).toBe('2026-06-11T09:05:00.000Z')
    expect(toApplication(notificada as never, true).notifiedAt).toBe('2026-06-11T09:05:00.000Z')

    const fallida = baseApplication({ notifyError: 'SMTP caído' })
    expect(toApplication(fallida as never).notifyError).toBe('SMTP caído')
    expect(toApplication(fallida as never, true).notifyError).toBe('SMTP caído')
  })

  it('sin notifiedAt ni notifyError, no manda ninguna de las dos claves (nunca se intentó avisar)', () => {
    const out = toApplication(baseApplication() as never)
    expect('notifiedAt' in out).toBe(false)
    expect('notifyError' in out).toBe(false)
  })
})
