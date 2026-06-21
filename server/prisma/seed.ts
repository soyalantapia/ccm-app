/**
 * Seed → prod (doc 10 §10). Idempotente (upsert por id/slug).
 * Lee los mismos datos de ../src/data/seed/* (mismos tipos TS, cero traducción) y
 * los inserta en Postgres reusando los IDs/slugs canónicos de src/data/ids.ts.
 *
 * FASE 0: stub. Se implementa de verdad en las fases B/E (cuando esos dominios
 * migran) — ver doc 10. Por ahora solo deja la estructura lista y documenta el qué.
 *
 * Reglas (doc 04 §3 y doc 10 §10):
 *  - Migrar: events, blocks (con seedTaken como baseline), plans, sponsors, galleries,
 *    photos, catalog, contents, convocatorias (con sus fields).
 *  - analytics → importar con seed:true (dashboard no nace vacío).
 *  - applications → fromSeed:true.
 *  - NO regenerar IDs (son contrato de deep-links).
 *  - Imágenes: subir a object storage y reescribir URL (no rutas BASE_URL).
 */

async function main() {
  // TODO(fase B/E): importar src/data/seed/* y hacer upsert idempotente.
  console.log('[seed] stub — implementar en fase B/E (ver doc 10 §10).')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
