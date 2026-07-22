import type { Banner } from '../types'

/**
 * Banners gestionados de ejemplo (los carga marketing desde el panel). PLACEHOLDER:
 * imágenes y destinos reales los pone el equipo. `fixed` = principal siempre visible;
 * el resto del slot rota. El destino (wa.me / link / form) lo da el cliente.
 */
/* ⚠️ Gateado a DEV a propósito: en un build de producción este literal NO se compila.
 * Antes viajaba adentro del bundle y RemoteDataStore caía acá al fallar la hidratación,
 * así que con la red mala la app mostraba contenido inventado como si fuera real —
 * y cargaba impecable, porque el service worker precachea el shell. Ver el docstring de
 * RemoteDataStore. Si necesitás la demo, corré `npm run dev`. */
export const seedBanners: Banner[] = import.meta.env.DEV ? [
  {
    id: 'bnr-home-principal',
    slot: 'home',
    brand: 'Banco Distrito',
    image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=70',
    alt: 'Banco Distrito — financiá tu marca de autor',
    destinationType: 'link',
    destinationUrl: 'https://www.bancodistrito.example',
    fixed: true,
    order: 1,
    active: true,
  },
  {
    id: 'bnr-home-rot-1',
    slot: 'home',
    brand: 'Aura Beauty',
    image: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1200&q=70',
    alt: 'Aura Beauty en CCM 2026',
    destinationType: 'whatsapp',
    destinationUrl: 'https://wa.me/5493510000000',
    fixed: false,
    order: 2,
    active: true,
  },
  {
    id: 'bnr-home-rot-2',
    slot: 'home',
    brand: 'Terruño Wines',
    image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&q=70',
    alt: 'Terruño Wines — vinos de autor',
    destinationType: 'link',
    destinationUrl: 'https://terruno.example',
    fixed: false,
    order: 3,
    active: true,
  },
] : []
