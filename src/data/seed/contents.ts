import type { ContentItem } from '../types'
import { IDS } from '../ids'

/**
 * Videos del canal CCM (youtubeId provistos por el cliente, verificados públicos
 * HTTP 200 el 15/06/2026). Editables desde Admin → Contenido. Se omiten las
 * duraciones (se muestran solo si se cargan) para no exhibir datos incorrectos.
 */
export const seedContents: ContentItem[] = [
  {
    id: 'vid-01',
    type: 'video',
    title: 'Aftermovie CCM 2025',
    description:
      'Lo mejor de la 13ª edición en tres minutos: las 7 plataformas, la pasarela central, los art shows y la energía de un finde que volvió a poner a Córdoba en el mapa de la moda.',
    youtubeId: 'gCwUaYOvxSg',
    platform: 'Moda',
    publishedAt: '2025-10-06',
  },
  {
    id: 'vid-02',
    type: 'video',
    title: 'Backstage · Desfile de las Estrellas',
    description:
      'El detrás de escena de la gala Night VIP: fittings de último minuto, el equipo de beauty a contrarreloj y los diseñadores viendo salir sus colecciones a la pasarela.',
    youtubeId: 'wwyDQNcPoGo',
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
    youtubeId: 'NMC-arZunsc',
    platform: 'Moda',
    publishedAt: '2026-04-15',
  },
]
