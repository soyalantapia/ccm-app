import type { Benefit } from '../types'

/**
 * Beneficios para usuarios registrados. CÓDIGOS PLACEHOLDER — Gastón los reemplaza por
 * los reales que negocia con el hotel / spa / etc. (editable desde el panel). El código
 * se revela solo a quien está inscripto (decisión low-stakes: sin límite de usos).
 */
export const seedBenefits: Benefit[] = [
  {
    id: 'ben-hotel',
    partner: 'Hotel Quinto Centenario',
    category: 'hotel',
    title: 'Tarifa preferencial de alojamiento',
    description: 'Descuento en tu estadía durante CCM 2026 mostrando tu código al reservar.',
    code: 'CCM2026-HOTEL',
    discountLabel: '25% OFF',
    url: 'https://wa.me/5493510000000',
    order: 1,
    active: true,
  },
  {
    id: 'ben-spa',
    partner: 'Spa Rosa Caribe',
    category: 'spa',
    title: 'Circuito de spa con descuento',
    description: 'Reservá tu circuito de relax con beneficio exclusivo para inscriptos.',
    code: 'CCM2026-SPA',
    discountLabel: '15% OFF',
    order: 2,
    active: true,
  },
  {
    id: 'ben-suscripcion',
    partner: 'Socio CCM',
    category: 'suscripcion',
    title: 'Membresía Socio con bonificación',
    description: 'Sumate como Socio CCM y accedé a capacitaciones premium y zona VIP.',
    code: 'CCM2026-SOCIO',
    discountLabel: '20% OFF',
    url: '/membresia',
    order: 3,
    active: true,
  },
  {
    id: 'ben-entradas',
    partner: 'CCM 2026',
    category: 'entradas',
    title: 'Preventa de entradas',
    description: 'Accedé al precio de preventa de las entradas y workshops del evento.',
    code: 'CCM2026-PREVENTA',
    discountLabel: 'Preventa',
    url: '/entradas',
    order: 4,
    active: true,
  },
]
