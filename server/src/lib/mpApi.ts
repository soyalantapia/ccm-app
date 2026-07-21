/**
 * Único módulo que habla HTTP con Mercado Pago. No tiene lógica de negocio a propósito: así
 * los servicios se testean mockeando este archivo, sin red.
 */
import { env } from './env.js'
import { ApiError } from './errors.js'

const AUTH_BASE = 'https://api.mercadopago.com'
// Si MP no contesta en este lapso abortamos, en vez de dejar el await colgado para siempre:
// en /mp/callback eso es una persona mirando una request eterna en vez de un error rápido.
const TIMEOUT_MS = 10_000

export interface MpTokenResponse {
  access_token: string
  refresh_token: string
  user_id: number
  public_key?: string
  expires_in: number
  scope?: string
}

export interface MpPayment {
  id: number
  status: 'approved' | 'pending' | 'in_process' | 'rejected' | 'cancelled' | 'refunded'
  external_reference?: string
  transaction_amount?: number
}

/**
 * Corre `op` (conexión + headers + lectura del cuerpo, todo junto) bajo un único timeout de
 * TIMEOUT_MS: si no terminó para entonces abortamos y tiramos el mismo ApiError de siempre.
 * El timer se limpia recién en el `finally`, después de que `op` terminó de leer el cuerpo —
 * si lo limpiáramos apenas resuelve el `fetch()` inicial (como pasaba antes), un cuerpo que
 * nunca llega quedaría sin nada que lo aborte: MP manda los headers y se cuelga transmitiendo.
 */
async function conTimeout<T>(op: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await op(controller.signal)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(502, 'MP_API_ERROR', 'Mercado Pago no respondió a tiempo')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  return conTimeout(async (signal) => {
    const res = await fetch(`${AUTH_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      throw new ApiError(502, 'MP_API_ERROR', `Mercado Pago respondió ${res.status}`, detalle.slice(0, 400))
    }
    return (await res.json()) as T
  })
}

/** Canjea el código de autorización por tokens (fin del flujo OAuth). */
export function exchangeCodeForTokens(code: string): Promise<MpTokenResponse> {
  return post<MpTokenResponse>('/oauth/token', {
    grant_type: 'authorization_code',
    client_id: env.MP_CLIENT_ID,
    client_secret: env.MP_CLIENT_SECRET,
    code,
    redirect_uri: env.MP_REDIRECT_URI,
  })
}

/** Renueva el access token antes de que venza. */
export function refreshTokens(refreshToken: string): Promise<MpTokenResponse> {
  return post<MpTokenResponse>('/oauth/token', {
    grant_type: 'refresh_token',
    client_id: env.MP_CLIENT_ID,
    client_secret: env.MP_CLIENT_SECRET,
    refresh_token: refreshToken,
  })
}

/** Crea la preferencia de Checkout Pro. Devuelve el link al que mandar al comprador. */
export function createPreference(
  accessToken: string,
  body: unknown,
): Promise<{ id: string; init_point: string }> {
  return post<{ id: string; init_point: string }>('/checkout/preferences', body, accessToken)
}

/**
 * Todos los pagos que MP conoce para un `external_reference` (= Payment.id nuestro).
 *
 * Es la ÚNICA forma de contestar "¿este cobro está realmente abandonado?" sin depender de que el
 * webhook haya llegado. Hace falta para no vencer un cupón de efectivo/Rapipago recién generado:
 * entre que el comprador genera el cupón y que el aviso de MP llega (o se pierde y se reintenta
 * durante horas) nuestro Payment sigue con `mpPaymentId: null` y parecería abandonado. Ver
 * `vencerPendientesAbandonados` en mpCheckoutService.
 *
 * Una preferencia puede tener VARIOS pagos (la tarjeta rebotó y reintentó con otra), por eso
 * devuelve la lista entera y decide el que llama.
 */
export async function searchPaymentsByExternalReference(
  accessToken: string,
  externalReference: string,
): Promise<MpPayment[]> {
  return conTimeout(async (signal) => {
    const url = `${AUTH_BASE}/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
    if (!res.ok) {
      throw new ApiError(502, 'MP_API_ERROR', `Mercado Pago respondió ${res.status} al buscar pagos por referencia`)
    }
    const cuerpo = (await res.json()) as { results?: MpPayment[] }
    return cuerpo.results ?? []
  })
}

/** Consulta el estado REAL de un pago. Nunca se le cree al cuerpo del webhook. */
export async function getPayment(accessToken: string, paymentId: string): Promise<MpPayment> {
  return conTimeout(async (signal) => {
    const res = await fetch(`${AUTH_BASE}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
    if (!res.ok) throw new ApiError(502, 'MP_API_ERROR', `Mercado Pago respondió ${res.status} al consultar el pago`)
    return (await res.json()) as MpPayment
  })
}
