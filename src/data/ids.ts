/**
 * IDs y slugs canónicos — contrato compartido entre seed, páginas y admin.
 * No cambiar sin actualizar el seed.
 */
export const IDS = {
  events: {
    principal: 'ev-principal-2026',
    camino18: 'ev-camino-18-06',
    camino30: 'ev-camino-30-06',
  },
  slugs: {
    principal: 'ccm-2026',
    camino18: 'camino-a-ccm-18-06',
    camino30: 'camino-a-ccm-30-06',
  },
  gallery: { camino: 'gal-camino-marzo' },
  gallerySlugs: { camino: 'camino-a-ccm-marzo' },
  convocatoria: { camino: 'conv-camino-2026' },
  convocatoriaSlugs: { camino: 'camino-a-ccm' },
  sponsors: {
    banco: 'sp-banco-distrito',
    beauty: 'sp-aura-beauty',
    wines: 'sp-terrunio-wines',
  },
} as const
