import { Router } from 'express'
import { z } from 'zod'
import { conflict, notFound, badRequest, ApiError } from '../lib/errors.js'
import { requirePermission } from '../middlewares/admin.js'
import { ROLES_ASIGNABLES, ROLE_LABEL, ROLE_BLURB, canLogin } from '../domain/adminRoles.js'
import {
  listAdminUsers,
  findAdminById,
  findAdminForLogin,
  createInvitedAdmin,
  updateAdminUser,
  updateLeavingOwner,
  deleteAllSessionsOf,
} from '../db/adminAuth.js'
import { getMailer } from '../mail/mailer.js'
import { accessGrantedEmail } from '../mail/templates.js'
import { loginUrl } from './adminAuth.js'

/**
 * Gestión del equipo. Cada ruta repite `requirePermission('team:manage')` en vez de usar un
 * alias: el permiso tiene que LEERSE al lado de la ruta, y adminGuards.test.ts lo verifica
 * literalmente — un alias mal definido sería invisible para esa verificación.
 *
 * Invitar es simplemente crear a la persona y avisarle por mail. No hay token de invitación:
 * el mail la manda al login de siempre y ahí pide su código como cualquier otro día. Un único
 * mecanismo de entrada, sin una segunda credencial que expirar, revocar y poder filtrar.
 */
export const adminTeamRouter = Router()

const rolSchema = z.enum(ROLES_ASIGNABLES as unknown as [string, ...string[]])

/** Nombre de quien está invitando, tomado de su sesión. Con el token compartido de la etapa
 *  anterior no hay persona identificable detrás, así que se firma de forma genérica. */
async function nombreDeQuienInvita(req: import('express').Request): Promise<string> {
  if (!req.admin?.userId) return 'El equipo de CCM'
  const yo = await findAdminById(req.admin.userId)
  return yo?.name?.trim() || yo?.email || 'El equipo de CCM'
}

/** Manda el "ya tenés acceso". Si el envío falla, no se pierde el alta: se informa y listo. */
async function avisarAcceso(
  user: { email: string; name: string | null; role: (typeof ROLES_ASIGNABLES)[number] },
  invitedBy?: string,
) {
  const msg = accessGrantedEmail({
    name: user.name ?? user.email,
    role: user.role,
    loginUrl: loginUrl(),
    invitedBy,
  })
  try {
    const r = await getMailer().send(user.email, msg)
    return { sent: r.delivered, to: user.email, subject: msg.subject }
  } catch (err) {
    console.error('[team] no se pudo enviar la invitación:', err)
    return { sent: false, to: user.email, subject: msg.subject, error: 'No se pudo enviar el mail' }
  }
}

/** GET /admin/team/roles — catálogo para el selector del panel. */
adminTeamRouter.get('/admin/team/roles', requirePermission('team:manage'), (_req, res) => {
  res.json({
    roles: ROLES_ASIGNABLES.map((id) => ({
      id,
      label: ROLE_LABEL[id],
      blurb: ROLE_BLURB[id],
      canLogin: canLogin(id),
    })),
  })
})

/** GET /admin/team — el equipo. */
adminTeamRouter.get('/admin/team', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    res.json(await listAdminUsers())
  } catch (err) {
    next(err)
  }
})

/** POST /admin/team/invite — dar de alta a alguien y avisarle. */
adminTeamRouter.post('/admin/team/invite', requirePermission('team:manage'), async (req, res, next) => {
  try {
    const input = z
      .object({
        email: z.string().trim().email().max(254),
        name: z.string().trim().min(1).max(120),
        role: rolSchema,
      })
      .parse(req.body)

    const yaEsta = await findAdminForLogin(input.email)
    if (yaEsta) throw conflict('USER_EXISTS', 'Ya hay alguien del equipo con ese email.')

    // Quién invita sale de la SESIÓN, no del body: si viniera del cliente, cualquiera podría
    // firmar la invitación con el nombre de otro. Con el token compartido viejo no hay persona
    // detrás, así que queda genérico.
    const quienInvita = await nombreDeQuienInvita(req)

    const user = await createInvitedAdmin({
      email: input.email,
      name: input.name,
      role: input.role as (typeof ROLES_ASIGNABLES)[number],
      invitedBy: quienInvita,
    })
    const email = await avisarAcceso(user, quienInvita)
    res.status(201).json({ user, email })
  } catch (err) {
    next(err)
  }
})

/** POST /admin/team/:id/resend — reenviar el aviso de acceso. */
adminTeamRouter.post('/admin/team/:id/resend', requirePermission('team:manage'), async (req, res, next) => {
  try {
    const user = await findAdminById(req.params.id)
    if (!user) throw notFound('USER_NOT_FOUND', 'No existe esa persona en el equipo.')
    res.json({ ok: true, email: await avisarAcceso(user, await nombreDeQuienInvita(req)) })
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /admin/team/:id — cambiar rol o estado.
 *
 * Dos redes contra quedarse sin nadie que pueda administrar:
 *  - nadie puede quitarse a sí mismo el acceso (el error clásico de un solo click),
 *  - no se puede dejar la plataforma sin ningún OWNER en condiciones de entrar.
 */
adminTeamRouter.patch('/admin/team/:id', requirePermission('team:manage'), async (req, res, next) => {
  try {
    const patch = z
      .object({
        role: rolSchema.optional(),
        status: z.enum(['invited', 'active', 'disabled']).optional(),
        name: z.string().trim().min(1).max(120).optional(),
      })
      .parse(req.body)

    if (patch.role === undefined && patch.status === undefined && patch.name === undefined) {
      throw badRequest('NOTHING_TO_UPDATE', 'No hay nada que cambiar.')
    }

    const target = await findAdminById(req.params.id)
    if (!target) throw notFound('USER_NOT_FOUND', 'No existe esa persona en el equipo.')

    const soyYo = req.admin?.userId != null && req.admin.userId === target.id
    const mePierdoElAcceso = patch.status === 'disabled' || (patch.role != null && patch.role !== 'OWNER')
    if (soyYo && mePierdoElAcceso) {
      throw new ApiError(422, 'SELF_LOCKOUT', 'No podés quitarte a vos mismo el acceso de dueño.')
    }

    const datos = {
      role: patch.role as (typeof ROLES_ASIGNABLES)[number] | undefined,
      status: patch.status,
      name: patch.name,
    }

    // ¿Este cambio deja de mantener a alguien como OWNER activo? Si sí, el update va por la vía
    // atómica que re-valida "queda otro owner" DENTRO del propio statement — si no, dos bajas
    // concurrentes podrían dejar la plataforma sin ningún dueño (el chequeo separado tenía TOCTOU).
    const dejaDeSerOwner =
      target.role === 'OWNER' && (patch.status === 'disabled' || (patch.role != null && patch.role !== 'OWNER'))
    if (dejaDeSerOwner) {
      const ok = await updateLeavingOwner(target.id, datos)
      if (!ok) {
        throw new ApiError(
          422,
          'LAST_OWNER',
          'Es el único dueño con acceso. Nombrá a otro antes de cambiarle el rol o darlo de baja.',
        )
      }
    } else {
      await updateAdminUser(target.id, datos)
    }

    // Dar de baja tiene que cortar el acceso YA. El guard igual lo rechazaría en el request
    // siguiente (lee el estado de la base), pero borrar las sesiones deja el rastro limpio y
    // evita que un token dado de baja quede dando vueltas.
    if (patch.status === 'disabled') await deleteAllSessionsOf(target.id)

    res.json({ user: await findAdminById(target.id) })
  } catch (err) {
    next(err)
  }
})
