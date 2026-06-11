import type { Application } from '../types'
import { IDS } from '../ids'

/**
 * Postulaciones FICTICIAS al "Camino a CCM 2026" en distintos estados,
 * con las keys EXACTAS del form real (PRD §10.3): historia, nombre, dni,
 * telefono, email, instagram, portfolio, acompanante, acompananteDatos,
 * desfile, extra.
 */
export const seedApplications: Application[] = [
  {
    id: 'app-seed-01',
    convocatoriaId: IDS.convocatoria.camino,
    ts: '2026-06-10T11:42:00-03:00',
    status: 'preinscripta',
    fromSeed: true,
    data: {
      historia:
        'Soy Milagros, diseñadora emergente de Córdoba. Hace dos años dejé mi trabajo en una fábrica textil para armar mi propia marca de sastrería femenina. Coso todo en mi taller de barrio General Paz y vendo por Instagram. Siento que mi colección ya está lista para una pasarela de verdad y CCM es el lugar donde quiero mostrarla.',
      nombre: 'Milagros Soria',
      dni: '38456120',
      telefono: '+54 351 615-2284',
      email: 'milagros.soria.disenio@gmail.com',
      instagram: 'https://instagram.com/milisoria.studio',
      portfolio: 'https://drive.google.com/drive/folders/milisoria-coleccion',
      acompanante: 'Solo',
      desfile: 'No',
      extra: 'Tengo lista una cápsula de 8 looks. Puedo llevar percheros propios si hace falta.',
    },
  },
  {
    id: 'app-seed-02',
    convocatoriaId: IDS.convocatoria.camino,
    ts: '2026-06-07T19:18:00-03:00',
    status: 'aceptada',
    decidedAt: '2026-06-09T10:35:00-03:00',
    fromSeed: true,
    data: {
      historia:
        'Soy Bautista, modelo de Río Cuarto. Arranqué hace tres años en producciones locales y el año pasado desfilé en dos eventos en Córdoba capital. Mido 1,88 y tengo disponibilidad completa para los fittings. Quiero sumarme al circuito CCM porque es la vidriera más grande que hay en el interior.',
      nombre: 'Bautista Vega',
      dni: '42103857',
      telefono: '+54 358 422-7719',
      email: 'bautivega.model@gmail.com',
      instagram: 'https://instagram.com/bautivega',
      acompanante: 'Solo',
      desfile: 'Sí',
      extra: 'Book actualizado en el perfil de Instagram, carpeta destacada "Pasarela".',
    },
  },
  {
    id: 'app-seed-03',
    convocatoriaId: IDS.convocatoria.camino,
    ts: '2026-06-09T16:05:00-03:00',
    status: 'preinscripta',
    fromSeed: true,
    data: {
      historia:
        'Me llamo Carla y soy artista textil de Villa María. Trabajo bordado experimental sobre prendas recuperadas: cada pieza cuenta la historia de la persona que la usó antes. Expuse en el Centro Cultural de mi ciudad y quiero que mi obra dialogue con la moda en un evento como CCM.',
      nombre: 'Carla Moyano',
      dni: '35780442',
      telefono: '+54 353 481-9036',
      email: 'carlamoyano.textil@gmail.com',
      instagram: 'https://instagram.com/carlamoyano.borda',
      portfolio: 'https://carlamoyano.myportfolio.com',
      acompanante: 'Con acompañante',
      acompananteDatos: 'Andrés Moyano, DNI 33215677',
      desfile: 'No',
      extra: 'Mi acompañante es mi hermano, me ayuda con el montaje de las piezas.',
    },
  },
  {
    id: 'app-seed-04',
    convocatoriaId: IDS.convocatoria.camino,
    ts: '2026-06-06T21:50:00-03:00',
    status: 'aceptada',
    decidedAt: '2026-06-08T09:12:00-03:00',
    fromSeed: true,
    data: {
      historia:
        'Soy Gonzalo, fotógrafo de moda de Rosario. Hace cinco años cubro desfiles y editoriales para marcas del litoral y quiero empezar a trabajar con el ecosistema cordobés. Me interesa documentar el backstage de los Caminos: creo que ahí está la historia real del evento.',
      nombre: 'Gonzalo Ribero',
      dni: '36901284',
      telefono: '+54 341 528-6643',
      email: 'gonzaribero.foto@gmail.com',
      instagram: 'https://instagram.com/gonzaribero.foto',
      portfolio: 'https://gonzaloribero.com',
      acompanante: 'Solo',
      desfile: 'No',
      extra: 'Llevo equipo propio. Puedo compartir el material con la organización.',
    },
  },
  {
    id: 'app-seed-05',
    convocatoriaId: IDS.convocatoria.camino,
    ts: '2026-06-07T14:27:00-03:00',
    status: 'rechazada',
    decidedAt: '2026-06-10T17:40:00-03:00',
    fromSeed: true,
    data: {
      historia:
        'Soy Verónica, dueña de una marca de indumentaria deportiva de Salta. Vendemos por mayor a tiendas de todo el NOA y queremos abrir el canal minorista en Córdoba. Nos interesa participar del desfile para presentar la línea nueva.',
      nombre: 'Verónica Lencina',
      dni: '29844510',
      telefono: '+54 387 415-8821',
      email: 'veronica@lencinasport.com.ar',
      instagram: 'https://instagram.com/lencinasport',
      acompanante: 'Con acompañante',
      acompananteDatos: 'Pablo Issa, DNI 28733904',
      desfile: 'No',
      extra: 'También nos interesa información sobre stands comerciales para septiembre.',
    },
  },
  {
    id: 'app-seed-06',
    convocatoriaId: IDS.convocatoria.camino,
    ts: '2026-06-11T09:33:00-03:00',
    status: 'preinscripta',
    fromSeed: true,
    data: {
      historia:
        'Soy Abril, estudiante de Diseño de Indumentaria en la UPC, último año. Mi tesis es una colección inspirada en la arquitectura de Córdoba: líneas jesuíticas y hormigón brutalista llevados al textil. Sería mi primera vez en un evento grande y me encantaría aprender desde adentro.',
      nombre: 'Abril Domínguez',
      dni: '44567893',
      telefono: '+54 351 730-4456',
      email: 'abrildominguez.di@gmail.com',
      instagram: 'https://instagram.com/abril.dmz',
      acompanante: 'Solo',
      desfile: 'No',
    },
  },
]
