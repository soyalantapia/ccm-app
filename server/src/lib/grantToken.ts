import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env.js'

/**
 * El token del link de una entrada regalada.
 *
 * Se DERIVA por HMAC de `${grantId}.${tokenVersion}` con GRANT_TOKEN_SECRET. No se guarda en la
 * base, ni en claro ni hasheado, por dos razones que se contradicen si el token viviera guardado:
 *
 * - El organizador tiene que poder REENVIAR el mismo link (es una acción del panel). Guardarlo
 *   hasheado —como AdminLoginCode.codeHash— lo haría irrecuperable: no se podría reenviar.
 * - Guardarlo en claro convierte una filtración de la base en entradas gratis para cualquiera.
 *
 * Derivado resuelve las dos: reenviar = recomputar `derivar(id, version)` (mismo id y versión →
 * mismo token). Rotar el link sin borrar el grant = subir `tokenVersion` (el token viejo deja de
 * verificar). Y sin el secreto no se puede fabricar un token, así que la base sola no alcanza.
 *
 * El token es un HMAC en base64url: no lleva el id adentro. Por eso el link es `/i/:grantId.:token`
 * (o los dos como query): el server necesita el id para saber qué versión usar al verificar.
 */

function secret(): string {
  if (!env.GRANT_TOKEN_SECRET) throw new Error('GRANT_TOKEN_SECRET no configurado')
  return env.GRANT_TOKEN_SECRET
}

/** El token para el link de este grant, en su versión actual. */
export function derivarTokenGrant(grantId: string, tokenVersion: number): string {
  return createHmac('sha256', secret()).update(`${grantId}.${tokenVersion}`).digest('base64url')
}

/**
 * ¿`token` corresponde a `grantId` en su `tokenVersion` actual? Comparación en tiempo constante.
 * Devolver true NO significa que el grant valga: eso lo decide el servicio contra la fila (status,
 * ya reclamado, etc.). Esto sólo dice "el link no fue adulterado y es de esta versión".
 */
export function verificarTokenGrant(grantId: string, tokenVersion: number, token: string): boolean {
  const esperado = Buffer.from(derivarTokenGrant(grantId, tokenVersion))
  const recibido = Buffer.from(token)
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido)
}
