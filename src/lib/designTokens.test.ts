import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Una clase de color que no existe no rompe nada visible: el texto simplemente hereda el color
 * del padre y nadie se entera. Pasó dos veces con `text-warn` —un token que nunca existió en este
 * proyecto— y una de ellas llegó a producción, en el contador del login.
 *
 * Este test lee los tokens que define index.css y falla si alguien usa un color fuera de esa
 * lista. Es barato y ataja justo la clase de error que ningún typecheck ve.
 */

const SRC = join(import.meta.dirname, '..')

/** Los colores declarados como `--color-x` en el tema. */
function tokensDelTema(): Set<string> {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')
  const out = new Set<string>()
  for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) out.add(m[1])
  return out
}

/** Utilidades de color de Tailwind que sí existen sin estar en nuestro tema. */
const DE_TAILWIND = new Set([
  'transparent', 'current', 'inherit', 'black', 'white',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  'slate', 'gray', 'zinc', 'neutral', 'stone',
])

/**
 * Qué color nombra una clase, o null si no nombra ninguno.
 *
 * El prefijo (`text-`, `border-`, `ring-`…) lo comparten muchas utilidades que no tienen nada
 * que ver con color: el lado de un borde (`border-t`), su estilo (`border-collapse`), la
 * dirección de un gradiente (`bg-gradient-to-t`) o el grosor de un anillo (`ring-offset-2`).
 * Cuando el modificador SÍ viene acompañado de color —`border-t-transparent`,
 * `ring-offset-surface`— se lo pela y se valida lo que queda, para no perder cobertura.
 */
function colorDe(clase: string): string | null {
  // Utilidades que nunca nombran un color, sin importar lo que venga después.
  if (/^(gradient|collapse|separate|radius|spacing|opacity|shadow|solid|dashed|dotted|double|hidden|none)\b/.test(clase)) return null
  // Modificadores que pueden ir seguidos de un color: lado del borde y offset del anillo.
  const conModificador = /^(?:[tblrxy]|offset)(?:-(.+))?$/.exec(clase)
  if (conModificador) {
    const resto = conModificador[1]
    // Sin resto es sólo el modificador; si el resto es un número, es un tamaño, no un color.
    if (!resto || /^\d/.test(resto)) return null
    return resto
  }
  return clase
}

function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) archivosFuente(p, acc)
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) acc.push(p)
  }
  return acc
}

describe('los colores usados existen en el tema', () => {
  const tokens = tokensDelTema()

  it('index.css define los tokens que esperamos', () => {
    for (const t of ['ink', 'accent', 'danger', 'success', 'night', 'line', 'surface']) {
      expect(tokens.has(t), `falta --color-${t}`).toBe(true)
    }
  })

  it('ningún archivo usa un color que no existe', () => {
    const usos: { archivo: string; clase: string }[] = []
    for (const archivo of archivosFuente(SRC)) {
      const texto = readFileSync(archivo, 'utf8')
      // text-x / bg-x / border-x, admitiendo el sufijo de opacidad (text-ink/50).
      for (const m of texto.matchAll(/\b(?:text|bg|border|ring|fill|stroke|from|to|via)-([a-z][a-z0-9-]*)\b(?:\/\d+)?/g)) {
        const nombre = colorDe(m[1])
        if (nombre === null) continue // la clase no nombra ningún color
        if (tokens.has(nombre) || DE_TAILWIND.has(nombre)) continue
        // Muchas utilidades comparten prefijo sin ser colores (border-2, text-xs, bg-cover…).
        // Sólo nos interesan las que parecen nombre de color de nuestro tema y no lo son.
        if (/^(xs|sm|base|lg|xl|\d|left|right|center|top|bottom|cover|contain|none|solid|dashed|dotted|auto|clip|ellipsis|nowrap|wrap|balance|pretty|start|end|justify|opacity|\[)/.test(nombre)) continue
        usos.push({ archivo: archivo.replace(SRC, 'src'), clase: m[0] })
      }
    }
    const detalle = usos.map((u) => `  ${u.clase} — ${u.archivo}`).join('\n')
    expect(usos, `Colores que no existen en el tema:\n${detalle}`).toEqual([])
  })
})
