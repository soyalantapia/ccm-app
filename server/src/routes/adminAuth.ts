import { Router } from 'express'
import { z } from 'zod'
import { env } from '../lib/env.js'
import { unauthorized, ApiError } from '../lib/errors.js'
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiry,
  otpWindowStart,
  isOtpThrottled,
  OTP_TTL_MIN,
} from '../lib/adminOtp.js'
import { signSessionToken, sessionExpiry } from '../lib/adminSession.js'
import { canLogin, permissionsOf, homePathFor } from '../domain/adminRoles.js'
import {
  findAdminForLogin,
  issueLoginCode,
  countCodesSince,
  latestLiveCode,
  bumpAttempts,
  consumeCode,
  createAdminSession,
  deleteAdminSession,
  touchLastLogin,
  findAdminById,
  purgeStaleAuthRows,
} from '../db/adminAuth.js'
import { getMailer } from '../mail/mailer.js'
import { otpEmail } from '../mail/templates.js'
import { requireAdmin } from '../middlewares/admin.js'

/**
 * Login del panel: se pide un código al email y se entra con él. No hay contraseñas.
 *
 * ⚠️ Este router se monta en /api/v1/auth/admin/*, FUERA del prefijo /admin. No es un detalle
 * de estilo: /admin está cubierto por requireAdmin, así que colgar el login ahí sería pedir
 * estar logueado para poder loguearse.
 */
export const adminAuthRouter = Router()

function pepper(): string {
  // Sin valor por defecto a propósito: un pepper de juguete haría que los códigos de producción
  // sean reversibles por cualquiera que conozca el default.
  if (!env.OTP_PEPPER) throw new ApiError(503, 'OTP_NOT_CONFIGURED', 'El login por código no está configurado.')
  return env.OTP_PEPPER
}

/** El mismo error para código equivocado, vencido o ya usado: distinguirlos le daría a quien
 *  esté probando información sobre qué tan cerca está. */
const codigoInvalido = () =>
  unauthorized('INVALID_CODE', 'El código no es válido, ya venció o ya se usó. Pedí uno nuevo.')

/** Base pública para armar el link del email. */
const publicBase = () => (env.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
export const loginUrl = () => `${publicBase()}/admin/login`

/** Emite y manda el código, en segundo plano. Todo el trabajo que sólo ocurre cuando el email
 *  EXISTE vive acá, corriendo DESPUÉS de responder — ver por qué en el handler. */
async function emitirYEnviar(user: { id: string; email: string; name: string | null; role: import('@prisma/client').AdminRole }): Promise<void> {
  const now = new Date()
  // Tope de códigos por ventana: frena el email-bombing y acota cuántos intentos totales puede
  // hacer alguien probando. Si se pasa, no se emite ni se manda nada.
  const recientes = await countCodesSince(user.id, otpWindowStart(now))
  if (isOtpThrottled(recientes)) return
  const code = generateOtp()
  await issueLoginCode(user.id, hashOtp(code, user.id, pepper()), otpExpiry(now))
  try {
    await getMailer().send(user.email, otpEmail({ name: user.name ?? user.email, code, ttlMin: OTP_TTL_MIN }))
  } catch (err) {
    // Que falle el proveedor no puede tumbar nada: el código ya quedó emitido y se puede pedir otro.
    console.error('[auth] no se pudo enviar el código:', err)
  }
}

/**
 * POST /api/v1/auth/admin/request-otp
 *
 * Responde SIEMPRE { ok: true }, exista el email o no. Y responde ANTES de emitir o mandar nada:
 * si el trabajo del camino "el email existe" (contar códigos, insertar, esperar al SMTP) corriera
 * antes de responder, ese camino tardaría segundos y el del email inexistente milisegundos — y esa
 * diferencia de tiempo delataría quién es organizador, justo lo que el cuerpo idéntico busca ocultar.
 * Emitir y mandar quedan en segundo plano, después de cerrar la respuesta.
 */
adminAuthRouter.post('/auth/admin/request-otp', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().trim().email().max(254) }).parse(req.body)
    const user = await findAdminForLogin(email)

    res.json({ ok: true })

    if (user && user.status !== 'disabled' && canLogin(user.role)) {
      void emitirYEnviar(user).catch((err) => console.error('[auth] emitirYEnviar falló:', err))
    }
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/auth/admin/verify-otp — valida el código y abre la sesión. */
adminAuthRouter.post('/auth/admin/verify-otp', async (req, res, next) => {
  try {
    const { email, code } = z
      .object({ email: z.string().trim().email().max(254), code: z.string().trim().regex(/^\d{6}$/) })
      .parse(req.body)

    // Todo lo que no sea un canje válido responde el MISMO error genérico: email inexistente,
    // dado de baja, rol sin acceso, sin código vivo, código equivocado, vencido, agotado. Un
    // mensaje o un status distinto para cada caso volvería a convertir esto en un oráculo de
    // enumeración (el 429 de "demasiados intentos" delataba que la cuenta existía y estaba activa).
    const user = await findAdminForLogin(email)
    if (!user || user.status === 'disabled' || !canLogin(user.role)) throw codigoInvalido()

    const record = await latestLiveCode(user.id)
    if (!record) throw codigoInvalido()

    const now = new Date()
    const verdict = verifyOtp(record, code, { now, userId: user.id, pepper: pepper() })
    if (verdict !== 'ok') {
      // Sólo un código equivocado gasta un intento: si ya venció, se usó o se agotó, no hay
      // nada que gastar. El mensaje de codigoInvalido() ya guía a pedir uno nuevo.
      if (verdict === 'mismatch') await bumpAttempts(record.id)
      throw codigoInvalido()
    }

    await consumeCode(record.id, now)
    await touchLastLogin(user.id, now)

    const expiresAt = sessionExpiry(now)
    const session = await createAdminSession(user.id, expiresAt)
    const token = signSessionToken(session.id, expiresAt)

    res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: permissionsOf(user.role),
      },
      home: homePathFor(user.role),
    })

    // Mantenimiento oportunista, después de responder (no agrega latencia al login): purga
    // sesiones vencidas y códigos ya muertos para que esas tablas no crezcan sin fin.
    void purgeStaleAuthRows(now).catch((err) => console.error('[auth] purga falló:', err))
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/auth/admin/logout — borra la sesión, con lo cual el token deja de valer. */
adminAuthRouter.post('/auth/admin/logout', requireAdmin, async (req, res, next) => {
  try {
    if (req.admin?.sessionId) await deleteAdminSession(req.admin.sessionId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/v1/auth/admin/me — quién soy y qué puedo hacer.
 * El front lo usa al arrancar para saber si la sesión guardada sigue viva y armar su menú.
 */
adminAuthRouter.get('/auth/admin/me', requireAdmin, async (req, res, next) => {
  try {
    const role = req.admin!.role
    // Con el token compartido viejo no hay persona detrás: se responde el rol que otorga.
    if (req.admin!.via === 'legacy-token') {
      res.json({
        user: { id: null, email: null, name: 'Organizador', role, permissions: permissionsOf(role) },
        via: 'legacy-token',
        home: homePathFor(role),
      })
      return
    }
    const u = await findAdminById(req.admin!.userId!)
    if (!u || u.status === 'disabled') throw unauthorized('ADMIN_SESSION_INVALID', 'Sesión inválida.')
    res.json({
      user: { id: u.id, email: u.email, name: u.name, role: u.role, permissions: permissionsOf(u.role) },
      via: 'session',
      home: homePathFor(u.role),
    })
  } catch (err) {
    next(err)
  }
})
