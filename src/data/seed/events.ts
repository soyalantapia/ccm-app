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
      'Dos jornadas para recorrer las 7 plataformas del ecosistema —Moda, Belleza, Turismo, Arte, Gastronomía, Tecnología y Sustentabilidad— con +100 stands interactivos, +10 charlas temáticas, masterclasses de 45 minutos, art shows y activaciones en vivo. La pasarela, con dirección artística de Néstor Moio, corona cada jornada: Night VIP + Desfile de las Estrellas el sábado y Sunset VIP + Desfile Internacional el domingo. El viernes, Cóctel de Negocios B2B (Inner Circle) reúne a marcas y sponsors; Hospitality premium acompaña ambas jornadas y los Premios Internacionales suman más de 100 premiados. Entrada general gratuita con inscripción previa obligatoria: sin inscripción no se ingresa. Cupos limitados. Estacionamiento sin cargo en Shopping Nuevo Centro.',
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
