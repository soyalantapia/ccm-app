import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { toApplication } from '../lib/serialize.js'
import { notFound } from '../lib/errors.js'
import type { Application } from '@domain/types'

/** Postulación pública (preinscripta). El equipo CCM decide después (admin). */
export async function submitApplication(
  convocatoriaId: string,
  data: Record<string, string>,
  deviceId?: string,
): Promise<Application> {
  const cv = await prisma.convocatoria.findUnique({ where: { id: convocatoriaId }, select: { id: true } })
  if (!cv) throw notFound('CONVOCATORIA_NOT_FOUND', 'Convocatoria no encontrada')
  const row = await prisma.application.create({
    data: { id: `app_${randomUUID()}`, convocatoriaId, deviceId: deviceId ?? null, status: 'preinscripta', data, fromSeed: false },
  })
  return toApplication(row)
}

/** Admin: todas las postulaciones (más recientes primero). */
export async function getApplications(): Promise<Application[]> {
  const rows = await prisma.application.findMany({ orderBy: { ts: 'desc' } })
  return rows.map(toApplication)
}

/** Las postulaciones del PROPIO device (para "Mis postulaciones" en el Perfil). */
export async function getDeviceApplications(deviceId: string): Promise<Application[]> {
  const rows = await prisma.application.findMany({ where: { deviceId }, orderBy: { ts: 'desc' } })
  return rows.map(toApplication)
}

/** Admin: aceptar/rechazar. Solo desde 'preinscripta' (decideApplication del dominio). */
export async function decideApplication(id: string, status: 'aceptada' | 'rechazada'): Promise<void> {
  await prisma.application.update({ where: { id }, data: { status, decidedAt: new Date() } })
}
