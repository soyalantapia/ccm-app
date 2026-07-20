/**
 * Verificación end-to-end: corre getAdminStats() REAL contra la base sembrada
 * y compara cada número con la verdad conocida.
 *
 * Los tests unitarios usan Prisma mockeado, así que prueban la lógica pero no las
 * queries. Esto ejecuta las queries de verdad contra Postgres.
 */
// El build anida por rootDir (incluye el dominio compartido): dist/server/src/...
import { getAdminStats } from '../../dist/server/src/services/statsService.js'

const VERDAD = {
  registrados: 10,
  inscripciones: 6,
  socios: 3,
  ingresoSocios: 20000,
  ordenesConfirmadas: 2,
  postulaciones: 5, // 4 pendientes + 1 aceptada (las 2 fromSeed no cuentan)
  descargas: 7,
  plataTrabada: 45000,
  postulacionesPendientes: 4,
  masAntiguaDias: 12,
  convocatoriasPorCerrar: 1,
}

const s = await getAdminStats()
const filas = [
  ['registrados', s.kpis.registrados, VERDAD.registrados],
  ['inscripciones', s.kpis.inscripciones, VERDAD.inscripciones],
  ['socios', s.kpis.socios, VERDAD.socios],
  ['ingresoSocios', s.kpis.ingresoSocios, VERDAD.ingresoSocios],
  ['ordenesConfirmadas', s.kpis.ordenesConfirmadas, VERDAD.ordenesConfirmadas],
  ['postulaciones', s.kpis.postulaciones, VERDAD.postulaciones],
  ['descargas', s.kpis.descargas, VERDAD.descargas],
  ['plataTrabada', s.plataTrabada.montoTotal, VERDAD.plataTrabada],
  ['postulaciones pend.', s.postulacionesPendientes.total, VERDAD.postulacionesPendientes],
  ['espera más vieja (días)', s.postulacionesPendientes.masAntiguaDias, VERDAD.masAntiguaDias],
  ['convocatorias x cerrar', s.convocatoriasPorCerrar.items.length, VERDAD.convocatoriasPorCerrar],
]

console.log('\nMÉTRICA                    OBTENIDO   ESPERADO   ')
console.log('─'.repeat(56))
let fallos = 0
for (const [n, got, exp] of filas) {
  const ok = got === exp
  if (!ok) fallos++
  console.log(`${n.padEnd(26)} ${String(got).padStart(8)} ${String(exp).padStart(10)}   ${ok ? 'OK' : '✗ FALLA'}`)
}
console.log('─'.repeat(56))

const flojos = s.bloquesFlojos.items
console.log(`\nBloques flojos (${flojos.length}) — el más vacío primero:`)
for (const b of flojos) console.log(`  ${b.titulo.padEnd(20)} ${b.ocupacion}% · faltan ${b.faltan} de ${b.capacity}`)
const sinCupo = flojos.some((b) => b.capacity === 0) || flojos.some((b) => !Number.isFinite(b.ocupacion))
if (sinCupo) { console.log('  ✗ FALLA: hay un bloque con capacity 0 o NaN'); fallos++ }
if (flojos.length && flojos[0].titulo !== 'Bloque flojo') { console.log('  ✗ FALLA: no ordenó por ocupación'); fallos++ }

console.log(`\nConvocatorias por cerrar: ${s.convocatoriasPorCerrar.items.map((c) => `${c.titulo} (${c.diasRestantes}d, ${c.postulaciones} post.)`).join(' · ') || '—'}`)
console.log(`Sponsors: ${s.sponsors.items.map((x) => `${x.nombre}=${x.descargas}`).join(' · ') || '—'}`)
console.log(`\ngeneratedAt: ${s.generatedAt}`)
console.log(fallos === 0 ? '\n✓ TODAS LAS MÉTRICAS COINCIDEN CON LA VERDAD\n' : `\n✗ ${fallos} DIVERGENCIAS\n`)
process.exit(fallos === 0 ? 0 : 1)
