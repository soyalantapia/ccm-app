import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { toApplication } from '../lib/serialize.js'
import { notFound, conflict, badRequest } from '../lib/errors.js'
import type { Application } from '@domain/types'
import { keysFromApplicationData } from '../domain/personIdentity.js'
import { linkPerson } from './personService.js'
import { getMailer } from '../mail/mailer.js'
import { applicationAcceptedEmail, applicationRejectedEmail } from '../mail/templates.js'

/** Postulación pública (preinscripta). El equipo CCM decide después (admin). */
export async function submitApplication(
  convocatoriaId: string,
  data: Record<string, string>,
  deviceId?: string,
): Promise<Application> {
  const cv = await prisma.convocatoria.findUnique({
    where: { id: convocatoriaId },
    select: { id: true, deadline: true, fields: { select: { key: true, label: true, required: true } } },
  })
  if (!cv) throw notFound('CONVOCATORIA_NOT_FOUND', 'Convocatoria no encontrada')
  // Rechazar después del cierre (fin del día del deadline). El front también lo gatea, pero la
  // fuente de verdad es el server: sin esto se aceptaban postulaciones tarde (bug cazabug).
  // Fin del día del deadline anclado a la TZ de Córdoba (UTC-3), NO a la del proceso: en Railway
  // (UTC) setHours(23,59,59) cerraba a las 20:59 ART (~3h antes) y rechazaba postulaciones válidas.
  const dateStr = cv.deadline.toISOString().slice(0, 10) // 'YYYY-MM-DD' (deadline date-only)
  const closeOfDay = new Date(`${dateStr}T23:59:59.999-03:00`)
  if (new Date() > closeOfDay) throw conflict('CONVOCATORIA_CLOSED', 'La convocatoria ya cerró.')

  // Los campos requeridos se validan ACÁ, no solo en el formulario: sin esto un POST directo
  // (o un form con JS a medio cargar) creaba postulaciones vacías, y al organizador le llegaban
  // filas "Sin nombre / —" imposibles de contactar. La convocatoria define qué pide.
  const faltantes = cv.fields
    .filter((f) => f.required && !String(data?.[f.key] ?? '').trim())
    .map((f) => f.label || f.key)
  if (faltantes.length > 0) {
    throw badRequest(
      'MISSING_FIELDS',
      `Faltan campos obligatorios: ${faltantes.join(', ')}`,
      { fields: faltantes },
    )
  }

  const row = await prisma.application.create({
    data: { id: `app_${randomUUID()}`, convocatoriaId, deviceId: deviceId ?? null, status: 'preinscripta', data, fromSeed: false },
  })

  // Las postulaciones traen su PII en el JSON y muchas veces no tienen dispositivo:
  // son la principal fuente de personas del CRM.
  try {
    const personId = await linkPerson(keysFromApplicationData(row.data))
    if (personId) await prisma.application.update({ where: { id: row.id }, data: { personId } })
  } catch (err) {
    console.error('[personas] no se pudo enganchar la postulación', row.id, err)
  }

  return toApplication(row)
}

/**
 * Cola de revisión del admin. Paginada con cursor (mismo patrón que listPeople) y ordenada por
 * la MÁS ANTIGUA primero: en una cola, primero va la que más esperó. Antes era `ts: desc` con
 * `take: 500`, así que al pasar las 500 se ocultaban justamente las más urgentes.
 */
export async function getApplications(opts: { cursor?: string; limit?: number } = {}): Promise<{
  items: Application[]
  nextCursor: string | null
}> {
  const limit = Math.min(opts.limit ?? 50, 100)
  const rows = await prisma.application.findMany({
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: { ts: 'asc' },
  })
  const hayMas = rows.length > limit
  const page = hayMas ? rows.slice(0, limit) : rows
  // forAdmin=true: esta cola es EXCLUSIVAMENTE del panel (requirePermission('applications:read')),
  // así que acá sí viaja decidedBy (email del admin que decidió).
  return { items: page.map((r) => toApplication(r, true)), nextCursor: hayMas ? page[page.length - 1].id : null }
}

/** Las postulaciones del PROPIO device (para "Mis postulaciones" en el Perfil). */
export async function getDeviceApplications(deviceId: string): Promise<Application[]> {
  const rows = await prisma.application.findMany({ where: { deviceId }, orderBy: { ts: 'desc' } })
  // NO pasar toApplication directo a .map(): Array#map llama al callback con (valor, INDEX,
  // array), y con forAdmin como segundo parámetro el index se colaba ahí — con index=1 (truthy)
  // decidedBy (email del admin) se filtraba al postulante a partir de la segunda fila. Regresión
  // real: tsc la marcó, vitest no (transforma sin chequeo de tipos).
  return rows.map((r) => toApplication(r))
}

/**
 * Decide una postulación. Es una TRANSICIÓN, no un update: exige que esté en el estado de
 * origen esperado. Sin eso, un doble click aplicaba dos decisiones — y con el aviso conectado,
 * mandaba dos mails a la misma persona.
 *
 * `preinscripta` como destino es "volver a revisión": la única transición que parte de una
 * postulación ya decidida.
 */
export async function decideApplication(
  id: string,
  status: 'aceptada' | 'rechazada' | 'preinscripta',
  opts: { adminUserId: string; note?: string; skipEmail?: boolean },
): Promise<void> {
  const volviendo = status === 'preinscripta'
  const admin = await prisma.adminUser.findUnique({
    where: { id: opts.adminUserId },
    select: { email: true },
  })
  const { count } = await prisma.application.updateMany({
    // Volver a revisión parte de una decidida; decidir parte de una pendiente.
    where: volviendo ? { id, status: { in: ['aceptada', 'rechazada'] } } : { id, status: 'preinscripta' },
    data: volviendo
      ? { status, decidedAt: null, decidedBy: null, decisionNote: null, notifiedAt: null, notifyError: null }
      : {
          status,
          decidedAt: new Date(),
          decidedBy: admin?.email ?? null,
          decisionNote: opts.note?.trim() || null,
          // Una decisión nueva arranca SIN rastro de avisos anteriores: si esta postulación ya
          // había sido decidida, deshecha (que ya limpia estos campos) y decidida de nuevo, sin
          // este reset un notifiedAt/notifyError de la decisión ANTERIOR sobrevivía acá y la
          // ficha mostraba el estado de un aviso que no corresponde a esta decisión.
          notifiedAt: null,
          notifyError: null,
        },
  })
  if (count === 0) {
    throw conflict(
      'APPLICATION_ALREADY_DECIDED',
      volviendo ? 'Esta postulación no está decidida.' : 'Esta postulación ya fue decidida.',
    )
  }

  // Volver a revisión no avisa nada: se está deshaciendo, no comunicando.
  if (volviendo || opts.skipEmail) return

  const app = await prisma.application.findUnique({
    where: { id },
    include: { convocatoria: { select: { title: true } } },
  })
  if (!app) return

  // Las de demo traen un email de aspecto real que no es de nadie. Se decide igual, no se avisa.
  if (app.fromSeed) return

  const data = (app.data ?? {}) as Record<string, string>
  const to = typeof data.email === 'string' ? data.email.trim() : ''
  // Sin email no hay a quién escribirle. La decisión ya quedó guardada: no poder avisar
  // nunca bloquea decidir.
  if (!to) return

  const nombre = typeof data.nombre === 'string' && data.nombre.trim() ? data.nombre.trim() : 'Hola'
  const convocatoria = app.convocatoria?.title ?? 'la convocatoria'
  const msg =
    status === 'aceptada'
      ? applicationAcceptedEmail({ name: nombre, convocatoria })
      : applicationRejectedEmail({ name: nombre, convocatoria })

  // Best-effort y DESPUÉS de persistir: que el correo falle no puede desarmar una decisión
  // que el organizador ya tomó y que el postulante ya ve en su app.
  //
  // Ambos updateMany de acá abajo condicionan por `{ id, status }` (no solo `id`): el envío es
  // async y puede tardar. Si mientras el SMTP tarda alguien toca "Deshacer" (vuelve a
  // preinscripta) o decide de nuevo, esta fila ya NO representa la decisión que originó este
  // mail — escribir notifiedAt/notifyError encima sería atribuirle a la decisión ACTUAL (o a
  // ninguna) el resultado de un envío que ya no le corresponde. Con la condición, esos updates
  // simplemente no matchean ninguna fila (count 0) y no hacen nada.
  try {
    await getMailer().send(to, msg)
    await prisma.application.updateMany({ where: { id, status }, data: { notifiedAt: new Date(), notifyError: null } })
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    await prisma.application.updateMany({ where: { id, status }, data: { notifyError: detalle.slice(0, 500) } })
  }
}
