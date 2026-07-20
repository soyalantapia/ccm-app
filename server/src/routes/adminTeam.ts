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
  countActiveOwners,
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

    const user = await createInvitedAdmin({
      email: input.email,
      name: input.name,
      role: input.role as (typeof ROLES_ASIGNABLES)[number],
      invitedBy: req.admin?.userId ? undefined : 'Organizador',
    })
    const email = await avisarAcceso(user, req.body?.invitedByName)
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
    res.json({ ok: true, email: await avisarAcceso(user) })
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

    // ¿Este cambio deja a la plataforma sin ningún dueño que pueda entrar?
    const dejaDeSerOwner = target.role === 'OWNER' && (patch.status === 'disabled' || (patch.role != null && patch.role !== 'OWNER'))
    if (dejaDeSerOwner) {
      const otros = await countActiveOwners(target.id)
      if (otros === 0) {
        throw new ApiError(
          422,
          'LAST_OWNER',
          'Es el único dueño con acceso. Nombrá a otro antes de cambiarle el rol o darlo de baja.',
        )
      }
    }

    await updateAdminUser(target.id, {
      role: patch.role as (typeof ROLES_ASIGNABLES)[number] | undefined,
      status: patch.status,
      name: patch.name,
    })

    // Dar de baja tiene que cortar el acceso YA. El guard igual lo rechazaría en el request
    // siguiente (lee el estado de la base), pero borrar las sesiones deja el rastro limpio y
    // evita que un token dado de baja quede dando vueltas.
    if (patch.status === 'disabled') await deleteAllSessionsOf(target.id)

    res.json({ user: await findAdminById(target.id) })
  } catch (err) {
    next(err)
  }
})
