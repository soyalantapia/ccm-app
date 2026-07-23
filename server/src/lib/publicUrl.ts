import { env } from './env.js'

/**
 * La base pública del sitio, sin la barra final. Es el origen con el que se arman los links que
 * salen del server hacia afuera: el login del panel, el redirect de Mercado Pago, y el link de
 * una entrada regalada.
 *
 * Estaba escrita idéntica en adminAuth.ts y mpCheckoutService.ts, las dos cayendo en silencio a
 * localhost:5173. Un link que codifica localhost no se arregla después de mandarlo, así que
 * PUBLIC_BASE_URL es incondicional en producción (assertProd). Acá el fallback a localhost es
 * sólo para dev.
 */
export function publicBase(): string {
  return (env.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
}
