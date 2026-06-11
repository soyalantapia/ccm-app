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
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
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
        ],
      },
    }),
    spaFallback(),
  ],
})
