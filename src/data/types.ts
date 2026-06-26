/** Domain types — shared by seed, DataStore and UI. */

export type ProfileFieldKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'profession'
  | 'phone'
  | 'dni'
  | 'city'
  | 'instagram'

export interface CapturedField {
  value: string
  capturedAt: string
  /** Acción que originó la captura (oro para segmentación — PRD §7). */
  source: string
}

export interface DeviceProfile {
  deviceId: string
  createdAt: string
  fields: Partial<Record<ProfileFieldKey, CapturedField>>
  consents: { terms?: string; news?: string; sponsors?: string }
}

/* ─── Eventos ─── */

export type EventType = 'principal' | 'camino' | 'capacitacion'

export interface EventItem {
  id: string
  slug: string
  type: EventType
  title: string
  subtitle?: string
  dateLabel: string
  /** ISO date para ordenar */
  startDate: string
  timeLabel?: string
  venue: string
  address: string
  mapsUrl: string
  description: string
  cover: string
  price?: number | null
  sponsorIds?: string[]
  past?: boolean
  /** Capacitación/evento reservado a la membresía Socio CCM (niveles de suscripción). */
  socioOnly?: boolean
}

export interface EventBlock {
  id: string
  eventId: string
  title: string
  kind: string // 'Charla' | 'Masterclass' | 'Desfile' | 'Workshop' | ...
  day: string // '18/06'
  start: string // '17:00'
  end: string
  room: string
  capacity: number
  /** Inscriptos pre-existentes del seed; los locales se suman encima. */
  seedTaken: number
  speakers: string[]
  description?: string
}

export interface Registration {
  id: string
  eventId: string
  blockId?: string
  ts: string
  status: 'confirmada' | 'cancelada'
}

/* ─── Entradas y órdenes ─── */

/** Tiers reales del evento (fuente: página oficial en Tikealo). */
export type PlanId = 'sab-general' | 'sab-night-vip' | 'combo-vip' | 'dom-general' | 'dom-sunset-vip'

export interface TicketPlan {
  id: PlanId
  name: string
  tagline: string
  /** null = precio pendiente de confirmar ([PENDIENTE] PRD §18) */
  price: number | null
  /** Cargo por servicio por unidad (0 en las gratuitas). */
  serviceCharge: number
  mpLink: string | null
  perks: string[]
  featured?: boolean
  day: 'sabado' | 'domingo' | 'combo'
  kind: 'general' | 'vip'
  preventa?: boolean
}

export type OrderStatus = 'iniciada' | 'redirigida_mp' | 'confirmada' | 'cancelada'

export interface TicketOrder {
  id: string
  planId: PlanId
  ts: string
  status: OrderStatus
  buyerName?: string
  buyerEmail?: string
  qty: number
  /** (precio + cargo por servicio) × qty al momento de crear la orden. */
  total: number
}

/* ─── Catálogo ─── */

export interface PortfolioPiece {
  id: string
  image: string
  title: string
  caption?: string
  /** Precio del cuadro/prenda (opcional) — "algunas tendrán el precio" (Gastón). */
  price?: number
}

export interface CatalogProfile {
  id: string
  slug: string
  name: string
  role: string // 'Diseñadora' | 'Artista' | 'Influencer' | 'Marca' ...
  platform: string // 'Moda' | 'Belleza' | 'Arte' | ...
  city: string
  bio: string
  photo: string
  instagram?: string
  /** Contacto directo (wa.me/… o número) — "si quiere se contacta" (Gastón). */
  whatsapp?: string
  verified: boolean
  participatesIn: string[]
  portfolio: PortfolioPiece[]
}

/* ─── Fotos ─── */

export interface Photo {
  id: string
  src: string
  alt: string
}

export interface Gallery {
  id: string
  slug: string
  title: string
  eventLabel: string
  date: string
  cover: string
  sponsorId: string
  photos: Photo[]
}

/* ─── Sponsors y publicidad ─── */

export type AdSlot = 'S1' | 'S2' | 'S3' | 'S4' | 'S6'

export interface SponsorCreative {
  slot: AdSlot
  headline: string
  sub?: string
  cta?: string
}

export interface Sponsor {
  id: string
  name: string
  industry: string
  level: 'Principal' | 'Oro' | 'Plata'
  /** Exclusividad de rubro (D20) */
  exclusive: boolean
  tagline: string
  creatives: SponsorCreative[]
}

/**
 * Campaña publicitaria autogestionada: una marca compra un espacio (slot) por
 * una cantidad de horas, paga (mock QR/Mercado Pago) y su aviso entra en vivo.
 */
export interface AdCampaign {
  id: string
  slot: AdSlot
  brand: string
  headline: string
  cta?: string
  tagline?: string
  hours: number
  total: number
  ts: string
}

/* ─── Contenido ─── */

export interface ContentItem {
  id: string
  type: 'video'
  title: string
  description: string
  youtubeId: string
  duration?: string
  platform?: string
  sponsorId?: string
  publishedAt: string
  /** Contenido exclusivo para la membresía Socio CCM. */
  socioOnly?: boolean
}

/* ─── Banners gestionados (publicidad simple) ─── */

export type BannerDestination = 'whatsapp' | 'link' | 'form'

export interface Banner {
  id: string
  /** Ubicación lógica: 'home' | 'eventos' | 'catalogo' | 'fotos' | 'contenido'. */
  slot: string
  brand: string
  image: string
  alt?: string
  destinationType: BannerDestination
  destinationUrl: string
  /** Fijo (siempre visible) vs rota con los demás del slot. */
  fixed: boolean
  order: number
  active: boolean
}

/** Alta de banner desde el admin (el store genera el id). */
export type NewBanner = Omit<Banner, 'id'>

/* ─── Beneficios (descuentos para registrados) ─── */

export type BenefitCategory = 'hotel' | 'spa' | 'gastronomia' | 'entradas' | 'suscripcion' | 'otro'

export interface Benefit {
  id: string
  partner: string
  category: BenefitCategory
  title: string
  description: string
  /** Código de descuento. Solo presente si el device está registrado (lo decide el backend). */
  code?: string
  discountLabel?: string
  url?: string
  logo?: string
  validUntil?: string
  order: number
  active: boolean
}

/** Alta de beneficio desde el admin (el store genera el id). */
export type NewBenefit = Omit<Benefit, 'id'>

/* ─── Membresía / niveles de suscripción ─── */

export type MembershipTier = 'free' | 'socio'

export interface Membership {
  tier: MembershipTier
  /** ISO de alta de la membresía (vacío en el nivel gratis). */
  since: string
  /** Total abonado (demo) — alimenta ingresos por membresías en el panel. */
  paid: number
}

/* ─── Convocatorias y postulaciones ─── */

export interface ConvocatoriaField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'url' | 'tel' | 'email'
  required: boolean
  options?: string[]
  placeholder?: string
  help?: string
  showIf?: { key: string; equals: string }
}

export interface Convocatoria {
  id: string
  slug: string
  title: string
  intro: string
  deadline: string
  eventId: string
  fields: ConvocatoriaField[]
}

export type ApplicationStatus = 'preinscripta' | 'aceptada' | 'rechazada'

export interface Application {
  id: string
  convocatoriaId: string
  ts: string
  status: ApplicationStatus
  data: Record<string, string>
  fromSeed?: boolean
  decidedAt?: string
}

/* ─── Analytics ─── */

export interface AnalyticsEvent {
  id: string
  event: string
  ts: string
  deviceId?: string
  payload?: Record<string, unknown>
  /** Históricos del seed (para que el dashboard no nazca vacío). */
  seed?: boolean
}
