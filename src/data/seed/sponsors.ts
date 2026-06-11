import type { Sponsor } from '../types'
import { IDS } from '../ids'

/**
 * Sponsors FICTICIOS de demostración (no hay sponsors confirmados en el PRD;
 * son placeholders editables — ver DECISIONS.md). Niveles y exclusividad por
 * rubro según la estructura comercial del deck (D20).
 */
export const seedSponsors: Sponsor[] = [
  {
    id: IDS.sponsors.banco,
    name: 'Banco Distrito',
    industry: 'Banca y finanzas',
    level: 'Principal',
    exclusive: true,
    tagline: 'El banco que invierte en la industria creativa del interior',
    creatives: [
      {
        slot: 'S2',
        headline: 'Tu marca de autor también es un negocio. Banco Distrito la financia.',
        sub: 'Créditos y cuentas pensados para emprendedores del ecosistema CCM.',
        cta: 'Conocer beneficios',
      },
      {
        slot: 'S2',
        headline: 'Pagá tu entrada VIP en cuotas con Banco Distrito',
        sub: 'Beneficios exclusivos para clientes durante las dos jornadas de CCM 2026.',
        cta: 'Ver promociones',
      },
      {
        slot: 'S6',
        headline: 'Tu acreditación llega con el apoyo de Banco Distrito',
      },
    ],
  },
  {
    id: IDS.sponsors.beauty,
    name: 'Aura Beauty',
    industry: 'Cosmética y skincare',
    level: 'Oro',
    exclusive: false,
    tagline: 'La belleza que se ve en cada pasarela empieza en el backstage',
    creatives: [
      {
        slot: 'S3',
        headline: 'Estas fotos brillan gracias a Aura Beauty',
        sub: 'La línea de maquillaje oficial del backstage CCM. Descargá tu foto y descubrí el look.',
        cta: 'Descubrir la línea',
      },
      {
        slot: 'S2',
        headline: 'El look de pasarela, ahora en tu neceser',
        sub: 'Aura Beauty presenta la colección cápsula inspirada en CCM 2026.',
        cta: 'Ver colección',
      },
    ],
  },
  {
    id: IDS.sponsors.wines,
    name: 'Terruño Wines',
    industry: 'Bodegas y bebidas',
    level: 'Plata',
    exclusive: false,
    tagline: 'Vinos de bodegas boutique para brindar por el diseño argentino',
    creatives: [
      {
        slot: 'S2',
        headline: 'Sabores CCM se brinda con Terruño Wines',
        sub: 'Degustación de varietales boutique en el Espacio Sabores, ambas jornadas.',
        cta: 'Ver la barra',
      },
      {
        slot: 'S6',
        headline: 'Terruño Wines acompaña tu experiencia CCM',
      },
    ],
  },
]
