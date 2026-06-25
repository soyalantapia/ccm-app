import type {
  Device,
  ProfileField,
  AnalyticsEvent,
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
  Application,
  Membership,
  Benefit,
  Banner,
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
    ...(sponsorIds.length ? { sponsorIds } : {}),
    past: ev.past,
    socioOnly: ev.socioOnly,
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
    platform: c.platform,
    city: c.city,
    bio: c.bio,
    photo: c.photo,
    ...(c.instagram ? { instagram: c.instagram } : {}),
    verified: c.verified,
    participatesIn: c.participatesIn,
    portfolio: (c.portfolio ?? []).map((p) => ({
      id: p.id,
      image: p.image,
      title: p.title,
      ...(p.caption ? { caption: p.caption } : {}),
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

export function toContentItem(c: ContentItem): DomainContentItem {
  return {
    id: c.id,
    type: 'video',
    title: c.title,
    description: c.description,
    youtubeId: c.youtubeId,
    ...(c.duration ? { duration: c.duration } : {}),
    ...(c.platform ? { platform: c.platform } : {}),
    ...(c.sponsorId ? { sponsorId: c.sponsorId } : {}),
    publishedAt: c.publishedAt.toISOString().slice(0, 10),
    socioOnly: c.socioOnly,
  }
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
    creatives: (s.creatives ?? []).map((c) => ({
      slot: c.slot,
      headline: c.headline,
      ...(c.sub ? { sub: c.sub } : {}),
      ...(c.cta ? { cta: c.cta } : {}),
    })),
  }
}

export function toConvocatoria(
  cv: Convocatoria & { fields?: ConvocatoriaField[] },
): DomainConvocatoria {
  return {
    id: cv.id,
    slug: cv.slug,
    title: cv.title,
    intro: cv.intro,
    deadline: cv.deadline.toISOString().slice(0, 10),
    eventId: cv.eventId,
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

export function toApplication(a: Application): DomainApplication {
  return {
    id: a.id,
    convocatoriaId: a.convocatoriaId,
    ts: a.ts.toISOString(),
    status: a.status,
    data: a.data as Record<string, string>,
    ...(a.fromSeed ? { fromSeed: a.fromSeed } : {}),
    ...(a.decidedAt ? { decidedAt: a.decidedAt.toISOString() } : {}),
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
