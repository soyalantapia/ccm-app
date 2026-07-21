/**
 * Único lugar del código que cierra un cobro. Existe porque desde que un Payment cubre N
 * recursos, "el cobro terminó" son DOS escrituras: la cabecera (Payment.status) y el espejo de
 * las líneas (PaymentItem.closedAt), y ese espejo es literalmente lo que hace cumplir el índice
 * único parcial contra el doble cobro:
 *
 *     CREATE UNIQUE INDEX "PaymentItem_vivo_por_recurso"
 *       ON "PaymentItem"("kind","resourceId") WHERE "closedAt" IS NULL;
 *
 * INVARIANTE: `closedAt IS NULL` ⟺ `Payment.status = 'pending'`. Si se desincroniza, el índice
 * deja de proteger EN SILENCIO (una línea cerrada sobre un cobro vivo = el recurso se puede
 * volver a cobrar) o traba un recurso para siempre (una línea viva sobre un cobro muerto). Por
 * eso hay un solo escritor: `cerrarPago` acá y `vencerPendientesAbandonados` en
 * mpCheckoutService. Nunca escribir `closedAt` a mano desde otro lado.
 */
import { prisma } from '../lib/prisma.js'

/** Estados terminales de un cobro: todos liberan las líneas. `pending` NO es uno de ellos. */
export type EstadoCerrado = 'approved' | 'rejected' | 'refunded' | 'expired'

/**
 * Cierra un cobro: cabecera y líneas se mueven JUNTAS o no se mueve nada (`$transaction`).
 *
 * ⚠️ `status: 'pending'` NUNCA pasa por acá. Un pago en efectivo que MP reporta como pendiente
 * (cupón de Rapipago generado, todavía sin acreditar) sigue siendo un cobro VIVO: sus líneas
 * tienen que quedar con `closedAt = null` para que el recurso siga reservado. Esa rama escribe
 * solo la cabecera, a propósito (ver mpWebhookService).
 *
 * @param extra campos adicionales de la cabecera (mpPaymentId, raw) que se guardan en la misma
 *              transacción que el cierre.
 */
export async function cerrarPago(
  paymentId: string,
  status: EstadoCerrado,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await prisma.$transaction([
    prisma.payment.update({ where: { id: paymentId }, data: { status, ...extra } }),
    prisma.paymentItem.updateMany({ where: { paymentId, closedAt: null }, data: { closedAt: new Date() } }),
  ])
}

/**
 * Igual que `cerrarPago` pero con bloqueo optimista sobre el estado que se leyó antes: si entre
 * la lectura y esta escritura se coló otro aviso (típicamente el APROBADO, en paralelo), esta
 * escritura no pisa nada y devuelve `false`. Es la versión que usa la rama no-aprobada del
 * webhook, donde el aviso que estamos procesando puede ser viejo.
 */
export async function cerrarPagoSiSigueEn(
  paymentId: string,
  estadoEsperado: string,
  status: EstadoCerrado,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  // Transacción INTERACTIVA (callback), no la forma de array: las líneas se cierran SOLO si la
  // cabecera se movió de verdad. Con un array las dos escrituras corren siempre, así que un
  // aviso que perdió la carrera igual habría cerrado las líneas de un cobro ajeno ya aprobado
  // — justo la desincronización que rompe el índice en silencio.
  return prisma.$transaction(async (tx) => {
    const cabecera = await tx.payment.updateMany({
      where: { id: paymentId, status: estadoEsperado as never },
      data: { status, ...extra },
    })
    if (cabecera.count !== 1) return false
    await tx.paymentItem.updateMany({ where: { paymentId, closedAt: null }, data: { closedAt: new Date() } })
    return true
  })
}
