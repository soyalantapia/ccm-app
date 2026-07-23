import type { TicketPlan } from '../data/types'
import { IDS } from '../data/ids'

/**
 * Tipos de entrada del EVENTO PRINCIPAL — precios y tiers REALES de la venta vigente
 * (página oficial del evento, 06/2026). El link manual de Mercado Pago se carga desde el panel,
 * adentro de la ficha del evento; sembrado viene vacío a propósito (ver abajo).
 *
 * Van todos con el eventId del principal: desde que las entradas cuelgan de un evento, un plan
 * sin dueño no existe. Los tiers de otros eventos se crean desde el panel, no acá.
 */

/**
 * ⚠️ NO es un link de pago: es la PORTADA de mercadopago.com.ar. No cobra nada.
 *
 * Quedó como marcador de "acá va el link que carga el organizador", pero se usaba como si fuera
 * un cobro: cuando no había checkout real el front redirigía acá y le decía al comprador que su
 * pago se estaba confirmando. El comprador terminaba en la home de MP, sin nada que pagar,
 * creyendo que ya había comprado. Eso es peor que cortar la venta: es mentirle.
 *
 * Se conserva exportado sólo para poder RECONOCERLO y rechazarlo (los planes guardados en el
 * backend o en el localStorage de una demo vieja todavía lo tienen).
 */
export const MP_PLACEHOLDER = 'https://www.mercadopago.com.ar'

/**
 * Única puerta por la que un `mpLink` puede llegar a usarse como cobro.
 *
 * Un link de pago real siempre apunta a ALGO (`mpago.la/2abc9Xy`, `…/checkout/v1/redirect?pref_id=…`).
 * La raíz pelada de un dominio es una portada, no un cobro — con eso alcanza para descartar el
 * placeholder sin casos especiales, y sin invalidar un link propio que el organizador cargó a mano.
 */
export function esLinkDePagoReal(link: string | null | undefined): boolean {
  if (!link || !link.trim()) return false
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  const camino = url.pathname.replace(/\/+$/, '')
  return camino !== '' || url.search !== ''
}

export const seedPlans: TicketPlan[] = [
  {
    id: 'sab-general',
    eventId: IDS.events.principal,
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
    eventId: IDS.events.principal,
    name: 'Sábado · Night VIP',
    tagline: 'Desfile de las Estrellas · 19 a 21 hs',
    price: 30000,
    serviceCharge: 3000,
    // Sin link manual: hasta que el organizador cargue uno real (Admin → Entradas), el cobro
    // sale por el checkout de MP. Antes acá vivía MP_PLACEHOLDER, que no cobra nada.
    mpLink: null,
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
    eventId: IDS.events.principal,
    name: 'Combo VIP · Sábado + Domingo',
    tagline: 'Desfile de las Estrellas + Desfile Internacional',
    price: 50000,
    serviceCharge: 5000,
    // Sin link manual: hasta que el organizador cargue uno real (Admin → Entradas), el cobro
    // sale por el checkout de MP. Antes acá vivía MP_PLACEHOLDER, que no cobra nada.
    mpLink: null,
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
    eventId: IDS.events.principal,
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
    eventId: IDS.events.principal,
    name: 'Domingo · Sunset VIP',
    tagline: 'Desfile Internacional · 18 a 20 hs',
    price: 30000,
    serviceCharge: 3000,
    // Sin link manual: hasta que el organizador cargue uno real (Admin → Entradas), el cobro
    // sale por el checkout de MP. Antes acá vivía MP_PLACEHOLDER, que no cobra nada.
    mpLink: null,
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
