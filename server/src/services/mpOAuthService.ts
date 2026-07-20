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

/** Token utilizable. Renueva solo si está por vencer. */
export async function getValidToken(): Promise<string> {
  const fila = await prisma.mpConnection.findUnique({ where: { id: FILA } })
  if (!fila) throw new ApiError(503, 'MP_NOT_CONNECTED', 'Mercado Pago no está conectado')
  if (fila.expiresAt.getTime() - Date.now() > MARGEN_RENOVACION_MS) return fila.accessToken
  const renovado = await mpApi.refreshTokens(fila.refreshToken)
  await guardar(renovado)
  return renovado.access_token
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
