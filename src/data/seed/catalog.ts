import type { CatalogProfile } from '../types'

export const seedCatalog: CatalogProfile[] = [
  {
    id: 'cat-01',
    slug: 'persona-01',
    name: 'Perfil de ejemplo',
    role: 'Diseñadora',
    platform: 'Moda',
    city: 'Córdoba',
    bio: 'Stub — el seed real se carga en la fase de contenido.',
    photo: 'img/people/p01.jpg',
    verified: true,
    participatesIn: ['CCM 2026'],
    portfolio: [{ id: 'cat-01-1', image: 'img/portfolio/p01-1.jpg', title: 'Pieza 1' }],
  },
]
