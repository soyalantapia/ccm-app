import type { ContentItem } from '../types'
import { IDS } from '../ids'

/**
 * Videos de demo ([PENDIENTE] PRD §18 — se reemplazan por los del canal CCM).
 * Los youtubeId son videos REALES y públicos de moda, verificados el 11/06/2026
 * (thumbnail HTTP 200) como placeholders editables:
 *  - cPRpNqmziUs → "Lakme Fashion Week 2025 Aftermovie"
 *  - vSCRU099FxU → "Backstage Fashion Show Spring-Summer 2025 | Isabel Marant"
 *  - -s67SZf46gU → "Examining 20 Years of Fashion's Influencer Economy | BoF Voices 2025"
 */
export const seedContents: ContentItem[] = [
  {
    id: 'vid-01',
    type: 'video',
    title: 'Aftermovie CCM 2025',
    description:
      'Lo mejor de la 13ª edición en tres minutos: las 7 plataformas, la pasarela central, los art shows y la energía de un finde que volvió a poner a Córdoba en el mapa de la moda.',
    youtubeId: 'cPRpNqmziUs',
    duration: '3:12',
    platform: 'Moda',
    publishedAt: '2025-10-06',
  },
  {
    id: 'vid-02',
    type: 'video',
    title: 'Backstage · Desfile de las Estrellas',
    description:
      'El detrás de escena de la gala Night VIP: fittings de último minuto, el equipo de beauty a contrarreloj y los diseñadores viendo salir sus colecciones a la pasarela.',
    youtubeId: 'vSCRU099FxU',
    duration: '4:45',
    platform: 'Belleza',
    sponsorId: IDS.sponsors.beauty,
    publishedAt: '2025-09-28',
  },
  {
    id: 'vid-03',
    type: 'video',
    title: 'Masterclass: el negocio detrás de la pasarela',
    description:
      'Cómo se construye una marca de moda rentable desde el interior: precios, canales y comunidad. La charla más pedida del último Camino a CCM, completa y sin cortes.',
    youtubeId: '-s67SZf46gU',
    duration: '42:30',
    platform: 'Moda',
    publishedAt: '2026-04-15',
  },
]
