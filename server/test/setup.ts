// Env mínimo para los unit tests: satisface el contrato zod de lib/env.ts (que hace
// process.exit(1) si falta config) SIN conectar a la DB — Prisma es aparte (lib/prisma.ts),
// y estos tests son puros (firma de tokens, serialización, auth middleware).
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/ccm_test'
process.env.DEVICE_TOKEN_SECRET ??= 'test-device-secret-0123456789abcdef'
process.env.ADMIN_TOKEN ??= 'test-admin-token-abcdef'
// Mercado Pago: sin esto, buildAuthUrl() siempre tira MP_NOT_CONFIGURED y ningún test
// del flujo OAuth (mpOAuthService) puede ejercitar el camino feliz.
process.env.MP_CLIENT_ID ??= 'test-mp-client-id'
process.env.MP_REDIRECT_URI ??= 'http://localhost:4000/api/v1/admin/mp/callback'
