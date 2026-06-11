#!/usr/bin/env node
/**
 * fetch-images.mjs — Descarga las imágenes editoriales del contrato de CLAUDE.md
 * desde Unsplash (napi público, Unsplash License) a public/img/.
 *
 * Uso: node scripts/fetch-images.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Caché opcional de resultados de búsqueda (JSON por query, cosechado vía
// headless browser cuando el napi está detrás del challenge anti-bot).
const SEARCH_CACHE_DIR = process.env.CCM_SEARCH_CACHE ?? '/tmp/ccm-unsplash'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMG_ROOT = join(ROOT, 'public', 'img')

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// 1. Búsqueda
// ---------------------------------------------------------------------------

const QUERIES = [
  'fashion editorial',
  'fashion runway show',
  'backstage fashion',
  'fashion portrait studio',
  'haute couture',
  'fashion designer atelier',
  'fashion accessories detail',
  'fashion week',
  'fashion portrait woman',
  'fashion portrait man',
  'fashion runway night',
  'fabric texture detail',
  'street style fashion',
  'fashion show audience',
]

const PAGES_PER_QUERY = 3

/** @type {Map<string, Array<Photo>>} pool por query */
const pools = new Map()
/** ids ya asignados a algún path (no repetir fotos) */
const usedIds = new Set()
let napiFailed = false

async function searchQuery(query) {
  const photos = []
  for (let page = 1; page <= PAGES_PER_QUERY; page++) {
    const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=30&page=${page}`
    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
        if (res.status === 403 || res.status === 429) {
          console.warn(`  [${query} p${page}] HTTP ${res.status}, retry ${attempt + 1}`)
          await sleep(1500 * (attempt + 1))
          continue
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        for (const p of json.results ?? []) {
          if (!p?.urls?.raw || !p?.id) continue
          // evitar fotos Unsplash+ (pueden venir con watermark)
          if (p.urls.raw.includes('plus.unsplash.com')) continue
          if (p.premium === true) continue
          photos.push({
            id: p.id,
            raw: p.urls.raw,
            width: p.width,
            height: p.height,
            credit: p.user?.name ?? 'Unsplash photographer',
            source: p.links?.html ?? `https://unsplash.com/photos/${p.id}`,
          })
        }
        ok = true
      } catch (err) {
        console.warn(`  [${query} p${page}] error: ${err.message}, retry ${attempt + 1}`)
        await sleep(1200 * (attempt + 1))
      }
    }
    if (!ok) napiFailed = true
    await sleep(350)
  }
  return photos
}

// ---------------------------------------------------------------------------
// 2. Plan de archivos (contrato exacto)
// ---------------------------------------------------------------------------

/** @typedef {{path:string, w:number, h?:number, prefs:string[], orient?:'portrait'|'landscape'}} Target */
/** @type {Target[]} */
const targets = []

// hero
targets.push(
  { path: 'img/hero/hero-main.jpg', w: 1600, prefs: ['fashion editorial', 'haute couture', 'fashion week'] },
  { path: 'img/hero/hero-night.jpg', w: 1600, prefs: ['fashion runway night', 'fashion runway show', 'fashion week'] },
  { path: 'img/hero/hero-sunset.jpg', w: 1600, prefs: ['fashion runway show', 'fashion week', 'fashion editorial'] },
)

// events (1600x1000 crop)
targets.push(
  { path: 'img/events/principal.jpg', w: 1600, h: 1000, prefs: ['fashion runway show', 'fashion week'], orient: 'landscape' },
  { path: 'img/events/camino-18.jpg', w: 1600, h: 1000, prefs: ['fashion week', 'fashion editorial'], orient: 'landscape' },
  { path: 'img/events/camino-30.jpg', w: 1600, h: 1000, prefs: ['backstage fashion', 'fashion show audience'], orient: 'landscape' },
)

// people p01..p12 (800x1000 crop, mezcla de géneros)
for (let i = 1; i <= 12; i++) {
  const nn = String(i).padStart(2, '0')
  const womanFirst = i % 2 === 1
  targets.push({
    path: `img/people/p${nn}.jpg`,
    w: 800,
    h: 1000,
    prefs: womanFirst
      ? ['fashion portrait woman', 'fashion portrait studio', 'fashion editorial']
      : ['fashion portrait man', 'fashion portrait studio', 'fashion editorial'],
    orient: 'portrait',
  })
}

// portfolio pNN-1..pNN-4 — set temático coherente por perfil
const PORTFOLIO_THEMES = [
  'haute couture',
  'fashion designer atelier',
  'fashion accessories detail',
  'backstage fashion',
  'fabric texture detail',
  'street style fashion',
  'fashion editorial',
  'fashion runway show',
  'fashion week',
  'fashion accessories detail',
  'fashion designer atelier',
  'haute couture',
]
for (let i = 1; i <= 12; i++) {
  const nn = String(i).padStart(2, '0')
  const theme = PORTFOLIO_THEMES[i - 1]
  for (let j = 1; j <= 4; j++) {
    targets.push({
      path: `img/portfolio/p${nn}-${j}.jpg`,
      w: 1000,
      prefs: [theme, 'fashion editorial', 'fashion week'],
    })
  }
}

// gallery g01..g28 — evento de moda variado
const GALLERY_MIX = ['fashion runway show', 'backstage fashion', 'fashion week', 'fashion show audience']
for (let i = 1; i <= 28; i++) {
  const nn = String(i).padStart(2, '0')
  const main = GALLERY_MIX[(i - 1) % GALLERY_MIX.length]
  targets.push({
    path: `img/gallery/g${nn}.jpg`,
    w: 1200,
    prefs: [main, ...GALLERY_MIX.filter((q) => q !== main), 'fashion editorial'],
  })
}

// ---------------------------------------------------------------------------
// 3. Asignación + descarga con verificación
// ---------------------------------------------------------------------------

function buildUrl(photo, t) {
  let url = `${photo.raw}&w=${t.w}&q=72&fm=jpg`
  if (t.h) url += `&h=${t.h}&fit=crop`
  return url
}

function nextCandidate(t) {
  const orderedPools = [...t.prefs, ...QUERIES.filter((q) => !t.prefs.includes(q))]
  // primera pasada: respetar orientación pedida; segunda: cualquiera
  for (const respectOrient of [true, false]) {
    for (const q of orderedPools) {
      const pool = pools.get(q) ?? []
      for (const photo of pool) {
        if (usedIds.has(photo.id)) continue
        if (respectOrient && t.orient === 'portrait' && photo.height <= photo.width) continue
        if (respectOrient && t.orient === 'landscape' && photo.width <= photo.height) continue
        usedIds.add(photo.id)
        return photo
      }
    }
  }
  return null
}

async function downloadVerified(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.startsWith('image/jpeg')) throw new Error(`content-type ${ct}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength <= 25 * 1024) throw new Error(`too small (${buf.byteLength} bytes)`)
  return buf
}

const manifest = []
const failures = []
let picsumUsed = 0

async function processTarget(t) {
  const abs = join(ROOT, 'public', t.path)
  await mkdir(dirname(abs), { recursive: true })

  for (let attempt = 0; attempt < 6; attempt++) {
    const photo = nextCandidate(t)
    if (!photo) break
    try {
      const buf = await downloadVerified(buildUrl(photo, t))
      await writeFile(abs, buf)
      manifest.push({ path: t.path, credit: photo.credit, source: photo.source })
      console.log(`ok  ${t.path}  (${(buf.byteLength / 1024).toFixed(0)}KB, ${photo.credit})`)
      return
    } catch (err) {
      console.warn(`retry ${t.path}: ${photo.id} → ${err.message}`)
    }
  }

  // último recurso: picsum
  try {
    picsumUsed++
    const seed = `ccm${t.path.replace(/[^a-z0-9]/gi, '')}`
    const h = t.h ?? Math.round(t.w * 0.66)
    const url = `https://picsum.photos/seed/${seed}/${t.w}/${h}`
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(abs, buf)
    manifest.push({ path: t.path, credit: 'Picsum (fallback)', source: url })
    console.warn(`FALLBACK picsum → ${t.path}`)
  } catch (err) {
    failures.push(t.path)
    console.error(`FAIL ${t.path}: ${err.message}`)
  }
}

async function runPool(items, worker, size) {
  let idx = 0
  const lanes = Array.from({ length: size }, async () => {
    while (idx < items.length) {
      const item = items[idx++]
      await worker(item)
    }
  })
  await Promise.all(lanes)
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

console.log(`Buscando en Unsplash (${QUERIES.length} queries x ${PAGES_PER_QUERY} páginas)...`)
for (const q of QUERIES) {
  let photos = null
  const cacheFile = join(SEARCH_CACHE_DIR, q.replaceAll(' ', '-') + '.json')
  try {
    const cached = JSON.parse(await readFile(cacheFile, 'utf8'))
    if (Array.isArray(cached) && cached.length > 0) {
      photos = cached
      console.log(`  "${q}": ${photos.length} fotos (caché ${cacheFile})`)
    }
  } catch {
    /* sin caché → búsqueda directa */
  }
  if (!photos) {
    photos = await searchQuery(q)
    console.log(`  "${q}": ${photos.length} fotos (napi)`)
  }
  pools.set(q, photos)
}

const totalPool = [...pools.values()].reduce((a, p) => a + p.length, 0)
console.log(`Pool total: ${totalPool} fotos. Targets: ${targets.length}.`)
if (totalPool < targets.length) console.warn('ADVERTENCIA: pool chico, puede haber fallbacks.')

await runPool(targets, processTarget, 6)

manifest.sort((a, b) => a.path.localeCompare(b.path))
await mkdir(IMG_ROOT, { recursive: true })
await writeFile(join(IMG_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

console.log('\n--- RESUMEN ---')
console.log(`Descargadas: ${manifest.length}/${targets.length}`)
console.log(`Fallback picsum: ${picsumUsed}`)
console.log(`Fallas: ${failures.length}${failures.length ? ' → ' + failures.join(', ') : ''}`)
if (napiFailed) console.log('NOTA: hubo errores persistentes en el napi de Unsplash.')
process.exit(failures.length ? 1 : 0)
