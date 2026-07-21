/**
 * Contraste WCAG entre dos colores del tema.
 *
 * El editor de tema deja elegir cualquier color para cualquier token, y algunos de esos
 * tokens se usan uno ENCIMA del otro: el texto va sobre el canvas, el texto del botón va
 * sobre el dorado. Nada avisaba si una combinación quedaba ilegible, así que el cliente
 * podía dejar la app sin contraste sin enterarse hasta verla.
 *
 * Referencia: WCAG 2.2, 1.4.3 (Contrast Minimum, AA).
 */

/** Luminancia relativa de un color #rrggbb (WCAG 2.2 §relative luminance). */
export function luminancia(hex: string): number | null {
  const n = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(n)) return null
  const canales = [0, 2, 4].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2]
}

/** Ratio de contraste entre dos colores (1 = idénticos, 21 = negro sobre blanco). */
export function contraste(colorA: string, colorB: string): number | null {
  const a = luminancia(colorA)
  const b = luminancia(colorB)
  if (a === null || b === null) return null
  const [claro, oscuro] = a > b ? [a, b] : [b, a]
  return (claro + 0.05) / (oscuro + 0.05)
}

/**
 * Oscurece un color mezclándolo con negro en sRGB, igual que hace
 * `color-mix(in srgb, <color> 78%, black)` en index.css para `--color-accent-strong`.
 *
 * Vive acá para que la revisión mida el color REAL del botón: el botón primario usa
 * accent-strong, no el acento puro, así que revisar el acento puro daría un aviso falso.
 */
export function oscurecer(hex: string, proporcion = 0.78): string | null {
  const n = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(n)) return null
  const canales = [0, 2, 4].map((i) => Math.round(parseInt(n.slice(i, i + 2), 16) * proporcion))
  return '#' + canales.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Texto normal (WCAG 1.4.3, AA). */
export const MINIMO_AA = 4.5
/** Texto grande — ≥24px, o ≥18,66px en negrita. El estándar lo exige menos porque se lee mejor. */
export const MINIMO_AA_GRANDE = 3

/**
 * Pares de tokens que en la app aparecen uno sobre el otro, cada uno con el mínimo que le
 * corresponde según el tamaño del texto que lleva encima.
 *
 * El par del BOTÓN mide `accent-ink` sobre el acento OSCURECIDO, que es lo que el botón
 * primario pinta de verdad. Medir el acento puro reportaría un problema que no existe.
 *
 * El acento PURO quedó usándose en un solo lugar con texto: la sigla del sponsor, a 24px y
 * peso 900. Ahí rige el mínimo de texto grande — por eso ese par no se mide contra 4,5. Con
 * el mínimo equivocado, la paleta de CCM disparaba un aviso permanente por algo que cumple,
 * y un aviso que siempre está encendido enseña a ignorarlos.
 */
export const PARES_CRITICOS: {
  texto: string
  fondo: string
  donde: string
  oscurecerFondo?: boolean
  minimo?: number
}[] = [
  { texto: 'ink', fondo: 'bg', donde: 'Texto principal sobre el fondo' },
  { texto: 'ink-soft', fondo: 'bg', donde: 'Texto secundario sobre el fondo' },
  { texto: 'ink', fondo: 'surface', donde: 'Texto sobre las tarjetas' },
  { texto: 'accent-ink', fondo: 'accent', donde: 'Texto de los botones principales', oscurecerFondo: true },
  {
    texto: 'accent-ink',
    fondo: 'accent',
    donde: 'Siglas de sponsor sobre el acento',
    minimo: MINIMO_AA_GRANDE,
  },
  { texto: 'night-ink', fondo: 'night', donde: 'Texto sobre las secciones oscuras' },
]

export interface AvisoContraste {
  texto: string
  fondo: string
  donde: string
  ratio: number
}

/**
 * Revisa los pares críticos de una paleta y devuelve los que no llegan al mínimo.
 * Devuelve [] si está todo bien — así el editor no muestra nada cuando no hay nada que decir.
 */
export function revisarPaleta(colores: Record<string, string | undefined>): AvisoContraste[] {
  const avisos: AvisoContraste[] = []
  for (const par of PARES_CRITICOS) {
    const texto = colores[par.texto]
    const fondoBase = colores[par.fondo]
    if (!texto || !fondoBase) continue
    // El botón primario pinta el acento oscurecido, no el acento puro.
    const fondo = par.oscurecerFondo ? oscurecer(fondoBase) : fondoBase
    if (!fondo) continue
    const ratio = contraste(texto, fondo)
    if (ratio === null) continue
    if (ratio < (par.minimo ?? MINIMO_AA)) {
      avisos.push({ texto: par.texto, fondo: par.fondo, donde: par.donde, ratio })
    }
  }
  return avisos
}
