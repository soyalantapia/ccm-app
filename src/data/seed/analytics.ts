import type { AnalyticsEvent, PlanId } from '../types'
import { IDS } from '../ids'
import { SOCIO_PRICE } from '../../features/membresia/plans'

/**
 * Históricos seed para que el dashboard admin no nazca vacío y respalde el pitch
 * "datos a escala" (PRD §10.1). En vez de objetos literales, el array se construye
 * PROGRAMÁTICAMENTE al cargar el módulo: escala de PRE-EVENTO (~6.400 eventos)
 * distribuida en los últimos ~40 días, con IDs reales del seed y taxonomía PRD §13.
 *
 * - Base temporal: se toma `Date.now()` una sola vez; los offsets en ms reparten
 *   los eventos en el tiempo y dejan un puñado en las últimas horas para que la
 *   "actividad en vivo" tenga filas frescas con horas relativas creíbles.
 * - Variabilidad: PRNG sembrado (mulberry32) con semilla fija → totales estables
 *   entre recargas y verosímiles (nada redondo).
 */

/* ─── PRNG sembrado (mulberry32) ───────────────────────────────────────── */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(0x5cc_2026)

/** Entero en [min, max]. */
function int(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}

/** Elige un elemento al azar de un arreglo no vacío. */
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]
}

/** Elige un elemento según pesos relativos (mismo largo que `items`). */
function weighted<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rand() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/* ─── Base temporal e IDs reales ──────────────────────────────────────── */
const NOW = Date.now()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WINDOW = 40 * DAY // ventana histórica ~40 días

let seq = 0
const deviceId = (n: number) => `dev-seed-${String(n).padStart(4, '0')}`
const DEVICE_POOL = 1600 // dispositivos únicos aproximados de pre-evento

/** Crea un evento seed con ts derivado de un offset en ms hacia el pasado. */
function event(
  name: string,
  msAgo: number,
  payload?: Record<string, unknown>,
  device?: number,
): AnalyticsEvent {
  seq += 1
  const dev = device ?? int(1, DEVICE_POOL)
  return {
    id: `seed-evt-${String(seq).padStart(5, '0')}`,
    event: name,
    ts: new Date(NOW - msAgo).toISOString(),
    deviceId: deviceId(dev),
    ...(payload ? { payload } : {}),
    seed: true,
  }
}

/**
 * Offset en ms hacia atrás dentro de la ventana, sesgado a actividad reciente
 * (más densa cerca del pre-evento). `fresh` fuerza un puñado en las últimas horas.
 */
function offset(fresh = false): number {
  if (fresh) return int(2 * MINUTE, 9 * HOUR)
  // sesgo cuadrático: más eventos en los últimos días que hace 40
  const t = rand() * rand() // ∈ [0,1), concentrado cerca de 0
  return Math.floor(t * WINDOW) + int(0, 30 * MINUTE)
}

const camino18Blocks = ['blk-c18-1', 'blk-c18-2', 'blk-c18-3', 'blk-c18-4'] as const
const camino30Blocks = ['blk-c30-1', 'blk-c30-2', 'blk-c30-3'] as const
const principalBlocks = [
  'blk-p-1',
  'blk-p-2',
  'blk-p-3',
  'blk-p-4',
  'blk-p-5',
  'blk-p-6',
  'blk-p-7',
] as const
const photoIds = Array.from({ length: 28 }, (_, i) => `ph-${String(i + 1).padStart(2, '0')}`)
// Galerías nuevas (variedad de seed): fotos + sponsor de cada una.
const caminoAbrilPhotoIds = Array.from({ length: 10 }, (_, i) => `ph-abr-${String(i + 1).padStart(2, '0')}`)
const capacitacionPhotoIds = Array.from({ length: 8 }, (_, i) => `ph-cap-${String(i + 1).padStart(2, '0')}`)
const desfileGalaPhotoIds = Array.from({ length: 12 }, (_, i) => `ph-gala-${String(i + 1).padStart(2, '0')}`)
const vipPlans: PlanId[] = ['sab-night-vip', 'combo-vip', 'dom-sunset-vip']
const videoIds = [
  { contentId: 'vid-01', youtubeId: 'cPRpNqmziUs' },
  { contentId: 'vid-02', youtubeId: 'vSCRU099FxU' },
  { contentId: 'vid-03', youtubeId: '-s67SZf46gU' },
]

/* ─── Construcción del array ──────────────────────────────────────────── */
function buildSeedAnalytics(): AnalyticsEvent[] {
  const out: AnalyticsEvent[] = []
  const N = (target: number) => int(Math.round(target * 0.95), Math.round(target * 1.05))

  // user_created · ~1200
  for (let i = 0, n = N(1200); i < n; i++) {
    out.push(event('user_created', offset(i % 130 === 0), undefined, int(1, DEVICE_POOL)))
  }

  // registration_created · ~700 — más densas en el Principal, luego Camino 18, 30.
  // Repartidas entre blockId/eventId reales (con eventId del bloque correspondiente).
  for (let i = 0, n = N(700); i < n; i++) {
    const which = weighted(['principal', 'camino18', 'camino30'] as const, [52, 33, 15])
    let eventId: string
    let blockId: string
    if (which === 'principal') {
      eventId = IDS.events.principal
      blockId = weighted(principalBlocks, [30, 12, 14, 12, 8, 8, 16])
    } else if (which === 'camino18') {
      eventId = IDS.events.camino18
      blockId = weighted(camino18Blocks, [30, 10, 18, 28])
    } else {
      eventId = IDS.events.camino30
      blockId = weighted(camino30Blocks, [34, 18, 22])
    }
    out.push(event('registration_created', offset(i % 90 === 0), { eventId, blockId }))
  }
  // Un puñado de cancelaciones (la KPI resta registration_cancelled).
  for (let i = 0, n = N(28); i < n; i++) {
    const blockId = pick([...camino18Blocks, ...camino30Blocks, ...principalBlocks])
    const eventId = blockId.startsWith('blk-p')
      ? IDS.events.principal
      : blockId.startsWith('blk-c18')
        ? IDS.events.camino18
        : IDS.events.camino30
    out.push(event('registration_cancelled', offset(), { eventId, blockId }))
  }

  // photo_view · ~250 (galería Camino · Marzo, sponsor S3 Aura Beauty)
  for (let i = 0, n = N(250); i < n; i++) {
    out.push(
      event('photo_view', offset(i % 60 === 0), {
        photoId: pick(photoIds),
        galleryId: IDS.gallery.camino,
        sponsorId: IDS.sponsors.beauty,
      }),
    )
  }
  // photo_download · ~120
  for (let i = 0, n = N(120); i < n; i++) {
    out.push(
      event('photo_download', offset(i % 40 === 0), {
        photoId: pick(photoIds),
        galleryId: IDS.gallery.camino,
        sponsorId: IDS.sponsors.beauty,
      }),
    )
  }

  // Galerías nuevas (variedad de seed): cada una con su galleryId/sponsorId reales,
  // mismo patrón de fechado (offset relativo a la ventana). Volúmenes menores que la
  // de Marzo para que el Reporte de Impacto de cada sponsor no nazca vacío pero siga
  // siendo verosímil.
  const seededGalleries = [
    { galleryId: IDS.gallery.capacitacionMayo, sponsorId: IDS.sponsors.eyewear, photos: capacitacionPhotoIds, views: 180, downloads: 78 },
    { galleryId: IDS.gallery.caminoAbril, sponsorId: IDS.sponsors.wines, photos: caminoAbrilPhotoIds, views: 140, downloads: 52 },
    { galleryId: IDS.gallery.desfileGala, sponsorId: IDS.sponsors.banco, photos: desfileGalaPhotoIds, views: 210, downloads: 95 },
  ] as const
  for (const g of seededGalleries) {
    for (let i = 0, n = N(g.views); i < n; i++) {
      out.push(
        event('photo_view', offset(i % 60 === 0), {
          photoId: pick(g.photos),
          galleryId: g.galleryId,
          sponsorId: g.sponsorId,
        }),
      )
    }
    for (let i = 0, n = N(g.downloads); i < n; i++) {
      out.push(
        event('photo_download', offset(i % 40 === 0), {
          photoId: pick(g.photos),
          galleryId: g.galleryId,
          sponsorId: g.sponsorId,
        }),
      )
    }
  }

  // ad_impression · ~3000 — por slot S1/S2/S3/S6 y sponsorId reales (más al Principal).
  const adSlots = [
    { slot: 'S1', sponsorId: IDS.sponsors.banco, w: 12 }, // Principal (splash de apertura)
    { slot: 'S2', sponsorId: IDS.sponsors.banco, w: 50 }, // Principal
    { slot: 'S6', sponsorId: IDS.sponsors.banco, w: 18 }, // Principal (acreditación)
    { slot: 'S3', sponsorId: IDS.sponsors.beauty, w: 20 }, // Oro (galería)
    { slot: 'S2', sponsorId: IDS.sponsors.beauty, w: 6 }, // Oro
    { slot: 'S3', sponsorId: IDS.sponsors.eyewear, w: 16 }, // Oro (galería taller)
    { slot: 'S2', sponsorId: IDS.sponsors.eyewear, w: 10 }, // Oro (feed)
    { slot: 'S6', sponsorId: IDS.sponsors.eyewear, w: 3 }, // Oro (Mi QR)
    { slot: 'S2', sponsorId: IDS.sponsors.wines, w: 4 }, // Plata
    { slot: 'S6', sponsorId: IDS.sponsors.wines, w: 2 }, // Plata
  ] as const
  const adWeights = adSlots.map((a) => a.w)
  for (let i = 0, n = N(3000); i < n; i++) {
    const a = weighted(adSlots, adWeights)
    out.push(
      event('ad_impression', offset(i % 220 === 0), { slot: a.slot, sponsorId: a.sponsorId }),
    )
  }
  // ad_click · ~250 (CTR realista, mismo reparto por slot/sponsor)
  for (let i = 0, n = N(250); i < n; i++) {
    const a = weighted(adSlots, adWeights)
    out.push(event('ad_click', offset(i % 40 === 0), { slot: a.slot, sponsorId: a.sponsorId }))
  }

  // video_play · ~80
  for (let i = 0, n = N(80); i < n; i++) {
    out.push(event('video_play', offset(i % 25 === 0), pick(videoIds)))
  }

  // Entradas (planId reales VIP) · created ~40 → redirected_mp ~25 → confirmed ~15
  for (let i = 0, n = N(40); i < n; i++) {
    const planId = weighted(vipPlans, [40, 38, 22])
    const base = offset(i % 12 === 0)
    out.push(event('ticket_order_created', base, { planId }))
    // El embudo: parte se redirige a MP unos minutos después.
    if (i < 25) {
      out.push(event('ticket_order_redirected_mp', Math.max(MINUTE, base - int(1, 8) * MINUTE), { planId }))
      // y de esas, parte se confirma.
      if (i < 15) {
        out.push(
          event('ticket_order_confirmed', Math.max(MINUTE, base - int(9, 40) * MINUTE), { planId }),
        )
      }
    }
  }

  // application_submitted · ~60 (convocatoria Camino a CCM)
  for (let i = 0, n = N(60); i < n; i++) {
    out.push(
      event('application_submitted', offset(i % 18 === 0), {
        convocatoriaId: IDS.convocatoria.camino,
      }),
    )
  }

  // membership_purchased · ~90 socios (membresía Socio CCM) — MISMO nombre y payload
  // que el evento en vivo (LocalDataStore.becomeSocio), para que el KPI «Socios» y los
  // ingresos por membresías agreguen seed + demo de forma uniforme. `total` = SOCIO_PRICE.
  for (let i = 0, n = N(90); i < n; i++) {
    out.push(
      event('membership_purchased', offset(i % 14 === 0), { tier: 'socio', total: SOCIO_PRICE }),
    )
  }

  // Orden cronológico ascendente: el dashboard toma los últimos 12 (los más
  // recientes quedan al final) para la "actividad en vivo".
  out.sort((a, b) => +new Date(a.ts) - +new Date(b.ts))
  return out
}

/* ⚠️ Gateado a DEV a propósito: en un build de producción este literal NO se compila.
 * Antes viajaba adentro del bundle y RemoteDataStore caía acá al fallar la hidratación,
 * así que con la red mala la app mostraba contenido inventado como si fuera real —
 * y cargaba impecable, porque el service worker precachea el shell. Ver el docstring de
 * RemoteDataStore. Si necesitás la demo, corré `npm run dev`. */
export const seedAnalytics: AnalyticsEvent[] = import.meta.env.DEV ? buildSeedAnalytics() : []
