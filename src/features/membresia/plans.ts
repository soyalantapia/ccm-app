import type { MembershipTier } from '../../data/types'

/**
 * Niveles de suscripción de CCM (pedido #1 de Gastón en discovery).
 * Dos niveles: Gratis (registro = captura de datos) y Socio CCM (pago, desbloquea
 * capacitaciones, zona VIP, contenido exclusivo y descuentos). Precio bajo a
 * propósito: el modelo es volumen + datos, no margen por suscripción.
 */

export interface MembershipBenefit {
  title: string
  detail: string
}

export interface MembershipPlanDef {
  tier: MembershipTier
  name: string
  /** 0 = gratis. */
  price: number
  tagline: string
  benefits: MembershipBenefit[]
}

/** Precio de la membresía Socio CCM (editable; demo). */
export const SOCIO_PRICE = 9900

export const FREE_PLAN: MembershipPlanDef = {
  tier: 'free',
  name: 'Gratis',
  price: 0,
  tagline: 'Registrate, entrá y viví el evento.',
  benefits: [
    { title: 'Acreditación con QR', detail: 'Tu entrada gratuita a los dos días de CCM.' },
    { title: 'Agenda y contenido general', detail: 'Eventos, expositores, fotos y videos abiertos.' },
    { title: 'Novedades del ecosistema', detail: 'Te llegan los anuncios y el programa.' },
  ],
}

export const SOCIO_PLAN: MembershipPlanDef = {
  tier: 'socio',
  name: 'Socio CCM',
  price: SOCIO_PRICE,
  tagline: 'La membresía que te abre todo el ecosistema.',
  benefits: [
    { title: 'Capacitaciones y masterclasses', detail: 'Acceso a todos los talleres premium del año.' },
    { title: 'Zona VIP + acceso prioritario', detail: 'Lugar reservado y entrada sin fila en las charlas.' },
    { title: 'Contenido exclusivo', detail: 'Entrevistas y backstage que no salen al público.' },
    { title: 'Descuentos con expositores', detail: 'Beneficios con las marcas y diseñadores del catálogo.' },
  ],
}

export const MEMBERSHIP_PLANS: MembershipPlanDef[] = [FREE_PLAN, SOCIO_PLAN]
