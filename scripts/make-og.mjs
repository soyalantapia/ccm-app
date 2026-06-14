// Genera las imágenes de previsualización para WhatsApp / redes (Open Graph, 1200x630),
// una por sección (home, app, admin, sponsors, eventos): cada link compartido muestra
// una imagen propia. Fondo: foto + degradé azul noche + texto de marca.
// Run: node scripts/make-og.mjs
import sharp from 'sharp'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const W = 1200
const H = 630

const NIGHT = '#131c2e'
const CREAM = '#f4efe3'
const GOLD = '#c9a24a'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Una imagen OG. `title2` va en dorado; `sub2` opcional. */
function overlaySvg({ eyebrow, title1, title2, sub1, sub2, place, pill }) {
  return `
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

  <text x="${W - 60}" y="78" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="40" letter-spacing="1" fill="${CREAM}">CCM</text>

  <rect x="72" y="118" width="46" height="3" fill="${GOLD}"/>
  <text x="132" y="126" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="22" letter-spacing="5" fill="${GOLD}">${esc(eyebrow)}</text>

  <text x="70" y="248" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="92" letter-spacing="-2" fill="${CREAM}">${esc(title1)}</text>
  <text x="70" y="346" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="92" letter-spacing="-2" fill="${GOLD}">${esc(title2)}</text>

  <text x="72" y="424" font-family="Helvetica, Arial, sans-serif" font-weight="500" font-size="29" fill="${CREAM}" fill-opacity="0.9">${esc(sub1)}</text>
  ${sub2 ? `<text x="72" y="462" font-family="Helvetica, Arial, sans-serif" font-weight="500" font-size="29" fill="${CREAM}" fill-opacity="0.9">${esc(sub2)}</text>` : ''}
  <text x="72" y="510" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="25" fill="${GOLD}">${esc(place)}</text>

  <rect x="72" y="540" width="${36 + pill.length * 14.5}" height="56" rx="6" fill="${GOLD}"/>
  <text x="${72 + (36 + pill.length * 14.5) / 2}" y="577" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="25" letter-spacing="1" fill="#1c1503">${esc(pill)}</text>
</svg>`
}

const SPECS = [
  {
    file: 'og-image.jpg',
    bg: 'public/img/events/principal.jpg',
    eyebrow: '14ª EDICIÓN · 19 Y 20 DE SEPTIEMBRE',
    title1: 'Córdoba',
    title2: 'Corazón de Moda',
    sub1: 'El ecosistema de negocios y tendencias más',
    sub2: 'influyente del interior del país.',
    place: 'Hotel Quinto Centenario · Córdoba',
    pill: 'Registrate gratis',
  },
  {
    file: 'og-app.jpg',
    bg: 'public/img/hero/hero-main.jpg',
    eyebrow: 'LA APP DE CCM 2026',
    title1: 'Tu CCM,',
    title2: 'en una app',
    sub1: 'Tu acceso por QR, tu agenda y las fotos',
    sub2: 'del evento — todo en tu teléfono.',
    place: 'Instalable · funciona sin conexión',
    pill: 'Abrí la app',
  },
  {
    file: 'og-admin.jpg',
    bg: 'public/img/hero/hero-night.jpg',
    eyebrow: 'PANEL DE GESTIÓN · CCM 2026',
    title1: 'Cada interacción,',
    title2: 'un dato propio',
    sub1: 'Inscripciones, entradas, descargas y',
    sub2: 'sponsors medidos en tiempo real.',
    place: 'Reporte de impacto por sponsor',
    pill: 'Ver el panel',
  },
  {
    file: 'og-sponsors.jpg',
    bg: 'public/img/hero/hero-sunset.jpg',
    eyebrow: 'SÉ SPONSOR DE CCM 2026',
    title1: 'Tu marca,',
    title2: 'su mercado',
    sub1: 'Audiencia calificada, exclusividad por',
    sub2: 'rubro y una base que sigue trabajando.',
    place: '+18.000 asistentes · ABC1',
    pill: 'Quiero ser sponsor',
  },
  {
    file: 'og-eventos.jpg',
    bg: 'public/img/events/principal.jpg',
    eyebrow: 'EVENTOS CCM 2026',
    title1: 'El programa',
    title2: 'de la edición',
    sub1: 'Caminos, capacitaciones y las dos galas',
    sub2: 'centrales de la 14ª edición.',
    place: '19 y 20 de septiembre · Córdoba',
    pill: 'Ver la agenda',
  },
]

for (const spec of SPECS) {
  const bg = await sharp(resolve(ROOT, spec.bg))
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .toBuffer()
  await sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg(spec)) }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(resolve(ROOT, 'public', spec.file))
  console.log(`✓ public/${spec.file}`)
}
