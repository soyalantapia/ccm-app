import type { Device, ProfileField, AnalyticsEvent, Event, EventBlock, Registration } from '@prisma/client'
import type {
  DeviceProfile,
  AnalyticsEvent as DomainAnalyticsEvent,
  EventItem,
  EventBlock as DomainEventBlock,
  Registration as DomainRegistration,
} from '@domain/types'

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
