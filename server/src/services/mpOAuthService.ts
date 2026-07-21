/**
 * Única puerta a los tokens de Mercado Pago. Nadie más lee la tabla MpConnection: el resto
 * pide getValidToken() y no se entera de si hubo que renovar.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { ApiError } from '../lib/errors.js'
import * as mpApi from '../lib/mpApi.js'

const FILA = 'default'
/** Se renueva si vence dentro de este margen (no esperamos al último minuto). */
const MARGEN_RENOVACION_MS = 24 * 3600_000
/** Los state viven poco: es el tiempo entre tocar Conectar y volver de MP. */
const STATE_TTL_MS = 10 * 60_000

/** state pendientes, en memoria. Si el proceso reinicia a mitad del flujo, se reintenta y listo. */
const statesEmitidos = new Map<string, number>()

export interface MpStatus {
  conectado: boolean
  cuenta?: string
  desde?: string
  vence?: string
}

function limpiarStatesVencidos(): void {
  const ahora = Date.now()
  for (const [s, ts] of statesEmitidos) if (ahora - ts > STATE_TTL_MS) statesEmitidos.delete(s)
}

/** URL de autorización de MP. El state de un solo uso evita que alguien falsifique la vuelta. */
export async function buildAuthUrl(): Promise<string> {
  if (!env.MP_CLIENT_ID || !env.MP_REDIRECT_URI) {
    throw new ApiError(503, 'MP_NOT_CONFIGURED', 'Falta configurar la aplicación de Mercado Pago (MP_CLIENT_ID / MP_REDIRECT_URI)')
  }
  limpiarStatesVencidos()
  const state = randomUUID()
  statesEmitidos.set(state, Date.now())
  const u = new URL('https://auth.mercadopago.com.ar/authorization')
  u.searchParams.set('client_id', env.MP_CLIENT_ID)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('platform_id', 'mp')
  u.searchParams.set('redirect_uri', env.MP_REDIRECT_URI)
  u.searchParams.set('state', state)
  return u.toString()
}

async function guardar(t: mpApi.MpTokenResponse): Promise<void> {
  const data = {
    mpUserId: String(t.user_id),
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    publicKey: t.public_key ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scope: t.scope ?? null,
  }
  await prisma.mpConnection.upsert({ where: { id: FILA }, create: { id: FILA, ...data }, update: data })
}

/** Cierra el flujo OAuth: valida el state, canjea el código y guarda la conexión. */
export async function exchangeCode(code: string, state: string): Promise<void> {
  limpiarStatesVencidos()
  if (!statesEmitidos.delete(state)) {
    throw new ApiError(400, 'MP_STATE_INVALID', 'La vuelta de Mercado Pago no es válida. Probá conectar de nuevo.')
  }
  await guardar(await mpApi.exchangeCodeForTokens(code))
}

/**
 * Lock en proceso para la renovación. Sin esto, dos requests que caen juntas dentro de
 * MARGEN_RENOVACION_MS leen el mismo refreshToken y llaman las dos a mpApi.refreshTokens()
 * con ese valor. MP ROTA el refresh token en cada uso: la segunda llamada explota en el acto
 * (502 MP_API_ERROR), y encima cuál de los dos upsert gana es una carrera — el que pierde deja
 * guardado un refreshToken que MP ya no reconoce, lo que rompe en silencio la PRÓXIMA
 * renovación, recién cuando falle un cobro real meses después.
 * Con esta promesa compartida, si ya hay una renovación en vuelo todas las llamadas que caen
 * mientras tanto esperan ESA (no disparan una propia) y reciben su mismo resultado.
 * Alcanza con un lock en memoria (no distribuido) porque hoy el servicio corre en un solo
 * contenedor de Railway, sin réplicas. Si el día de mañana esto escala horizontalmente, cada
 * instancia tiene su propio lock y deja de alcanzar — ahí hace falta coordinación entre
 * procesos (advisory lock de Postgres, Redis, etc.).
 */
let renovacionEnCurso: Promise<string> | null = null

async function renovarYGuardar(refreshToken: string): Promise<string> {
  const renovado = await mpApi.refreshTokens(refreshToken)
  await guardar(renovado)
  return renovado.access_token
}

/** Token utilizable. Renueva solo si está por vencer. */
export async function getValidToken(): Promise<string> {
  if (renovacionEnCurso) return renovacionEnCurso

  const fila = await prisma.mpConnection.findUnique({ where: { id: FILA } })
  if (!fila) throw new ApiError(503, 'MP_NOT_CONNECTED', 'Mercado Pago no está conectado')
  if (fila.expiresAt.getTime() - Date.now() > MARGEN_RENOVACION_MS) return fila.accessToken

  // Puede que otra llamada haya arrancado la renovación mientras esperábamos este findUnique.
  if (renovacionEnCurso) return renovacionEnCurso

  // Si falla, el finally libera el lock igual: no queda una promesa rechazada cacheada
  // rompiendo todas las llamadas siguientes.
  renovacionEnCurso = renovarYGuardar(fila.refreshToken).finally(() => {
    renovacionEnCurso = null
  })
  return renovacionEnCurso
}

export async function isConnected(): Promise<boolean> {
  return (await prisma.mpConnection.findUnique({ where: { id: FILA } })) !== null
}

/** Estado para el panel. Sin tokens: esta respuesta viaja al navegador. */
export async function getStatus(): Promise<MpStatus> {
  const fila = await prisma.mpConnection.findUnique({ where: { id: FILA } })
  if (!fila) return { conectado: false }
  return {
    conectado: true,
    cuenta: fila.mpUserId,
    desde: fila.connectedAt.toISOString(),
    vence: fila.expiresAt.toISOString(),
  }
}

export async function disconnect(): Promise<void> {
  await prisma.mpConnection.deleteMany({ where: { id: FILA } })
}
