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
  /** Cupo total del evento (para lo que se inscribe o se compra a nivel evento). null = sin tope. */
  capacity?: number | null
  /**
   * De qué evento cuelga esta INICIATIVA (workshop, capacitación, lo que sea). null/ausente =
   * evento de primer nivel. Las hijas se filtran en los selectores de RENDER del front, no en la
   * consulta del server: si se filtraran ahí, desaparecerían de la ficha de su propio padre.
   */
  parentId?: string | null
  /** Baseline de ocupación: los que el organizador anotó por fuera y no están en la base. */
  seedTaken?: number
  sponsorIds?: string[]
  past?: boolean
  /** Capacitación/evento reservado a la membresía Socio CCM (niveles de suscripción). */
  socioOnly?: boolean
  /**
   * ¿Está a la vista del público? Un evento nace borrador y se publica como acto aparte.
   *
   * Opcional porque el seed de la demo no lo trae: ahí todo lo cargado se muestra. Quien
   * decide de verdad es el backend, que ni siquiera devuelve los borradores en la ruta pública.
   */
  published?: boolean
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

/** Una inscripción tal como la ve el PANEL: con la persona, no sólo el dispositivo. */
export interface InscriptoAdmin {
  id: string
  deviceId: string
  blockId: string | null
  blockTitle: string | null
  status: string
  ts: string
  nombre: string | null
  email: string | null
  telefono: string | null
}

export interface Registration {
  id: string
  eventId: string
  blockId?: string
  ts: string
  status: 'confirmada' | 'cancelada'
}

/* ─── Entradas y órdenes ─── */

/**
 * Id de un tipo de entrada. Era una unión cerrada de los 5 tiers del evento principal, lo que
 * hacía imposible crear una entrada nueva: no compilaba. Ahora es texto libre porque cada evento
 * arma los suyos desde el panel.
 *
 * Lo que se pierde: el compilador ya no avisa si alguien escribe mal un id de plan. Se compensa
 * en el server, que responde PLAN_NOT_FOUND al crear la orden.
 */
export type PlanId = string

export interface TicketPlan {
  id: PlanId
  /** De qué evento son estas entradas. Cada evento arma sus propios tiers. */
  eventId: string
  name: string
  tagline: string
  /** null = precio pendiente de confirmar ([PENDIENTE] PRD §18) */
  price: number | null
  /** Cargo por servicio por unidad (0 en las gratuitas). */
  serviceCharge: number
  mpLink: string | null
  perks: string[]
  featured?: boolean
  /** Sólo para eventos de varias jornadas. Un taller de una tarde no tiene ninguno de los tres. */
  day?: 'sabado' | 'domingo' | 'combo'
  kind: 'general' | 'vip'
  preventa?: boolean
  /** Retirada de la venta: no aparece en la app, pero sigue existiendo (sus órdenes quedan
   *  válidas). Sólo el panel la ve, para reactivarla. La lectura pública nunca la trae. */
  archived?: boolean
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
  /** participante | expositor — distinto cupo de imágenes (4 vs 2) + campo "cuenta proyectos". */
  kind?: 'participante' | 'expositor'
  platform: string // 'Moda' | 'Belleza' | 'Arte' | ...
  city: string
  bio: string
  /** "Cuenta proyectos" — narrativa del expositor (opcional). */
  projects?: string
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
  /** Banner horizontal (arte del sponsor / ilustrativo) para el carrusel. */
  banner?: string
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

/* ─── Notas / novedades (CMS editorial) ─── */

export interface Nota {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string
  cover?: string
  author?: string
  category?: string
  youtubeId?: string
  published: boolean
  publishedAt: string
  order: number
}

/** Alta de nota desde el admin (el store genera id + slug). */
export type NewNota = Omit<Nota, 'id' | 'slug'> & { slug?: string }

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

/** Logo mostrado en la convocatoria (universidad / sponsor / aliado), agrupable por rubro. */
export interface ConvocatoriaLogo {
  name: string
  logoUrl: string
  url?: string
  rubro?: string
}

export interface Convocatoria {
  id: string
  slug: string
  title: string
  intro: string
  deadline: string
  eventId: string
  /** Texto y destino de un botón CTA opcional (ej. "Sumá tu universidad"). */
  ctaLabel?: string
  ctaUrl?: string
  fields: ConvocatoriaField[]
  logos?: ConvocatoriaLogo[]
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
  /**
   * Email del admin que decidió. PII interna del equipo: el serializador del server
   * (`toApplication`) solo la incluye en la ruta admin, nunca en "Mis postulaciones".
   */
  decidedBy?: string
  /**
   * Nota INTERNA del equipo sobre la decisión — nunca viaja al postulante (el mail no la
   * incluye). Mismo criterio que `decidedBy`: el serializador del server solo la manda en la
   * ruta admin, nunca en "Mis postulaciones".
   */
  decisionNote?: string
  /** Cuándo salió el aviso al postulante. Ausente junto a notifyError = nunca se intentó. */
  notifiedAt?: string
  /**
   * Por qué falló el aviso, si falló. Ausente junto a notifiedAt = nunca se intentó.
   *
   * PII/infra interna (puede traer host, puerto o el cuerpo de la respuesta del proveedor de
   * mail): solo viaja en la ruta admin, igual que `decidedBy` y `decisionNote`. Nunca a
   * "Mis postulaciones" del propio postulante.
   */
  notifyError?: string
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

/* ─── Métricas del panel ─── */

/**
 * Respuesta de GET /admin/stats. Cada número sale de un COUNT sobre la tabla que es
 * fuente de verdad, calculado en el servidor y en un único instante — NO de contar
 * eventos de analytics en el navegador, que es lo que hacía el Dashboard anterior.
 */
export interface AdminStats {
  /** Instante del cálculo. Alimenta el "actualizado hace X". */
  generatedAt: string
  kpis: {
    registrados: number
    inscripciones: number
    socios: number
    /** Pesos enteros. */
    ingresoSocios: number
    /** Sólo órdenes cobradas; las trabadas van en plataTrabada. */
    ordenesConfirmadas: number
    postulaciones: number
    descargas: number
  }
  postulacionesPendientes: {
    total: number
    masAntiguaDias: number | null
    items: { id: string; convocatoriaTitulo: string; diasEsperando: number; ts: string }[]
  }
  plataTrabada: {
    montoTotal: number
    cantidad: number
    porEstado: { status: string; cantidad: number; monto: number }[]
  }
  bloquesFlojos: {
    items: {
      id: string
      titulo: string
      eventoTitulo: string
      dia: string
      capacity: number
      taken: number
      faltan: number
      ocupacion: number
    }[]
  }
  convocatoriasPorCerrar: {
    items: { id: string; slug: string; titulo: string; deadline: string; diasRestantes: number; postulaciones: number }[]
  }
  sponsors: { items: { sponsorId: string; nombre: string; nivel: string | null; descargas: number }[] }
}

/* ─── Cobros con Mercado Pago ─── */

/** Estado de la conexión con Mercado Pago. Sin tokens: esto viaja al navegador. */
export interface MpStatus {
  conectado: boolean
  cuenta?: string
  desde?: string
  vence?: string
}
