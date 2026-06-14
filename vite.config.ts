import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

// GitHub Pages SPA fallback: any deep route 404 serves the app shell.
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      copyFileSync(resolve(__dirname, 'dist/index.html'), resolve(__dirname, 'dist/404.html'))
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
