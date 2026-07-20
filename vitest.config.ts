import { defineConfig } from 'vitest/config'

// Tests del front. jsdom porque el store toca localStorage/sessionStorage y el bus.
// El backend tiene su propia suite en server/ (npm test dentro de server/).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
