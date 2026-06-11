import type { EventItem } from '../types'
import { IDS } from '../ids'
import { config } from '../../config'

export const seedEvents: EventItem[] = [
  {
    id: IDS.events.principal,
    slug: IDS.slugs.principal,
    type: 'principal',
    title: 'CCM 2026 · 14ª Edición',
    subtitle: config.claim,
    dateLabel: '19 y 20 de septiembre',
    startDate: '2026-09-19',
    timeLabel: '9 a 21 hs',
    venue: config.venue.name,
    address: config.venue.address,
    mapsUrl: config.venue.mapsUrl,
    description:
      'Dos jornadas con las 7 plataformas, +100 stands interactivos, pasarelas, masterclasses, art shows y las galas Night VIP y Sunset VIP.',
    cover: 'img/events/principal.jpg',
  },
  {
    id: IDS.events.camino18,
    slug: IDS.slugs.camino18,
    type: 'camino',
    title: 'Camino a CCM · Junio',
    subtitle: 'Encuentro previo del ecosistema',
    dateLabel: 'Jueves 18 de junio',
    startDate: '2026-06-18',
    timeLabel: '17 a 21 hs',
    venue: config.venue.name,
    address: config.venue.address,
    mapsUrl: config.venue.mapsUrl,
    description: 'Encuentro previo con charlas, networking y desfile cápsula.',
    cover: 'img/events/camino-18.jpg',
  },
  {
    id: IDS.events.camino30,
    slug: IDS.slugs.camino30,
    type: 'camino',
    title: 'Camino a CCM · Cierre de junio',
    subtitle: 'Encuentro previo del ecosistema',
    dateLabel: 'Martes 30 de junio',
    startDate: '2026-06-30',
    timeLabel: '17 a 21 hs',
    venue: config.venue.name,
    address: config.venue.address,
    mapsUrl: config.venue.mapsUrl,
    description: 'Segundo encuentro del mes rumbo a la 14ª edición.',
    cover: 'img/events/camino-30.jpg',
  },
]
