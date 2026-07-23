import type {
  Device,
  ProfileField,
  AnalyticsEvent,
  TicketOrder,
  AdCampaign,
  Event,
  EventBlock,
  Registration,
  CatalogProfile,
  PortfolioPiece,
  Gallery,
  Photo,
  ContentItem,
  PhotoDownload,
  Sponsor,
  SponsorCreative,
  Convocatoria,
  ConvocatoriaField,
  ConvocatoriaLogo,
  Application,
  Membership,
  Benefit,
  Banner,
  Nota,
} from '@prisma/client'
import type {
  DeviceProfile,
  AnalyticsEvent as DomainAnalyticsEvent,
  EventItem,
  EventBlock as DomainEventBlock,
  Registration as DomainRegistration,
  CatalogProfile as DomainCatalogProfile,
  Gallery as DomainGallery,
  ContentItem as DomainContentItem,
  Sponsor as DomainSponsor,
  Convocatoria as DomainConvocatoria,
  Application as DomainApplication,
  Membership as DomainMembership,
  Benefit as DomainBenefit,
  BenefitCategory,
  Banner as DomainBanner,
  BannerDestination,
  Nota as DomainNota,
  TicketOrder as DomainTicketOrder,
  TicketPlan as DomainTicketPlan,
  AdCampaign as DomainAdCampaign,
} from '@domain/types'

// PhotoDownload del front vive en DataStore.ts (no en types.ts) y ese archivo no
// resuelve bajo NodeNext; replico su shape acá (es estable).
interface DomainPhotoDownload {
  photoId: string
  galleryId: string
  sponsorId: string
  ts: string
}

/**
 * Serializa Device + sus ProfileField al shape `DeviceProfile` del front (canon 6:
 * no hay tabla DeviceProfile; se arma acá). `deviceId` expuesto = publicId (el UUID
 * que el front conoce). Consentimientos: DateTime → ISO string (como en el dominio).
 */
export function toDeviceProfile(
  device: Device,
  fields: ProfileField[],
): DeviceProfile {
  const fieldMap: DeviceProfile['fields'] = {}
  for (const f of fields) {
    fieldMap[f.key] = {
      value: f.value,
      capturedAt: f.capturedAt.toISOString(),
      source: f.source,
    }
  }
  const consents: DeviceProfile['consents'] = {}
  if (device.consentTerms) consents.terms = device.consentTerms.toISOString()
  if (device.consentNews) consents.news = device.consentNews.toISOString()
  if (device.consentSponsors) consents.sponsors = device.consentSponsors.toISOString()

  return {
    deviceId: device.publicId,
    createdAt: device.createdAt.toISOString(),
    fields: fieldMap,
    consents,
  }
}

/** Event row (+ sus sponsorIds vía EventSponsor) → EventItem del dominio. */
export function toEventItem(ev: Event & { sponsors?: { sponsorId: string }[] }): EventItem {
  const sponsorIds = ev.sponsors?.map((s) => s.sponsorId) ?? []
  return {
    id: ev.id,
    slug: ev.slug,
    type: ev.type,
    title: ev.title,
    ...(ev.subtitle ? { subtitle: ev.subtitle } : {}),
    dateLabel: ev.dateLabel,
    startDate: ev.startDate.toISOString().slice(0, 10), // 'YYYY-MM-DD' como el seed
    ...(ev.timeLabel ? { timeLabel: ev.timeLabel } : {}),
    venue: ev.venue,
    address: ev.address,
    mapsUrl: ev.mapsUrl,
    description: ev.description,
    cover: ev.cover,
    ...(ev.price != null ? { price: ev.price } : {}),
    ...(ev.capacity != null ? { capacity: ev.capacity } : {}),
    ...(ev.parentId ? { parentId: ev.parentId } : {}),
    ...(ev.seedTaken ? { seedTaken: ev.seedTaken } : {}),
    ...(sponsorIds.length ? { sponsorIds } : {}),
    past: ev.past,
    socioOnly: ev.socioOnly,
    published: ev.published,
  }
}

export function toEventBlock(b: EventBlock): DomainEventBlock {
  return {
    id: b.id,
    eventId: b.eventId,
    title: b.title,
    kind: b.kind,
    day: b.day,
    start: b.start,
    end: b.end,
    room: b.room,
    capacity: b.capacity,
    seedTaken: b.seedTaken,
    speakers: b.speakers,
    ...(b.description ? { description: b.description } : {}),
  }
}

export function toRegistration(r: Registration): DomainRegistration {
  return {
    id: r.id,
    eventId: r.eventId,
    ...(r.blockId ? { blockId: r.blockId } : {}),
    ts: r.ts.toISOString(),
    status: r.status,
  }
}

export function toCatalogProfile(
  c: CatalogProfile & { portfolio?: PortfolioPiece[] },
): DomainCatalogProfile {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    role: c.role,
    // Whitelist de 3. La ternaria vieja (=== 'expositor' ? … : 'participante') colapsaba
    // 'speaker' a 'participante' en silencio y rompía la sección entera.
    kind: c.kind === 'expositor' || c.kind === 'speaker' ? c.kind : 'participante',
    platform: c.platform,
    city: c.city,
    bio: c.bio,
    ...(c.projects ? { projects: c.projects } : {}),
    photo: c.photo,
    ...(c.instagram ? { instagram: c.instagram } : {}),
    ...(c.whatsapp ? { whatsapp: c.whatsapp } : {}),
    verified: c.verified,
    participatesIn: c.participatesIn,
    portfolio: (c.portfolio ?? []).map((p) => ({
      id: p.id,
      image: p.image,
      title: p.title,
      ...(p.caption ? { caption: p.caption } : {}),
      ...(p.price != null ? { price: p.price } : {}),
    })),
  }
}

export function toGallery(g: Gallery & { photos?: Photo[] }): DomainGallery {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    eventLabel: g.eventLabel,
    date: g.date,
    cover: g.cover,
    sponsorId: g.sponsorId,
    photos: (g.photos ?? []).map((p) => ({ id: p.id, src: p.src, alt: p.alt })),
  }
}

/** withVideo=false blanquea el youtubeId (gate socioOnly server-side): el video "unlisted"
 *  depende ENTERAMENTE del secreto del id, así que emitirlo a un no-Socio filtra el contenido
 *  pago. Espeja toBenefit(b, withCode). El front ya muestra el candado; acá le sacamos el id real. */
export function toContentItem(c: ContentItem, withVideo = true): DomainContentItem {
  return {
    id: c.id,
    type: 'video',
    title: c.title,
    description: c.description,
    youtubeId: withVideo ? c.youtubeId : '',
    ...(c.duration ? { duration: c.duration } : {}),
    ...(c.platform ? { platform: c.platform } : {}),
    ...(c.sponsorId ? { sponsorId: c.sponsorId } : {}),
    publishedAt: c.publishedAt.toISOString().slice(0, 10),
    socioOnly: c.socioOnly,
  }
}

/**
 * Gate de contenido premium (server-side). A los NO socios les vaciamos el youtubeId de los
 * items socioOnly: el paywall del front (LockedVideoCard) era solo cosmético y el localizador
 * del video viajaba igual en el payload público de /contents, así que cualquiera lo miraba en
 * YouTube. El item sigue apareciendo (con su portada + candado); lo que no sale es el asset.
 */
export function gateSocioContents(items: DomainContentItem[], isSocio: boolean): DomainContentItem[] {
  if (isSocio) return items
  return items.map((c) => (c.socioOnly ? { ...c, youtubeId: '' } : c))
}

export function toPhotoDownload(d: PhotoDownload): DomainPhotoDownload {
  return { photoId: d.photoId, galleryId: d.galleryId, sponsorId: d.sponsorId, ts: d.ts.toISOString() }
}

export function toSponsor(s: Sponsor & { creatives?: SponsorCreative[] }): DomainSponsor {
  return {
    id: s.id,
    name: s.name,
    industry: s.industry,
    level: s.level,
    exclusive: s.exclusive,
    tagline: s.tagline,
    ...(s.banner ? { banner: s.banner } : {}),
    creatives: (s.creatives ?? []).map((c) => ({
      slot: c.slot,
      headline: c.headline,
      ...(c.sub ? { sub: c.sub } : {}),
      ...(c.cta ? { cta: c.cta } : {}),
    })),
  }
}

export function toConvocatoria(
  cv: Convocatoria & { fields?: ConvocatoriaField[]; logos?: ConvocatoriaLogo[] },
): DomainConvocatoria {
  return {
    id: cv.id,
    slug: cv.slug,
    title: cv.title,
    intro: cv.intro,
    deadline: cv.deadline.toISOString().slice(0, 10),
    eventId: cv.eventId,
    ...(cv.ctaLabel ? { ctaLabel: cv.ctaLabel } : {}),
    ...(cv.ctaUrl ? { ctaUrl: cv.ctaUrl } : {}),
    ...(cv.logos && cv.logos.length
      ? {
          logos: cv.logos.map((l) => ({
            name: l.name,
            logoUrl: l.logoUrl,
            ...(l.url ? { url: l.url } : {}),
            ...(l.rubro ? { rubro: l.rubro } : {}),
          })),
        }
      : {}),
    fields: (cv.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type as DomainConvocatoria['fields'][number]['type'],
      required: f.required,
      ...(f.options.length ? { options: f.options } : {}),
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
      ...(f.help ? { help: f.help } : {}),
      ...(f.showIfKey && f.showIfEquals ? { showIf: { key: f.showIfKey, equals: f.showIfEquals } } : {}),
    })),
  }
}

/** Nota editorial → shape del dominio. publishedAt → 'YYYY-MM-DD'. */
export function toNota(n: Nota): DomainNota {
  return {
    id: n.id,
    slug: n.slug,
    title: n.title,
    excerpt: n.excerpt,
    body: n.body,
    ...(n.cover ? { cover: n.cover } : {}),
    ...(n.author ? { author: n.author } : {}),
    ...(n.category ? { category: n.category } : {}),
    ...(n.youtubeId ? { youtubeId: n.youtubeId } : {}),
    published: n.published,
    publishedAt: n.publishedAt.toISOString().slice(0, 10),
    order: n.order,
  }
}

/** Banner gestionado → shape del dominio. */
export function toBanner(b: Banner): DomainBanner {
  return {
    id: b.id,
    slot: b.slot,
    brand: b.brand,
    image: b.image,
    ...(b.alt ? { alt: b.alt } : {}),
    destinationType: b.destinationType as BannerDestination,
    destinationUrl: b.destinationUrl,
    fixed: b.fixed,
    order: b.order,
    active: b.active,
  }
}

/**
 * Benefit → shape del dominio. `withCode` decide si se incluye el código (solo a registrados);
 * sin él, se omite (queda undefined) y la UI muestra "registrate para verlo".
 */
export function toBenefit(b: Benefit, withCode: boolean): DomainBenefit {
  return {
    id: b.id,
    partner: b.partner,
    category: b.category as BenefitCategory,
    title: b.title,
    description: b.description,
    ...(withCode && b.code ? { code: b.code } : {}),
    ...(b.discountLabel ? { discountLabel: b.discountLabel } : {}),
    ...(b.url ? { url: b.url } : {}),
    ...(b.logo ? { logo: b.logo } : {}),
    ...(b.validUntil ? { validUntil: b.validUntil.toISOString().slice(0, 10) } : {}),
    order: b.order,
    active: b.active,
  }
}

/** Membership → shape del dominio. `since` nullable en DB → '' (el dominio lo pide string). */
export function toMembership(m: Membership): DomainMembership {
  return {
    tier: m.tier,
    since: m.since ? m.since.toISOString() : '',
    paid: m.paid,
  }
}

/**
 * `forAdmin` decide si se incluye `decidedBy`, `decisionNote` y `notifyError`. Esta misma fila
 * alimenta DOS rutas: /admin/applications (panel del organizador, protegida con
 * requirePermission) y /applications ("Mis postulaciones" del propio postulante, solo
 * device-scoped).
 *
 * - `decidedBy` es el EMAIL del admin que decidió — PII interna del equipo.
 * - `decisionNote` es la nota interna que el organizador escribe al decidir — nunca se le
 *   manda al postulante por mail, así que tampoco puede viajarle por esta ruta.
 * - `notifyError` guarda el `err.message` CRUDO de un envío fallido (SMTP/Resend): puede traer
 *   host, puerto, usuario o el cuerpo de la respuesta del proveedor — detalle de infraestructura,
 *   no algo para mostrarle a la persona que postuló.
 *
 * Los tres solo viajan con forAdmin=true. `notifiedAt` sí viaja siempre: es sobre el aviso de la
 * PROPIA postulación (si salió o no), no expone a nadie más ni ningún detalle de infra.
 */
export function toApplication(a: Application, forAdmin = false): DomainApplication {
  return {
    id: a.id,
    convocatoriaId: a.convocatoriaId,
    ts: a.ts.toISOString(),
    status: a.status,
    data: a.data as Record<string, string>,
    ...(a.fromSeed ? { fromSeed: a.fromSeed } : {}),
    ...(a.decidedAt ? { decidedAt: a.decidedAt.toISOString() } : {}),
    ...(forAdmin && a.decidedBy ? { decidedBy: a.decidedBy } : {}),
    ...(forAdmin && a.decisionNote ? { decisionNote: a.decisionNote } : {}),
    ...(a.notifiedAt ? { notifiedAt: a.notifiedAt.toISOString() } : {}),
    ...(forAdmin && a.notifyError ? { notifyError: a.notifyError } : {}),
  }
}

/** Serializa una fila AnalyticsEvent (con su device incluido) al shape del dominio. */
export function toAnalyticsEvent(
  row: AnalyticsEvent & { device?: { publicId: string } | null },
): DomainAnalyticsEvent {
  return {
    id: row.id,
    event: row.event,
    ts: row.ts.toISOString(),
    deviceId: row.device?.publicId,
    payload: (row.payload as Record<string, unknown> | null) ?? undefined,
    seed: row.seed,
  }
}

/** Fila TicketOrder → orden del dominio. El total viene congelado de la compra.
 *
 *  Si la consulta hizo `include: { plan: { select: { name, kind } } }`, se adjunta el nombre y el
 *  tipo de la entrada. Hace falta porque la orden guarda sólo el planId, y del lado del comprador
 *  una entrada RETIRADA de la venta no se puede resolver (/plans la excluye): sin esto, "Tus
 *  órdenes" mostraba el id crudo y una credencial VIP bajaba a "Entrada general". El server sí ve
 *  las retiradas, así que las resuelve acá. */
export function toTicketOrder(
  o: TicketOrder & { plan?: { name: string; kind: string } | null },
): DomainTicketOrder {
  return {
    id: o.id,
    planId: o.planId as DomainTicketOrder['planId'],
    ts: o.ts.toISOString(),
    status: o.status,
    qty: o.qty,
    total: o.total,
    ...(o.buyerName ? { buyerName: o.buyerName } : {}),
    ...(o.buyerEmail ? { buyerEmail: o.buyerEmail } : {}),
    ...(o.plan ? { planName: o.plan.name, planKind: o.plan.kind as DomainTicketOrder['planKind'] } : {}),
  }
}

/** Fila AdCampaign → campaña del dominio (publicidad autogestionada). */
export function toAdCampaign(c: AdCampaign): DomainAdCampaign {
  return {
    id: c.id,
    slot: c.slot,
    brand: c.brand,
    headline: c.headline,
    hours: c.hours,
    total: c.total,
    ts: c.ts.toISOString(),
    ...(c.cta ? { cta: c.cta } : {}),
    ...(c.tagline ? { tagline: c.tagline } : {}),
  }
}

/** Un tipo de entrada como lo consume el front. Vive acá y no en catalogService para que la
 *  lectura pública y el alta del panel devuelvan exactamente la misma forma — si divergen, el
 *  panel muestra un plan recién creado distinto del que después sirve la API. */
export function toTicketPlan(p: {
  id: string
  eventId: string
  name: string
  tagline: string
  price: number | null
  serviceCharge: number
  mpLink: string | null
  perks: string[]
  featured: boolean
  day: string | null
  kind: string
  preventa: boolean
  archived: boolean
}): DomainTicketPlan {
  return {
    id: p.id as DomainTicketPlan['id'],
    eventId: p.eventId,
    name: p.name,
    tagline: p.tagline,
    price: p.price,
    serviceCharge: p.serviceCharge,
    mpLink: p.mpLink,
    perks: p.perks,
    featured: p.featured,
    ...(p.day ? { day: p.day as DomainTicketPlan['day'] } : {}),
    kind: p.kind as DomainTicketPlan['kind'],
    preventa: p.preventa,
    archived: p.archived,
  }
}
