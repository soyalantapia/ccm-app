import type { Device, ProfileField, AnalyticsEvent } from '@prisma/client'
import type { DeviceProfile, AnalyticsEvent as DomainAnalyticsEvent } from '@domain/types'

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
