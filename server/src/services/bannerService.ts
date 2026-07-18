import { prisma } from '../lib/prisma.js'
import { toBanner } from '../lib/serialize.js'
import { cleanStoredUrl } from '../lib/url.js'
import { badRequest } from '../lib/errors.js'
import type { Banner } from '@domain/types'

/** Banners activos (público), ordenados. La rotación la resuelve el front por slot.
 *  Desempate por createdAt: si dos banners comparten `order` (default 0), el orden
 *  deja de ser arbitrario de Postgres y queda estable (feedback Gastón: "que no se pisen"). */
export async function getBanners(): Promise<Banner[]> {
  const rows = await prisma.banner.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(toBanner)
}

/** Admin: todos (incl. inactivos) para gestionarlos. */
export async function getAllBanners(): Promise<Banner[]> {
  const rows = await prisma.banner.findMany({ orderBy: [{ slot: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] })
  return rows.map(toBanner)
}

export async function createBanner(b: Banner): Promise<Banner> {
  const destinationUrl = cleanStoredUrl(b.destinationUrl, 'destino')
  if (!destinationUrl) throw badRequest('INVALID_URL', 'El destino del banner es obligatorio')
  const row = await prisma.banner.create({
    data: {
      id: b.id, slot: b.slot, brand: b.brand, image: b.image, alt: b.alt ?? null,
      destinationType: b.destinationType, destinationUrl,
      fixed: b.fixed ?? false, order: b.order ?? 0, active: b.active ?? true,
    },
  })
  return toBanner(row)
}

export async function updateBanner(id: string, patch: Partial<Banner>): Promise<Banner> {
  const data: Record<string, unknown> = {}
  for (const k of ['slot', 'brand', 'image', 'alt', 'destinationType', 'fixed', 'order', 'active'] as const) {
    if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  }
  if ('destinationUrl' in patch) data.destinationUrl = cleanStoredUrl(patch.destinationUrl, 'destino')
  const row = await prisma.banner.update({ where: { id }, data })
  return toBanner(row)
}

export async function deleteBanner(id: string): Promise<void> {
  await prisma.banner.delete({ where: { id } })
}
