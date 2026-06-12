import type { EventItem } from '../types'
import { IDS } from '../ids'
import { config } from '../../config'

export const seedEvents: EventItem[] = [
  {
    id: IDS.events.principal,
    slug: IDS.slugs.principal,
    type: 'principal',
    title: 'Expo Córdoba Corazón de Moda',
    subtitle: config.claim,
    dateLabel: '19 y 20 de septiembre',
    startDate: '2026-09-19',
    timeLabel: 'Sáb 9 a 21 hs · Dom 9 a 20 hs',
    venue: config.venue.name,
    address: config.venue.address,
    mapsUrl: config.venue.mapsUrl,
    description:
      'Córdoba Corazón de Moda 2026 es la exposición internacional más relevante de Latinoamérica que integra moda, belleza, turismo, gastronomía, arte, tecnología y sostenibilidad en una experiencia única. En su 14ª edición, el evento reúne durante dos días a diseñadores, marcas, empresarios, artistas y referentes nacionales e internacionales, consolidando a Córdoba como un polo creativo y de negocios con proyección global. Con un fuerte enfoque en networking y generación de oportunidades comerciales, conecta profesionales, empresas y público en un entorno dinámico y de alto impacto.',
    cover: 'img/events/principal.jpg',
    sponsorIds: [IDS.sponsors.banco, IDS.sponsors.beauty, IDS.sponsors.wines],
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
    description:
      'Una tarde para que el ecosistema se encuentre antes de la 14ª edición: charla de apertura con protagonistas de la industria, masterclass de 45 minutos en formato íntimo, ronda de networking entre diseñadores, marcas y prensa, y un desfile cápsula que adelanta lo que se viene en septiembre. Es la puerta de entrada al circuito CCM: acá se conocen los talentos que después brillan en la pasarela central. Cupos limitados por bloque, con inscripción previa. Vení con tu mejor LOOK 🖤',
    cover: 'img/events/camino-18.jpg',
    sponsorIds: [IDS.sponsors.banco, IDS.sponsors.beauty],
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
    description:
      'El segundo encuentro del mes cierra junio con foco en el negocio: una charla sobre cómo se construye una marca desde el interior del país, una masterclass de oficio en formato taller y el desfile cápsula que define qué colecciones siguen camino a la 14ª edición. Pensado para diseñadores, artistas, emprendedores y marcas que quieren ser parte del ecosistema CCM. Cupos limitados por bloque, con inscripción previa.',
    cover: 'img/events/camino-30.jpg',
    sponsorIds: [IDS.sponsors.wines],
  },
]
