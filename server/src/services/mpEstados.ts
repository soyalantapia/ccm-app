/**
 * Qué estados de Mercado Pago significan "hay plata VIVA para este cobro".
 *
 * Vive en su propio módulo porque lo necesitan los DOS lados y tienen que responder lo mismo:
 * `mpCheckoutService.vencerPendientesAbandonados` (antes de vencer un pending abandonado) y
 * `mpWebhookService` (antes de liberar las líneas ante un rechazo). Si las dos listas se
 * separaran, un estado agregado de un solo lado abriría exactamente el agujero que las dos
 * consultas vienen a tapar.
 *
 * `pending`/`in_process` son el cupón de efectivo/Rapipago esperando acreditación o un pago en
 * revisión; `authorized` es una tarjeta autorizada sin capturar; `approved` es plata ya cobrada.
 *
 * Lo que NO está acá —`rejected`, `cancelled`, `charged_back`, `refunded`— son intentos
 * TERMINADOS: si todos los pagos del cobro están así, el cobro está muerto de verdad y liberar el
 * recurso es lo correcto. Meterlos en la lista trabaría el recurso para siempre con solo hacer
 * rebotar una tarjeta, que es el otro extremo del mismo error.
 */
export const ESTADOS_MP_CON_PLATA_VIVA = new Set(['pending', 'in_process', 'authorized', 'approved'])
