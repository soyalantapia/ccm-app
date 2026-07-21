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
// Sin esto, los tests de firma de `requireAdmin` dependían de que existiera un server/.env local
// (gitignoreado): en el repo recién clonado —o en un worktree, que no se lo lleva— fallaban 3
// tests con "ADMIN_TOKEN_SECRET no configurado", que parece un bug del middleware y es infra.
process.env.ADMIN_TOKEN_SECRET ??= 'test-admin-session-secret-0123456789abcdef'
// Mercado Pago: sin esto, buildAuthUrl() siempre tira MP_NOT_CONFIGURED y ningún test
// del flujo OAuth (mpOAuthService) puede ejercitar el camino feliz.
process.env.MP_CLIENT_ID ??= 'test-mp-client-id'
process.env.MP_REDIRECT_URI ??= 'http://localhost:4000/api/v1/mp/callback'
// Base pública del server (mpCheckoutService.baseUrl / adminAuth.publicBase): notification_url
// y back_urls de MP se arman con esto, no recortando MP_REDIRECT_URI.
process.env.PUBLIC_BASE_URL ??= 'http://localhost:4000'
