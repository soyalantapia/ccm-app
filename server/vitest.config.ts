import { defineConfig } from 'vitest/config'

// Config de tests del backend. Los .test.ts viven co-locados en src/ (excluidos del
// build de producción vía tsconfig "exclude"). setup.ts siembra el env mínimo para que
// lib/env.ts parsee sin process.exit (los unit tests no tocan la DB).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // En serie a propósito: personService.test.ts y adminPeople.test.ts trabajan contra una base
    // de VERDAD (crean personas, cuentan filas, prueban carreras con datos reales) y comparten la
    // misma DATABASE_URL. En paralelo se pisan entre sí y la suite falla distinto en cada corrida
    // —"Unique constraint failed", conteos que no dan— por datos ajenos, no por el código. Una red
    // de seguridad que falla al azar no se mira más. Si molesta la velocidad, la salida es una
    // base por worker, no volver a paralelo.
    fileParallelism: false,
  },
})
