import type { Prisma, ProfileFieldKey } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { toDeviceProfile } from '../lib/serialize.js'
import type { DeviceProfile } from '@domain/types'

/** Lee Device + ProfileField y devuelve el shape DeviceProfile del front. */
export async function getProfile(deviceId: string): Promise<DeviceProfile> {
  const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } })
  const fields = await prisma.profileField.findMany({ where: { deviceId } })
  return toDeviceProfile(device, fields)
}

/**
 * Captura progresiva de datos (PRD §7). Upsert por (deviceId, key) + un evento
 * `profile_field_captured` por campo (paridad con LocalDataStore.saveProfileFields).
 */
export async function saveFields(
  deviceId: string,
  values: Partial<Record<ProfileFieldKey, string>>,
  source: string,
): Promise<DeviceProfile> {
  const entries = Object.entries(values).filter(([, v]) => typeof v === 'string' && v.trim() !== '') as [
    ProfileFieldKey,
    string,
  ][]

  await prisma.$transaction([
    ...entries.map(([key, value]) =>
      prisma.profileField.upsert({
        where: { deviceId_key: { deviceId, key } },
        create: { deviceId, key, value, source },
        update: { value, source, capturedAt: new Date() },
      }),
    ),
    ...entries.map(([key]) =>
      prisma.analyticsEvent.create({
        data: { event: 'profile_field_captured', deviceId, payload: { field: key, source } },
      }),
    ),
  ])

  return getProfile(deviceId)
}

/** Consentimientos: true → timestamp ahora, false → null (revoca), ausente → sin cambio. */
export async function saveConsents(
  deviceId: string,
  consents: { terms?: boolean; news?: boolean; sponsors?: boolean },
): Promise<DeviceProfile> {
  const now = new Date()
  const data: Prisma.DeviceUpdateInput = {}
  if ('terms' in consents) data.consentTerms = consents.terms ? now : null
  if ('news' in consents) data.consentNews = consents.news ? now : null
  if ('sponsors' in consents) data.consentSponsors = consents.sponsors ? now : null

  await prisma.device.update({ where: { id: deviceId }, data })
  return getProfile(deviceId)
}
