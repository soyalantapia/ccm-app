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
 */
export const AVISO_BORRADO = IS_REMOTE
  ? 'Esta acción es permanente: se borra del sistema y el cambio lo ve todo el público al instante.'
  : 'Podés recrearlo o reiniciar la demo para volver a los datos originales.'

/**
 * Lo mismo, para las órdenes: el panel hablaba de «las órdenes de la demo» y de «confirmación
 * manual en la demo» aunque contra el backend real esas órdenes son compras de gente de verdad
 * y confirmarlas es dar una entrada por pagada. Llamarlo demo invita a tocar el botón para
 * probar.
 */
export const LEAD_ORDENES = IS_REMOTE
  ? 'Editá precios y links de pago de Mercado Pago por plan, y gestioná las órdenes de compra.'
  : 'Editá precios y links de pago de Mercado Pago por plan, y gestioná las órdenes de la demo.'

export const AVISO_CONFIRMACION_MANUAL = IS_REMOTE
  ? 'Confirmar una orden da la entrada por pagada: verificá el pago en Mercado Pago antes. La conciliación automática por webhook llega en Fase 1.'
  : 'Confirmación manual en la demo · la conciliación automática por webhook de Mercado Pago llega en Fase 1.'
