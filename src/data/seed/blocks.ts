import type { EventBlock } from '../types'
import { IDS } from '../ids'

export const seedBlocks: EventBlock[] = [
  {
    id: 'blk-c18-1',
    eventId: IDS.events.camino18,
    title: 'Charla de apertura',
    kind: 'Charla',
    day: '18/06',
    start: '17:00',
    end: '17:45',
    room: 'Salón Principal',
    capacity: 80,
    seedTaken: 32,
    speakers: ['Equipo CCM'],
  },
  {
    id: 'blk-c18-2',
    eventId: IDS.events.camino18,
    title: 'Masterclass',
    kind: 'Masterclass',
    day: '18/06',
    start: '18:00',
    end: '18:45',
    room: 'Sala Atelier',
    capacity: 40,
    seedTaken: 40, // Completo (demo DoD #3)
    speakers: ['Invitada especial'],
  },
]
