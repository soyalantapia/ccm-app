// Env mínimo para los tests: satisface el contrato zod de lib/env.ts (que hace process.exit(1)
// si falta config). La mayoría son puros —firma de tokens, serialización, middlewares— y ni
// tocan Prisma.
//
// ⚠️ PERO algunos SÍ necesitan una base de verdad: adminPeople.test.ts crea usuarios y sesiones
// reales para probar que un rol CONTENT recibe 403 en el CRM y un EDITOR 200. Sin esa base, 25
// tests fallan con "User was denied access on the database" y parece que el código está roto
// cuando lo que falta es infraestructura. Una vez, para tenerla:
//
//   createdb ccm_test
//   DATABASE_URL="postgresql://localhost:5432/ccm_test" npx prisma migrate deploy
//
// El `??=` respeta la DATABASE_URL que ya esté en el ambiente, así que se puede apuntar a otra.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/ccm_test'
process.env.DEVICE_TOKEN_SECRET ??= 'test-device-secret-0123456789abcdef'
process.env.ADMIN_TOKEN ??= 'test-admin-token-abcdef'
