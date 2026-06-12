// Recompress seed images for mobile LCP budget. Run: node scripts/optimize-images.mjs
import sharp from 'sharp'
import { readdirSync, statSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../public/img')

async function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      await walk(path)
      continue
    }
    if (!/\.jpg$/i.test(name)) continue
    const before = statSync(path).size
    if (before < 150 * 1024) continue
    const isHero = path.includes('/hero/')
    const width = isHero ? 1400 : 1100
    const tmp = path + '.tmp'
    await sharp(path)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: isHero ? 58 : 62, mozjpeg: true })
      .toFile(tmp)
    const after = statSync(tmp).size
    if (after < before) {
      renameSync(tmp, path)
      console.log(`✓ ${path.split('/img/')[1]} ${(before / 1024).toFixed(0)}K → ${(after / 1024).toFixed(0)}K`)
    } else {
      renameSync(path, path) // keep original
      const { unlinkSync } = await import('node:fs')
      unlinkSync(tmp)
    }
  }
}

await walk(ROOT)
console.log('done')
