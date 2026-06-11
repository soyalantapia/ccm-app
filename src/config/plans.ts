import type { TicketPlan } from '../data/types'

/**
 * Planes de entrada (PRD §6.2). Precios VIP y links de Mercado Pago son
 * [PENDIENTE] → placeholders editables desde Admin → Entradas y órdenes.
 * El link placeholder apunta a Mercado Pago para que la redirección de la
 * demo aterrice en una página real de MP.
 */
export const MP_PLACEHOLDER = 'https://www.mercadopago.com.ar'

export const seedPlans: TicketPlan[] = [
  {
    id: 'general',
    name: 'Entrada General',
    tagline: 'Gratis con inscripción previa obligatoria',
    price: 0,
    mpLink: null,
    perks: [
      'Acceso a las 7 plataformas',
      '+100 stands interactivos',
      'Pasarelas, art shows y activaciones en vivo',
      'Charlas y masterclasses (según cupo)',
      'Networking y coworking',
      'Estacionamiento sin cargo en Shopping Nuevo Centro',
    ],
  },
  {
    id: 'night-vip',
    name: 'Night VIP',
    tagline: 'Desfile de las Estrellas · sábado 19 · 19 a 21 hs',
    price: null,
    mpLink: MP_PLACEHOLDER,
    featured: true,
    perks: [
      'Todo lo de la Entrada General',
      'Night VIP + Desfile de las Estrellas',
      'Ubicación preferencial frente a pasarela',
      'Hospitality premium',
    ],
  },
  {
    id: 'sunset-vip',
    name: 'Sunset VIP',
    tagline: 'Desfile Internacional · domingo 20 · 18 a 20 hs',
    price: null,
    mpLink: MP_PLACEHOLDER,
    perks: [
      'Todo lo de la Entrada General',
      'Sunset VIP + Desfile Internacional',
      'Ubicación preferencial frente a pasarela',
      'Hospitality premium',
    ],
  },
]
