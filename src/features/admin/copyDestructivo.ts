import { IS_REMOTE } from '../../data/store'

/**
 * Qué se le dice al organizador antes de borrar algo.
 *
 * Los diálogos de borrado decían "podés recrearlo o reiniciar la demo para volver a los datos
 * originales" — copy de la época en que todo vivía en localStorage. En producción no hay demo
 * que reiniciar: el DELETE va al backend, el cascade se lleva lo que cuelgue, y el público lo
 * ve al instante. Prometer un deshacer que no existe hace que se borre con más liviandad de la
 * que corresponde.
 *
 * `IS_REMOTE` existe exactamente para esta distinción; su comentario ya avisa que se creó
 * "para no mentirle al organizador". Esta constante lo aplica a los cuatro diálogos, en vez de
 * repetir el condicional en cada uno.
 *
 * En demo el deshacer sí existe (borrar los overlays de localStorage devuelve el seed), pero se
 * nombra por el control que hoy lo hace: no hay ningún botón que se llame "reiniciar la demo".
 */
export const AVISO_BORRADO = IS_REMOTE
  ? 'Esta acción es permanente: se borra del sistema y el cambio lo ve todo el público al instante.'
  : 'Podés volver a crearlo, o recuperar los datos originales con «Borrar los datos de este navegador», en Configuración.'

/**
 * Lo mismo, para las órdenes: el panel hablaba de «las órdenes de la demo» y de «confirmación
 * manual en la demo» aunque contra el backend real esas órdenes son compras de gente de verdad
 * y confirmarlas es dar una entrada por pagada. Llamarlo demo invita a tocar el botón para
 * probar.
 */
// Los precios y los links de pago YA NO se editan acá: viven adentro de cada evento, que es de
// donde son. Esta pantalla quedó sólo con las ventas, que sí son transversales.
export const LEAD_ORDENES = IS_REMOTE
  ? 'Todas las compras, de todos los eventos. Los precios y los links de pago se cargan adentro de cada evento.'
  : 'Las compras de la demo. Los precios y los links de pago se cargan adentro de cada evento.'

// El webhook de Mercado Pago ya concilia solo: verifica la firma (mpWebhookService.ts:52) y marca
// la orden confirmada dentro de la misma transacción que sella el pago (:159). La confirmación a
// mano quedó para las órdenes que se cobraron por fuera (transferencia, efectivo), no como sustituto.
export const AVISO_CONFIRMACION_MANUAL = IS_REMOTE
  ? 'Las compras por Mercado Pago se confirman solas cuando entra el pago. Confirmá a mano sólo lo que hayas cobrado por fuera: hacerlo da la entrada por pagada.'
  : 'Confirmación manual en la demo · con backend, las compras por Mercado Pago se confirman solas cuando entra el pago.'
