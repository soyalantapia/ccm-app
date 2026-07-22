import type { Benefit } from '../types'

/**
 * Beneficios para usuarios registrados. CÓDIGOS PLACEHOLDER — Gastón los reemplaza por
 * los reales que negocia con el hotel / spa / etc. (editable desde el panel). El código
 * se revela solo a quien está inscripto (decisión low-stakes: sin límite de usos).
 */
/* ⚠️ Gateado a propósito: fuera del build de producción. en un build de producción este literal NO se compila.
 * Antes viajaba adentro del bundle y RemoteDataStore caía acá al fallar la hidratación,
 * así que con la red mala la app mostraba contenido inventado como si fuera real —
 * y cargaba impecable, porque el service worker precachea el shell. Ver el docstring de
 * RemoteDataStore. Si necesitás la demo, corré `npm run dev`. */
export const seedBenefits: Benefit[] = !import.meta.env?.PROD ? [
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
  {
    id: 'ben-terruno',
    partner: 'Terruño Wines',
    category: 'gastronomia',
    title: 'Degustación guiada bonificada',
    description: 'Segunda degustación sin cargo en la barra Sabores CCM presentando tu código.',
    code: 'CCM2026-TERRUNO',
    discountLabel: '2x1',
    order: 5,
    active: true,
  },
  {
    id: 'ben-eyewear',
    partner: 'Vialux Eyewear',
    category: 'otro',
    title: 'Descuento en la cápsula CCM',
    description: 'Beneficio exclusivo en la colección cápsula presentada durante el evento.',
    code: 'CCM2026-VIALUX',
    discountLabel: '10% OFF',
    order: 6,
    active: true,
  },
] : []
