// Env mínimo para los unit tests: satisface el contrato zod de lib/env.ts (que hace
// process.exit(1) si falta config) SIN conectar a la DB — Prisma es aparte (lib/prisma.ts),
// y estos tests son puros (firma de tokens, serialización, auth middleware).
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/ccm_test'
process.env.DEVICE_TOKEN_SECRET ??= 'test-device-secret-0123456789abcdef'
process.env.ADMIN_TOKEN ??= 'test-admin-token-abcdef'
