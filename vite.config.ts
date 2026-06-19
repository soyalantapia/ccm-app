import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SITE = 'https://soyalantapia.github.io/ccm-app'

/**
 * Rutas con preview propio al compartir (WhatsApp/redes). Como WhatsApp lee los
 * meta OG del HTML estático SIN ejecutar JS, prerenderizamos un `<ruta>.html`
 * por sección con su título/descripción/imagen. GitHub Pages sirve `/ruta` desde
 * `ruta.html` con HTTP 200 (el link profundo deja de ser un 404 sin preview).
 */
const OG_ROUTES = [
  { path: 'app', title: 'La app de CCM 2026', desc: 'Tu acceso por QR, tu agenda y las fotos del evento — todo en tu teléfono. Instalable y sin conexión.', img: 'og-app.jpg', alt: 'La app de Córdoba Corazón de Moda' },
  { path: 'admin', title: 'Panel CCM · El dato propio', desc: 'Inscripciones, entradas, descargas y sponsors medidos en tiempo real. Reporte de impacto por sponsor.', img: 'og-admin.jpg', alt: 'Panel de gestión de Córdoba Corazón de Moda' },
  { path: 'sponsors', title: 'Sé sponsor de CCM 2026', desc: 'Audiencia calificada, exclusividad por rubro y una base de datos propia que sigue trabajando post-evento.', img: 'og-sponsors.jpg', alt: 'Sponsors de Córdoba Corazón de Moda' },
  { path: 'eventos', title: 'Eventos · CCM 2026', desc: 'Caminos, capacitaciones y las dos galas centrales de la 14ª edición. 19 y 20 de septiembre, Córdoba.', img: 'og-eventos.jpg', alt: 'Eventos de Córdoba Corazón de Moda' },
  { path: 'entradas', title: 'Entradas · CCM 2026', desc: 'Entrada general gratis con inscripción. Experiencias VIP Night, Sunset y el combo de las dos noches.', img: 'og-eventos.jpg', alt: 'Entradas de Córdoba Corazón de Moda' },
]

// GitHub Pages SPA fallback (404 → app shell) + previews OG por ruta.
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      const distIndex = resolve(__dirname, 'dist/index.html')
      const base = readFileSync(distIndex, 'utf8')
      copyFileSync(distIndex, resolve(__dirname, 'dist/404.html'))

      const setAttr = (html: string, re: RegExp, value: string) =>
        html.replace(re, (_m, p1, p2) => `${p1}${value}${p2}`)

      for (const r of OG_ROUTES) {
        let html = base
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${r.title}</title>`)
        html = setAttr(html, /(<meta name="description" content=")[^"]*(")/, r.desc)
        html = setAttr(html, /(<meta property="og:title" content=")[^"]*(")/, r.title)
        html = setAttr(html, /(<meta property="og:description" content=")[^"]*(")/, r.desc)
        html = setAttr(html, /(<meta property="og:url" content=")[^"]*(")/, `${SITE}/${r.path}`)
        html = setAttr(html, /(<meta property="og:image:alt" content=")[^"]*(")/, r.alt)
        html = setAttr(html, /(<meta name="twitter:title" content=")[^"]*(")/, r.title)
        html = setAttr(html, /(<meta name="twitter:description" content=")[^"]*(")/, r.desc)
        html = html.split('og-image.jpg').join(r.img) // og:image, secure_url, twitter:image
        writeFileSync(resolve(__dirname, 'dist', `${r.path}.html`), html)
      }
    },
  }
}

export default defineConfig({
  base: '/ccm-app/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' (no 'autoUpdate'): el SW nuevo queda en espera y el banner
      // UpdatePrompt dispara needRefresh → "Actualizar" controlado, sin swap
      // silencioso de assets en media demo (ver auditoría).
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'favicon.svg', 'favicon.png', 'og-image.jpg'],
      manifest: {
        name: 'Córdoba Corazón de Moda',
        short_name: 'CCM',
        description:
          'El Ecosistema de Negocios y Tendencias más influyente del interior del país. 14ª Edición · 19 y 20 de septiembre de 2026.',
        lang: 'es-AR',
        dir: 'ltr',
        start_url: '/ccm-app/',
        scope: '/ccm-app/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4EFE3',
        theme_color: '#181410',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/ccm-app/index.html',
        // El fallback a index.html es solo para navegaciones: nunca para los
        // chunks/asset. Si un asset se pide durante la propagación de un deploy,
        // que vaya a la red (y lo recupere [[lazyWithReload]]), no que reciba HTML.
        navigateFallbackDenylist: [/^\/ccm-app\/assets\//],
        // Shell offline: JS/CSS/fonts/icons precached. Photos are runtime-cached
        // (CacheFirst) so the install stays light but viewed images work offline.
        globPatterns: ['**/*.{js,css,html,woff2,svg}', 'icons/*.png'],
        globIgnores: ['img/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'ccm-images',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Reel del hero: no se precachea (pesa ~2,7MB) pero se guarda al primer
            // play (CacheFirst + range requests) → instantáneo y offline después.
            urlPattern: ({ request }) => request.destination === 'video',
            handler: 'CacheFirst',
            options: {
              cacheName: 'ccm-video',
              rangeRequests: true,
              cacheableResponse: { statuses: [0, 200, 206] },
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
    spaFallback(),
  ],
})
