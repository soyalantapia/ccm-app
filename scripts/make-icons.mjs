// Generates PWA icons from an inline SVG monogram (editorial CCM mark).
// Run: node scripts/make-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve(import.meta.dirname, '../public/icons')
mkdirSync(OUT, { recursive: true })

const INK = '#181410'
const CREAM = '#f4efe3'
const GOLD = '#b98a2f'

// scale: 1 for regular icons, ~0.72 for maskable (safe zone)
function monogram(scale = 1) {
  const g = (n) => 256 + (n - 256) * scale
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="${INK}"/>
    <!-- corazón -->
    <path d="M ${g(256)} ${g(196)}
             C ${g(238)} ${g(160)} ${g(184)} ${g(158)} ${g(172)} ${g(192)}
             C ${g(160)} ${g(226)} ${g(196)} ${g(258)} ${g(256)} ${g(300)}
             C ${g(316)} ${g(258)} ${g(352)} ${g(226)} ${g(340)} ${g(192)}
             C ${g(328)} ${g(158)} ${g(274)} ${g(160)} ${g(256)} ${g(196)} Z"
          fill="${GOLD}"/>
    <text x="256" y="${g(392)}" text-anchor="middle"
          font-family="Georgia, 'Times New Roman', serif" font-size="${128 * scale}"
          font-weight="600" letter-spacing="${2 * scale}" fill="${CREAM}">CCM</text>
    <rect x="${g(216)}" y="${g(418)}" width="${80 * scale}" height="${4 * scale}" fill="${GOLD}"/>
  </svg>`
}

const jobs = [
  { file: 'icon-192.png', size: 192, svg: monogram(1) },
  { file: 'icon-512.png', size: 512, svg: monogram(1) },
  { file: 'apple-touch-icon.png', size: 180, svg: monogram(1) },
  { file: 'maskable-512.png', size: 512, svg: monogram(0.7) },
]

for (const job of jobs) {
  await sharp(Buffer.from(job.svg)).resize(job.size, job.size).png().toFile(`${OUT}/${job.file}`)
  console.log('✓', job.file)
}

// favicon
await sharp(Buffer.from(monogram(1))).resize(64, 64).png().toFile(resolve(OUT, '../favicon.png'))
console.log('✓ favicon.png')
