# CCM Server — contexto para el agente

Backend de CCM (Córdoba Corazón de Moda). Implementa el contrato `DataStore` del frontend contra una API real, **sin reescribir pantallas**. **En producción en Railway** (un solo servicio que sirve también el front buildeado). Leé `../PROJECT.MD` (biblia) + `../work-agent/ESTADO-ACTUAL.md` (estado real) + `../work-agent/backend/00-README.md` (decisiones canónicas) antes de tocar nada.

## Reglas duras (canon — ver work-agent/backend/00-README.md)

- **Schema** = `work-agent/backend/04-modelo-de-datos.md`. **Paths/taxonomía** = doc 05. **Auth/secretos/roles** = doc 06. **Pagos** = doc 07. **QR** = doc 13.
- **Prefijo de API:** todo cuelga de `/api/v1`. El front arma `base = VITE_API_URL + '/api/v1'` (VITE_API_URL NO incluye el prefijo).
- **Identidad:** `Device` (id cuid + publicId) es la única raíz; PII en `ProfileField` (nunca columnas planas). FKs → `Device.id`.
- **Pagos:** tabla `Payment` polimórfica única; el **webhook MP es la única fuente de verdad** (`POST /api/v1/webhooks/mp`); el cliente nunca marca pagado ni calcula el total. Idempotencia obligatoria.
- **Secretos:** tres JWT separados (`DEVICE_/ADMIN_/ACCREDITATION_TOKEN_SECRET`). Nunca uno único.
- **Roles:** enum `AdminRole { OWNER, EDITOR, STAFF, VIEWER }`. `STAFF` = puerta.
- **PII:** nunca loguear payloads crudos (email/dni/phone).
- **Borrado:** no hard-delete de entidades con datos reales (409 o soft-delete).
- **No inventar 🔶 decisiones de negocio** (precios, cuenta MP, sponsors): dejá `TODO(🔶):` y seguí.

## Convenciones de código

- **TypeScript estricto, ESM** (`"type": "module"`, `moduleResolution: NodeNext`) → los imports relativos llevan extensión `.js` (ej. `import { prisma } from '../lib/prisma.js'`). Es a propósito.
- **Tipos de dominio:** NO se duplican. Se importan del front vía el alias `@domain/types` (ver `src/domain.ts` y `tsconfig.json`). Los esquemas **zod** derivan de esos tipos.
- **Validación:** zod en el borde (body/params/query). Errores con el formato uniforme `{ error: { code, message, details? } }` (`src/lib/errors.ts` + `src/middlewares/error.ts`).
- **Prisma:** cliente singleton en `src/lib/prisma.ts`. El acceso a datos va en **services/repositorios**, no inline en los routers.
- **Estructura:** `src/routes/` (HTTP), `src/services/` (lógica + Prisma), `src/middlewares/`, `src/lib/`. Un router por dominio, montado bajo `/api/v1` en `src/app.ts`.

## Comandos

```bash
npm install
cp .env.example .env            # completar DATABASE_URL (y secretos según la fase)
npm run prisma:generate         # genera el client
npm run prisma:migrate          # migración (necesita Postgres + DATABASE_URL)
npm run dev                     # tsx watch → :PORT, GET /api/v1/health
npm run typecheck               # tsc --noEmit
npm run test                    # vitest (webhook MP, concurrencia de cupo, etc.)
```

## Estado / hoja de ruta

Migración **por fases por dominio** (no por capa) — ver `work-agent/backend/10-plan-migracion-fases.md`. **Estado real detallado: `../work-agent/ESTADO-ACTUAL.md`.**

- [x] **Fase 0** — esqueleto: Express + Prisma (schema canónico) + `/api/v1/health` + env validado + formato de error + alias de tipos.
- [x] **Fase A** — identidad + perfil + analytics (`/me`, `/analytics`).
- [x] **Fase B** — eventos + bloques + inscripciones + **cupos** (transacción `SELECT FOR UPDATE` anti-oversell).
- [~] **Fase C** — entradas + **pagos MP**: motor construido; activación bloqueada por 🔶 cuenta MP + precios de Gastón (o seguir en Tikealo).
- [x] **Fase D** — membresía Socio (gate `socioOnly`).
- [x] **Fase E** — catálogo + galerías + contenido. Falta decidir storage de imágenes (🔶 R2 vs Spaces).
- [x] **Fase F** — publicidad self-serve + sponsors (pago por QR).
- [x] **Fase G** — auth admin (Bearer `ADMIN_TOKEN` temporal) + CRUD del organizador. Falta login OTP + roles `AdminRole`.
- [ ] **Fase H** — acreditación en puerta (scan QR, online/offline).
- **+ 4 features de los audios de Gastón** (en prod): beneficios (código gated), banners gestionados, participantes (precio+contacto), notas/CMS.

### Lo realmente implementado vs el canon
- **Auth device:** HMAC-SHA256 (`lib/deviceToken.ts`), header **`X-Device-Token`**, emisión server-only en `POST /devices`. No es JWT (a propósito, sin libs). Sin expiración/rotación aún.
- **Auth admin:** `Authorization: Bearer <ADMIN_TOKEN>` (shared secret, un solo rol OWNER de facto) — **temporal**; el canon pide OTP + roles.
- **Pagos:** la tabla `Payment` polimórfica y el patrón webhook son canon; el flujo MP de entradas aún no está activo en prod.
- **Single-service:** si `FRONT_DIST` está seteada, el server además sirve el SPA (`dist/`) + fallback para rutas no-`/api/`.

> El frontend conmuta a este backend con `VITE_API_URL`; sin esa env, vuelve al `LocalDataStore` (fallback). **Nunca rompas ese fallback.**
>
> 🔴 **Tests:** el script `npm test` (vitest+supertest) está listo pero **no hay ningún archivo de test**. Es la deuda #1.
