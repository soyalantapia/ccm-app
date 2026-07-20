import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { toApplication } from '../lib/serialize.js'
import { notFound, conflict } from '../lib/errors.js'
import type { Application } from '@domain/types'

/** Postulación pública (preinscripta). El equipo CCM decide después (admin). */
export async function submitApplication(
  convocatoriaId: string,
  data: Record<string, string>,
  deviceId?: string,
): Promise<Application> {
  const cv = await prisma.convocatoria.findUnique({ where: { id: convocatoriaId }, select: { id: true, deadline: true } })
  if (!cv) throw notFound('CONVOCATORIA_NOT_FOUND', 'Convocatoria no encontrada')
  // Rechazar después del cierre (fin del día del deadline). El front también lo gatea, pero la
  // fuente de verdad es el server: sin esto se aceptaban postulaciones tarde (bug cazabug).
  // Fin del día del deadline anclado a la TZ de Córdoba (UTC-3), NO a la del proceso: en Railway
  // (UTC) setHours(23,59,59) cerraba a las 20:59 ART (~3h antes) y rechazaba postulaciones válidas.
  const dateStr = cv.deadline.toISOString().slice(0, 10) // 'YYYY-MM-DD' (deadline date-only)
  const closeOfDay = new Date(`${dateStr}T23:59:59.999-03:00`)
  if (new Date() > closeOfDay) throw conflict('CONVOCATORIA_CLOSED', 'La convocatoria ya cerró.')
  const row = await prisma.application.create({
    data: { id: `app_${randomUUID()}`, convocatoriaId, deviceId: deviceId ?? null, status: 'preinscripta', data, fromSeed: false },
  })
  return toApplication(row)
}

/** Admin: todas las postulaciones (más recientes primero).
 *  take=500 previene un full-table-scan cuando crecen; suficiente para todo evento CCM.
 *  Sin él, findMany sin cota lee la tabla entera en cada hidratación admin. */
export async function getApplications(): Promise<Application[]> {
  const rows = await prisma.application.findMany({ orderBy: { ts: 'desc' }, take: 500 })
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
