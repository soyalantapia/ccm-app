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
