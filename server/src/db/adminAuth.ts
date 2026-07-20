import { prisma } from '../lib/prisma.js'
import type { AdminRole } from '@prisma/client'
import type { AdminSessionRecord } from '../lib/adminSession.js'

/**
 * Acceso a datos del login del panel. Acá vive todo lo que toca la base; la decisión de si un
 * código o una sesión valen es de los módulos puros (`lib/adminOtp.ts`, `lib/adminSession.ts`).
 */

/** Busca a alguien por email para el login. Normaliza a minúsculas: nadie debería quedar afuera
 *  por haber escrito su mail con una mayúscula. */
export async function findAdminForLogin(email: string) {
  return prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true, role: true, status: true },
  })
}

/**
 * Carga la sesión CON el rol y el estado actuales de la persona.
 *
 * El join no es una optimización: es lo que hace que los permisos sean vivos. Si el rol viniera
 * del token, bajarle el permiso a alguien no tendría efecto hasta que su sesión venciera —una
 * semana— y desactivarlo tampoco. Leyéndolo acá en cada request, los cambios pegan al instante.
 */
export async function loadAdminSession(sessionId: string): Promise<AdminSessionRecord | null> {
  const row = await prisma.adminSession.findUnique({
    where: { id: sessionId },
    select: {
      expiresAt: true,
      userId: true,
      user: { select: { role: true, status: true } },
    },
  })
  if (!row) return null
  return {
    expiresAt: row.expiresAt,
    userId: row.userId,
    role: row.user.role,
    userStatus: row.user.status,
  }
}

export async function createAdminSession(userId: string, expiresAt: Date): Promise<{ id: string }> {
  return prisma.adminSession.create({ data: { userId, expiresAt }, select: { id: true } })
}

/** Cerrar sesión: borra la fila, con lo cual el token deja de valer inmediatamente. */
export async function deleteAdminSession(sessionId: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { id: sessionId } })
}

/** Saca a alguien de TODAS sus sesiones. Se usa al desactivarlo o al bajarle el rol. */
export async function deleteAllSessionsOf(userId: string): Promise<number> {
  const { count } = await prisma.adminSession.deleteMany({ where: { userId } })
  return count
}

/**
 * Barrido de mantenimiento: borra sesiones vencidas y códigos ya muertos (consumidos o vencidos).
 * No es crítico para la seguridad —validateSession y verifyOtp ya rechazan lo vencido— pero sin
 * esto AdminLoginCode y AdminSession crecen para siempre. Se llama de forma oportunista tras cada
 * login, así que se mantiene solo sin necesitar un cron.
 */
export async function purgeStaleAuthRows(now: Date): Promise<{ sessions: number; codes: number }> {
  const [s, c] = await Promise.all([
    prisma.adminSession.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.adminLoginCode.deleteMany({
      where: { OR: [{ consumedAt: { not: null } }, { expiresAt: { lte: now } }] },
    }),
  ])
  return { sessions: s.count, codes: c.count }
}

/* ─── Códigos de un solo uso ─── */

export async function issueLoginCode(userId: string, codeHash: string, expiresAt: Date) {
  return prisma.adminLoginCode.create({ data: { userId, codeHash, expiresAt } })
}

/** Cuántos códigos se emitieron para esta persona desde `since` — alimenta el rate limit. */
export async function countCodesSince(userId: string, since: Date): Promise<number> {
  return prisma.adminLoginCode.count({ where: { userId, createdAt: { gte: since } } })
}

/** El código más reciente sin consumir. Pedir uno nuevo deja el anterior inservible por
 *  esta vía: siempre se valida contra el último. */
export async function latestLiveCode(userId: string) {
  return prisma.adminLoginCode.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, codeHash: true, expiresAt: true, attempts: true, consumedAt: true },
  })
}

/** Suma un intento fallido. Al llegar al tope el código muere aunque después se acierte. */
export async function bumpAttempts(codeId: string): Promise<void> {
  await prisma.adminLoginCode.update({ where: { id: codeId }, data: { attempts: { increment: 1 } } })
}

/** Marca el código como usado. Un código, un ingreso. */
export async function consumeCode(codeId: string, at: Date): Promise<void> {
  await prisma.adminLoginCode.update({ where: { id: codeId }, data: { consumedAt: at } })
}

/** Registra el ingreso y, si era la primera vez, pasa a la persona de `invited` a `active`. */
export async function touchLastLogin(userId: string, at: Date): Promise<void> {
  await prisma.adminUser.update({
    where: { id: userId },
    data: { lastLogin: at, status: 'active' },
  })
}

/* ─── Equipo ─── */

export async function listAdminUsers() {
  return prisma.adminUser.findMany({
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
    select: {
      id: true, email: true, name: true, role: true, status: true,
      invitedBy: true, invitedAt: true, lastLogin: true,
    },
  })
}

export async function findAdminById(id: string) {
  return prisma.adminUser.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, role: true, status: true,
      invitedBy: true, invitedAt: true, lastLogin: true,
    },
  })
}

export async function createInvitedAdmin(input: {
  email: string
  name: string
  role: AdminRole
  invitedBy?: string
}) {
  return prisma.adminUser.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      role: input.role,
      status: 'invited',
      invitedBy: input.invitedBy ?? null,
    },
    select: {
      id: true, email: true, name: true, role: true, status: true,
      invitedBy: true, invitedAt: true, lastLogin: true,
    },
  })
}

export async function updateAdminUser(
  id: string,
  patch: { role?: AdminRole; status?: 'invited' | 'active' | 'disabled'; name?: string },
) {
  return prisma.adminUser.update({ where: { id }, data: patch })
}

/**
 * Actualiza a alguien que ESTÁ DEJANDO de ser OWNER (baja o cambio de rol), pero sólo si el
 * cambio no deja la plataforma sin ningún OWNER activo. Devuelve true si actualizó, false si lo
 * habría dejado sin owners.
 *
 * La invariante ("queda otro owner activo") se re-chequea DENTRO del mismo UPDATE con un EXISTS,
 * en un único statement atómico. Contarla antes y actualizar después —dos statements— tenía un
 * TOCTOU: dos bajas concurrentes del anteúltimo y el último owner pasaban ambas el count y dejaban
 * la plataforma con cero owners (reproducido: 20/25 corridas). Con el chequeo adentro del UPDATE,
 * Postgres serializa las dos escrituras y la segunda no encuentra "otro owner" → no afecta filas.
 */
export async function updateLeavingOwner(
  id: string,
  patch: { role?: AdminRole; status?: 'invited' | 'active' | 'disabled'; name?: string },
): Promise<boolean> {
  const affected = await prisma.$executeRaw`
    UPDATE "AdminUser"
    SET role   = COALESCE(${patch.role ?? null}::"AdminRole", role),
        status = COALESCE(${patch.status ?? null}::"AdminUserStatus", status),
        name   = COALESCE(${patch.name ?? null}, name)
    WHERE id = ${id}
      AND EXISTS (
        SELECT 1 FROM "AdminUser"
        WHERE role = 'OWNER' AND status <> 'disabled' AND id <> ${id}
      )`
  return affected > 0
}
