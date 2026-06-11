import type { Gallery } from '../types'
import { IDS } from '../ids'

export const seedGalleries: Gallery[] = [
  {
    id: IDS.gallery.camino,
    slug: IDS.gallerySlugs.camino,
    title: 'Camino a CCM · Marzo',
    eventLabel: 'Camino a CCM',
    date: 'Marzo 2026',
    cover: 'img/gallery/g01.jpg',
    sponsorId: IDS.sponsors.beauty,
    photos: [{ id: 'ph-01', src: 'img/gallery/g01.jpg', alt: 'Foto del evento' }],
  },
]
