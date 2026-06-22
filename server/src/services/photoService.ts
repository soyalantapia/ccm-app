import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { toPhotoDownload } from '../lib/serialize.js'
import { notFound } from '../lib/errors.js'

/** Favoritos del device (array de photoIds, como el dominio). */
export async function getFavorites(deviceId: string): Promise<string[]> {
  const rows = await prisma.photoFavorite.findMany({ where: { deviceId }, select: { photoId: true } })
  return rows.map((r) => r.photoId)
}

export async function addFavorite(deviceId: string, photoId: string): Promise<void> {
  await prisma.photoFavorite.upsert({
    where: { deviceId_photoId: { deviceId, photoId } },
    create: { deviceId, photoId },
    update: {},
  })
}

export async function removeFavorite(deviceId: string, photoId: string): Promise<void> {
  await prisma.photoFavorite.deleteMany({ where: { deviceId, photoId } })
}

/**
 * Registra una descarga. El sponsorId se deriva de la galería al momento (igual que
 * LocalDataStore.recordDownload) → desnormalizado para el reporte por sponsor.
 */
export async function recordDownload(deviceId: string, photoId: string, galleryId: string): Promise<void> {
  const gallery = await prisma.gallery.findUnique({ where: { id: galleryId }, select: { sponsorId: true } })
  if (!gallery) throw notFound('GALLERY_NOT_FOUND', 'Galería no encontrada')
  await prisma.photoDownload.create({
    data: { id: `dl_${randomUUID()}`, deviceId, photoId, galleryId, sponsorId: gallery.sponsorId },
  })
}

export async function getDownloads(deviceId: string) {
  const rows = await prisma.photoDownload.findMany({ where: { deviceId }, orderBy: { ts: 'desc' } })
  return rows.map(toPhotoDownload)
}
