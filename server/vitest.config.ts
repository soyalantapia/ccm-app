import { defineConfig } from 'vitest/config'

// Config de tests del backend. Los .test.ts viven co-locados en src/ (excluidos del
// build de producción vía tsconfig "exclude"). setup.ts siembra el env mínimo para que
// lib/env.ts parsee sin process.exit (los unit tests no tocan la DB).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
})
