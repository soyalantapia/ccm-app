import { prisma } from '../lib/prisma.js'
import { toBenefit } from '../lib/serialize.js'
import { cleanStoredUrl } from '../lib/url.js'
import { parseDate } from '../lib/dates.js'
import type { Benefit } from '@domain/types'

/** ¿El device tiene al menos una inscripción confirmada? (gate de "registrado"). */
async function isRegistered(deviceId?: string): Promise<boolean> {
  if (!deviceId) return false
  const n = await prisma.registration.count({ where: { deviceId, status: 'confirmada' } })
  return n > 0
}

/**
 * Beneficios activos (público). El `code` se incluye SOLO si el device está registrado
 * (Gastón: "cualquiera que se registre tiene beneficios"). Low-stakes: sin límite de usos.
 */
export async function getBenefits(deviceId?: string): Promise<Benefit[]> {
  const withCode = await isRegistered(deviceId)
  const rows = await prisma.benefit.findMany({ where: { active: true }, orderBy: { order: 'asc' } })
  return rows.map((b) => toBenefit(b, withCode))
}

/** Admin: todos (incl. inactivos) y siempre con código, para editarlos. */
export async function getAllBenefits(): Promise<Benefit[]> {
  const rows = await prisma.benefit.findMany({ orderBy: { order: 'asc' } })
  return rows.map((b) => toBenefit(b, true))
}

export async function createBenefit(b: Benefit): Promise<Benefit> {
  const row = await prisma.benefit.create({
    data: {
      id: b.id, partner: b.partner, category: b.category, title: b.title, description: b.description,
      code: b.code ?? null, discountLabel: b.discountLabel ?? null, url: cleanStoredUrl(b.url, 'link'),
      logo: b.logo ?? null, validUntil: b.validUntil ? parseDate(b.validUntil, 'válido hasta') : null,
      order: b.order ?? 0, active: b.active ?? true,
    },
  })
  return toBenefit(row, true)
}

export async function updateBenefit(id: string, patch: Partial<Benefit>): Promise<Benefit> {
  const data: Record<string, unknown> = {}
  for (const k of ['partner', 'category', 'title', 'description', 'code', 'discountLabel', 'logo', 'order', 'active'] as const) {
    if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  }
  if ('url' in patch) data.url = cleanStoredUrl(patch.url, 'link')
  if ('validUntil' in patch) data.validUntil = patch.validUntil ? parseDate(patch.validUntil, 'válido hasta') : null
  const row = await prisma.benefit.update({ where: { id }, data })
  return toBenefit(row, true)
}

export async function deleteBenefit(id: string): Promise<void> {
  await prisma.benefit.delete({ where: { id } })
}
