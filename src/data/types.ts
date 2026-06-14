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

export type AdSlot = 'S1' | 'S2' | 'S3' | 'S6'

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
