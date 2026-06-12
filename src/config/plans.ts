import type { TicketPlan } from '../data/types'

/**
 * Planes de entrada — precios y tiers REALES de la venta vigente en Tikealo
 * (página oficial del evento, 06/2026). Los links de Mercado Pago siguen
 * siendo placeholder editables desde Admin → Entradas y órdenes.
 */
export const MP_PLACEHOLDER = 'https://www.mercadopago.com.ar'

export const seedPlans: TicketPlan[] = [
  {
    id: 'sab-general',
    name: 'Sábado · Primera Pasada',
    tagline: 'Acreditación general · sábado 19 · 9 a 21 hs',
    price: 0,
    serviceCharge: 0,
    mpLink: null,
    day: 'sabado',
    kind: 'general',
    perks: [
      'Acceso a las 7 plataformas',
      '+100 stands interactivos',
      'Pasarelas Primavera/Verano y art shows',
      'Workshops, degustaciones y networking',
    ],
  },
  {
    id: 'sab-night-vip',
    name: 'Sábado · Night VIP',
    tagline: 'Desfile de las Estrellas · 19 a 21 hs',
    price: 30000,
    serviceCharge: 3000,
    mpLink: MP_PLACEHOLDER,
    day: 'sabado',
    kind: 'vip',
    preventa: true,
    featured: true,
    perks: [
      'Desfile de las Estrellas en la pasarela central',
      'Música en vivo, degustaciones y show',
      'Ubicación preferencial frente a pasarela',
      'Hospitality premium',
    ],
  },
  {
    id: 'combo-vip',
    name: 'Combo VIP · Sábado + Domingo',
    tagline: 'Desfile de las Estrellas + Desfile Internacional',
    price: 50000,
    serviceCharge: 5000,
    mpLink: MP_PLACEHOLDER,
    day: 'combo',
    kind: 'vip',
    perks: [
      'Desfile de las Estrellas · sábado 19 a 21 hs',
      'Desfile Internacional · domingo 18 a 20 hs',
      'Música en vivo, degustaciones y shows ambas noches',
      'La experiencia completa de la 14ª edición',
    ],
  },
  {
    id: 'dom-general',
    name: 'Domingo · Primera Pasada',
    tagline: 'Acreditación general · domingo 20 · 9 a 20 hs',
    price: 0,
    serviceCharge: 0,
    mpLink: null,
    day: 'domingo',
    kind: 'general',
    perks: [
      'Acceso a las 7 plataformas',
      '+100 stands interactivos',
      'Pasarelas Primavera/Verano y art shows',
      'Workshops, degustaciones y networking',
    ],
  },
  {
    id: 'dom-sunset-vip',
    name: 'Domingo · Sunset VIP',
    tagline: 'Desfile Internacional · 18 a 20 hs',
    price: 30000,
    serviceCharge: 3000,
    mpLink: MP_PLACEHOLDER,
    day: 'domingo',
    kind: 'vip',
    preventa: true,
    perks: [
      'Desfile Internacional en la pasarela central',
      'Música en vivo, degustaciones y show',
      'Ubicación preferencial frente a pasarela',
      'Hospitality premium',
    ],
  },
]
