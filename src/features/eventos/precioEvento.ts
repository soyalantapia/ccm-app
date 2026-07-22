/**
 * Reglas del precio de un evento, en un solo lugar y testeables.
 *
 * Dos cosas que parecen detalles y no lo son:
 *
 * 1. VACÍO NO ES CERO. Vacío significa "este evento no se vende" (se entra con inscripción
 *    gratuita). Cero significa "cobrame nada", y el cobro rechaza los montos <= 0: el comprador
 *    se comería un error que no explica nada. Para regalar un lugar está la entrada de cortesía,
 *    que no pasa por el pago.
 *
 * 2. PRECIO Y CANDADO DE SOCIOS NO CONVIVEN. La inscripción rechaza al no-socio ANTES de mirar
 *    cualquier otra cosa, así que un evento con precio y candado no lo puede comprar nadie que
 *    no sea Socio: es una venta que no existe. La regla del cliente es que el costo es el filtro,
 *    así que si hay precio, el candado sobra.
 */

export type PrecioValidado =
  | { ok: true; price: number | null }
  | { ok: false; error: string }

export function validarPrecioEvento(input: {
  price: string
  socioOnly: boolean
}): PrecioValidado {
  const texto = input.price.trim()
  if (texto === '') return { ok: true, price: null }

  // Sólo dígitos. Number() solo NO alcanza y el caso que lo demuestra es el más probable de
  // todos: "45.000" —como se escribe cuarenta y cinco mil en Argentina— lo interpreta como el
  // decimal 45. Number.isInteger(45) es true y 45 > 0, así que pasaría la validación y la
  // capacitación quedaría a cuarenta y cinco pesos. Lo mismo con "1e5" → 100000.
  if (!/^\d+$/.test(texto)) {
    return {
      ok: false,
      error:
        'Escribí sólo números, sin puntos ni comas: 45000 para cuarenta y cinco mil. ' +
        'Dejalo vacío si el evento no se vende.',
    }
  }

  const price = Number(texto)
  if (price <= 0) {
    return {
      ok: false,
      error:
        'El precio tiene que ser mayor a 0. Dejalo vacío si el evento no se vende — un precio en ' +
        'cero no es gratis, es un cobro que falla.',
    }
  }

  if (input.socioOnly) {
    return {
      ok: false,
      error:
        'Con precio cargado, «Solo Socios» impide que alguien que no es Socio pueda comprar. ' +
        'Sacá el candado, o dejá el precio vacío.',
    }
  }

  return { ok: true, price }
}
