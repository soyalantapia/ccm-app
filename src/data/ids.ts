/**
 * IDs y slugs canónicos — contrato compartido entre seed, páginas y admin.
 * No cambiar sin actualizar el seed.
 */
export const IDS = {
  events: {
    principal: 'ev-principal-2026',
    camino18: 'ev-camino-18-06',
    camino30: 'ev-camino-30-06',
    capacitacionMayo: 'ev-cap-mayo-2026',
  },
  slugs: {
    principal: 'ccm-2026',
    camino18: 'camino-a-ccm-18-06',
    camino30: 'camino-a-ccm-30-06',
    capacitacionMayo: 'taller-marca-de-autor',
  },
  gallery: {
    camino: 'gal-camino-marzo',
    capacitacionMayo: 'gal-taller-mayo',
    caminoAbril: 'gal-camino-abril',
    desfileGala: 'gal-desfile-gala-2025',
  },
  gallerySlugs: {
    camino: 'camino-a-ccm-marzo',
    capacitacionMayo: 'taller-marca-de-autor-mayo',
    caminoAbril: 'camino-a-ccm-abril',
    desfileGala: 'desfile-gala-ccm-2025',
  },
  convocatoria: { camino: 'conv-camino-2026' },
  convocatoriaSlugs: { camino: 'camino-a-ccm' },
  sponsors: {
    banco: 'sp-banco-distrito',
    beauty: 'sp-aura-beauty',
    wines: 'sp-terrunio-wines',
    eyewear: 'sp-vialux-eyewear',
  },
} as const
