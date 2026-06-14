// Genera la imagen de previsualización para WhatsApp / redes (Open Graph, 1200x630).
// Fondo: foto del evento + degradé azul noche + texto de marca. Run: node scripts/make-og.mjs
import sharp from 'sharp'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const W = 1200
const H = 630

const NIGHT = '#131c2e'
const CREAM = '#f4efe3'
const GOLD = '#c9a24a'

const overlay = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${NIGHT}" stop-opacity="0.96"/>
      <stop offset="0.55" stop-color="${NIGHT}" stop-opacity="0.82"/>
      <stop offset="1" stop-color="${NIGHT}" stop-opacity="0.30"/>
    </linearGradient>
    <linearGradient id="bottom" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${NIGHT}" stop-opacity="0.85"/>
      <stop offset="0.5" stop-color="${NIGHT}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <rect width="${W}" height="${H}" fill="url(#bottom)"/>

  <!-- monograma -->
  <text x="${W - 60}" y="78" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="40" letter-spacing="1" fill="${CREAM}">CCM</text>

  <!-- eyebrow -->
  <rect x="72" y="118" width="46" height="3" fill="${GOLD}"/>
  <text x="132" y="126" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="22" letter-spacing="5" fill="${GOLD}">14ª EDICIÓN · 19 Y 20 DE SEPTIEMBRE</text>

  <!-- título -->
  <text x="70" y="248" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="96" letter-spacing="-2" fill="${CREAM}">Córdoba</text>
  <text x="70" y="346" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="96" letter-spacing="-2" fill="${GOLD}">Corazón de Moda</text>

  <!-- subtítulo -->
  <text x="72" y="424" font-family="Helvetica, Arial, sans-serif" font-weight="500" font-size="29" fill="${CREAM}" fill-opacity="0.9">El ecosistema de negocios y tendencias más</text>
  <text x="72" y="462" font-family="Helvetica, Arial, sans-serif" font-weight="500" font-size="29" fill="${CREAM}" fill-opacity="0.9">influyente del interior del país.</text>
  <text x="72" y="510" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="25" fill="${GOLD}">Hotel Quinto Centenario · Córdoba</text>

  <!-- pill -->
  <rect x="72" y="540" width="284" height="56" rx="6" fill="${GOLD}"/>
  <text x="214" y="577" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="25" letter-spacing="1" fill="#1c1503">Registrate gratis</text>
</svg>`

const bg = await sharp(resolve(ROOT, 'public/img/events/principal.jpg'))
  .resize(W, H, { fit: 'cover', position: 'attention' })
  .toBuffer()

await sharp(bg)
  .composite([{ input: Buffer.from(overlay) }])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(resolve(ROOT, 'public/og-image.jpg'))

console.log('✓ public/og-image.jpg')
