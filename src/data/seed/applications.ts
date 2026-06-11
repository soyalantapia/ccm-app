import type { Application } from '../types'
import { IDS } from '../ids'

/** Postulaciones de ejemplo en distintos estados (stub — el seed real amplía). */
export const seedApplications: Application[] = [
  {
    id: 'app-seed-01',
    convocatoriaId: IDS.convocatoria.camino,
    ts: '2026-06-08T14:22:00-03:00',
    status: 'preinscripta',
    fromSeed: true,
    data: {
      historia: 'Diseñadora emergente de Córdoba.',
      nombre: 'Ejemplo Stub',
      dni: '30111222',
      telefono: '+54 351 555-0000',
      email: 'stub@example.com',
      acompanante: 'Solo',
      desfile: 'No',
    },
  },
]
