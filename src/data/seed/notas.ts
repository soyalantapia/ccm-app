import type { Nota } from '../types'

/**
 * Notas / novedades editoriales. PLACEHOLDER — las carga y edita prensa desde el panel
 * (semanal, "como noticias"). Pueden llevar un video embebido.
 */
export const seedNotas: Nota[] = [
  {
    id: 'nota-apertura',
    slug: 'ccm-2026-abre-inscripciones',
    title: 'CCM 2026 abre las inscripciones de su 14ª edición',
    excerpt: 'La cita más influyente de la moda y los negocios del interior vuelve el 19 y 20 de septiembre al Hotel Quinto Centenario.',
    body: 'Córdoba Corazón de Moda confirma su 14ª edición para el 19 y 20 de septiembre de 2026 en el Hotel Quinto Centenario.\n\nDos jornadas que reúnen a diseñadores, artistas, marcas y público en un mismo ecosistema: pasarelas, capacitaciones, stands y experiencias de gala.\n\nLa inscripción es gratuita con cupo previo. Las entradas VIP para las galas y los workshops premium ya están disponibles en preventa.',
    cover: 'img/gallery/g03.jpg',
    author: 'Prensa CCM',
    category: 'evento',
    published: true,
    publishedAt: '2026-06-20',
    order: 1,
  },
  {
    id: 'nota-belleza',
    slug: 'belleza-la-plataforma-que-crece',
    title: 'Belleza, la plataforma que más crece en CCM',
    excerpt: 'Maquillaje editorial, skincare de autor y marcas del interior: la plataforma de Belleza se consolida como un mercado propio.',
    body: 'La plataforma de Belleza de CCM volvió a sorprender. Marcas de skincare de autor, maquilladores editoriales y propuestas de bienestar comparten un espacio que cada año suma más público y más negocios.\n\nEn esta edición habrá demos en vivo, masterclasses y un espacio de descuentos exclusivos para los inscriptos.',
    cover: 'img/gallery/g07.jpg',
    author: 'Prensa CCM',
    category: 'belleza',
    youtubeId: 'cPRpNqmziUs',
    published: true,
    publishedAt: '2026-06-22',
    order: 2,
  },
]
