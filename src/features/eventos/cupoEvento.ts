/**
 * Reglas del CUPO de un evento, aparte para poder testearlas sin montar el formulario.
 *
 * Nace del mismo agujero que `precioEvento`: el campo salía a un `Number()` crudo, así que
 * "30 lugares" daba NaN → viajaba como null → el backend leía null como "vaciar el campo" y el
 * evento quedaba SIN TOPE, con cartel de guardado y sin un solo error. Y peor, en silencio:
 * "1.000" —que es como se escribe mil acá— `Number()` lo lee como 1, que es un entero válido y
 * pasa todas las validaciones del server. El organizador carga mil lugares y el evento se agota
 * con la primera inscripción.
 */

/** Techo de sanidad, igual al del server (`cupoValido` en adminService). */
const CUPO_MAX = 1_000_000

export type ResultadoCupo = { ok: true; valor: number | null } | { ok: false; error: string }

/**
 * @param texto lo que escribió el organizador
 * @param campo cómo nombrarlo en el mensaje de error
 * @param vacio qué significa dejarlo en blanco: `null` (sin tope) para el cupo, `0` para los ya anotados
 */
export function validarCupo(
  texto: string,
  campo: string,
  vacio: number | null = null,
): ResultadoCupo {
  const t = texto.trim()
  if (t === '') return { ok: true, valor: vacio }
  // Sólo dígitos: sin puntos de miles, sin "lugares", sin negativos y sin notación científica.
  if (!/^\d+$/.test(t)) {
    return {
      ok: false,
      error: `Escribí el ${campo} sólo con números, sin puntos ni palabras: 30, 150, 1000.`,
    }
  }
  const n = Number(t)
  if (n > CUPO_MAX) {
    return { ok: false, error: `Ese ${campo} es demasiado grande. El máximo es ${CUPO_MAX}.` }
  }
  return { ok: true, valor: n }
}
