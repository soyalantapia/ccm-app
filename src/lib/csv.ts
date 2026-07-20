/**
 * Celda de CSV segura para abrir en una planilla.
 *
 * Escapar según RFC4180 (comillas, separador, saltos de línea) alcanza para que el CSV se
 * PARSEE bien, pero no para que sea seguro ABRIRLO: Excel, LibreOffice y Sheets interpretan
 * como FÓRMULA cualquier celda que empiece con = + - @ (o tab / CR), y una fórmula puede
 * exfiltrar el contenido de la planilla o, con DDE, ejecutar comandos.
 *
 * En CCM eso importa porque el CSV de analytics serializa datos que NO controla el
 * organizador: el payload de los eventos entra por POST /api/v1/analytics, que es una
 * ingesta pública. El que abre el archivo es justamente el organizador, en su máquina.
 *
 * Anteponemos un apóstrofo (la convención que las planillas entienden como "esto es texto")
 * y entrecomillamos siempre, que además hace el output determinístico.
 */
const PREFIJOS_DE_FORMULA = /^[=+\-@\t\r]/

export function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  const seguro = PREFIJOS_DE_FORMULA.test(s) ? `'${s}` : s
  return `"${seguro.replace(/"/g, '""')}"`
}
