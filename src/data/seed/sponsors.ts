import type { Sponsor } from '../types'
import { IDS } from '../ids'

/**
 * Sponsors FICTICIOS de demostración (no hay sponsors confirmados en el PRD;
 * son placeholders editables — ver DECISIONS.md).
 */
export const seedSponsors: Sponsor[] = [
  {
    id: IDS.sponsors.banco,
    name: 'Banco Distrito',
    industry: 'Banca y finanzas',
    level: 'Principal',
    exclusive: true,
    tagline: 'Sponsor principal · exclusividad de rubro',
    creatives: [
      { slot: 'S2', headline: 'Banco Distrito acompaña a la moda de Córdoba', cta: 'Conocer beneficios' },
      { slot: 'S6', headline: 'Con el apoyo de Banco Distrito' },
    ],
  },
  {
    id: IDS.sponsors.beauty,
    name: 'Aura Beauty',
    industry: 'Cosmética',
    level: 'Oro',
    exclusive: false,
    tagline: 'La belleza detrás de cada pasarela',
    creatives: [
      { slot: 'S3', headline: 'Estas fotos llegan gracias a Aura Beauty', cta: 'Descubrir' },
    ],
  },
  {
    id: IDS.sponsors.wines,
    name: 'Terruño Wines',
    industry: 'Bodegas y bebidas',
    level: 'Plata',
    exclusive: false,
    tagline: 'Sabores CCM',
    creatives: [{ slot: 'S2', headline: 'Terruño Wines en Sabores CCM', cta: 'Ver más' }],
  },
]
