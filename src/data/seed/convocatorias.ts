import type { Convocatoria } from '../types'
import { IDS } from '../ids'

/**
 * Plantilla seed = formulario REAL "Camino a CCM 2026" (PRD §10.3).
 * Los campos son exactos al form vigente; no agregar ni quitar.
 */
/* ⚠️ Gateado a DEV a propósito: en un build de producción este literal NO se compila.
 * Antes viajaba adentro del bundle y RemoteDataStore caía acá al fallar la hidratación,
 * así que con la red mala la app mostraba contenido inventado como si fuera real —
 * y cargaba impecable, porque el service worker precachea el shell. Ver el docstring de
 * RemoteDataStore. Si necesitás la demo, corré `npm run dev`. */
export const seedConvocatorias: Convocatoria[] = import.meta.env.DEV ? [
  {
    id: IDS.convocatoria.camino,
    slug: IDS.convocatoriaSlugs.camino,
    title: 'Camino a CCM 2026',
    intro:
      'Queremos conocerte. Contanos tu historia y sumate a los encuentros que nos llevan a la 14ª edición. La respuesta te deja preinscripto: el equipo CCM confirma tu lugar. Vení con tu mejor LOOK 🖤',
    deadline: '2026-06-16',
    eventId: IDS.events.camino18,
    fields: [
      {
        key: 'historia',
        label: 'Tu historia',
        type: 'textarea',
        required: true,
        placeholder: 'Contanos quién sos, qué hacés y por qué querés ser parte',
      },
      { key: 'nombre', label: 'Nombre y Apellido', type: 'text', required: true },
      { key: 'dni', label: 'DNI', type: 'text', required: true, placeholder: 'Sin puntos' },
      {
        key: 'telefono',
        label: 'Teléfono para confirmar invitación',
        type: 'tel',
        required: true,
        placeholder: '+54 351 ...',
      },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'instagram', label: 'Link de Instagram', type: 'url', required: false, placeholder: 'https://instagram.com/...' },
      { key: 'portfolio', label: 'Portfolio', type: 'url', required: false, placeholder: 'Link a tu portfolio o drive' },
      {
        key: 'acompanante',
        label: '¿Venís solo o con acompañante?',
        type: 'select',
        required: true,
        options: ['Solo', 'Con acompañante'],
        help: 'Máximo 1 acompañante',
      },
      {
        key: 'acompananteDatos',
        label: 'Acompañante: nombre completo y DNI',
        type: 'text',
        required: false,
        showIf: { key: 'acompanante', equals: 'Con acompañante' },
      },
      {
        key: 'desfile',
        label: '¿Participaste de algún desfile?',
        type: 'select',
        required: true,
        options: ['Sí', 'No'],
      },
      {
        key: 'extra',
        label: 'Algo más que quieras que sepamos de vos',
        type: 'textarea',
        required: false,
      },
    ],
  },
] : []
