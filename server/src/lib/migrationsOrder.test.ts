import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Prisma aplica las migraciones en orden LEXICOGRÁFICO por nombre de carpeta, no numérico.
 * Este repo usa prefijos numéricos sin cero a la izquierda, así que el orden real es:
 *
 *   0_init · 10_… · 11_… · 12_… · 1_… · 2_… · … · 9_…
 *
 * Ya mordió una vez (12_ corriendo antes que 9_). No se puede arreglar renombrando las que ya
 * están aplicadas: Prisma las compara contra _prisma_migrations de producción y una carpeta
 * renombrada aparece como pendiente → el contenedor no arranca.
 *
 * Entonces se congela lo que hay y se exige que TODA carpeta nueva ordene después de la última.
 * Prefijo recomendado para lo que venga: 9z_, 9z2_, 9z3_…
 */

const MIGRATIONS_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'prisma', 'migrations')

/** Las 19 carpetas ya aplicadas en producción al 22/07/2026. No tocar: es una foto, no un deseo. */
const YA_APLICADAS = [
  '0_init',
  '10_event_published',
  '11_person',
  '12_postulacion_decision',
  '1_one_active_per_slot',
  '2_benefit',
  '3_banner',
  '4_catalog_price_contact',
  '5_nota',
  '6_sponsor_banner',
  '7_catalog_kind_projects',
  '8_convocatoria_logos',
  '9_admin_auth',
  '9_mp_connection',
  '9_mp_payment_init_point',
  '9_mp_payment_pending_unique',
  '9_payment_status_expired',
  '9_ticket_multi_order_payment',
]

/** La última en orden lexicográfico entre las ya aplicadas: todo lo nuevo tiene que ir después. */
const ULTIMA_APLICADA = [...YA_APLICADAS].sort().at(-1)!

function carpetasDeMigracion(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((n) => {
    try {
      return statSync(join(MIGRATIONS_DIR, n)).isDirectory()
    } catch {
      return false
    }
  })
}

describe('orden de migraciones de Prisma', () => {
  it('el orden es lexicográfico, no numérico — así que 12_ corre ANTES que 9_', () => {
    // Documenta la trampa en vez de asumirla: si algún día Prisma cambiara este criterio,
    // este test falla y avisa que el resto de la suite dejó de tener sentido.
    const ordenadas = [...YA_APLICADAS].sort()
    expect(ordenadas.indexOf('12_postulacion_decision')).toBeLessThan(
      ordenadas.indexOf('9_admin_auth'),
    )
    expect(ULTIMA_APLICADA).toBe('9_ticket_multi_order_payment')
  })

  it('las migraciones ya aplicadas siguen existiendo con el mismo nombre', () => {
    // Renombrar una carpeta aplicada la vuelve "pendiente" contra prod y el server no arranca.
    const enDisco = new Set(carpetasDeMigracion())
    const faltantes = YA_APLICADAS.filter((m) => !enDisco.has(m))
    expect(faltantes, `migraciones renombradas o borradas: ${faltantes.join(', ')}`).toEqual([])
  })

  it('toda migración NUEVA ordena después de la última ya aplicada', () => {
    const nuevas = carpetasDeMigracion().filter((m) => !YA_APLICADAS.includes(m))
    const malUbicadas = nuevas.filter((m) => m.localeCompare(ULTIMA_APLICADA) <= 0)
    expect(
      malUbicadas,
      `estas migraciones correrían ANTES de "${ULTIMA_APLICADA}" y romperían el orden. ` +
        `Renombralas con prefijo 9z_ / 9z2_ / 9z3_: ${malUbicadas.join(', ')}`,
    ).toEqual([])
  })
})
