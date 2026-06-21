# CCM Server — contexto para el agente

Backend de CCM (Córdoba Corazón de Moda). Implementa el contrato `DataStore` del frontend contra una API real, **sin reescribir pantallas**. Esto es la Fase 1 (el frontend en `../src` es la Fase 0, demo). Leé `../work-agent/backend/00-README.md` (decisiones canónicas) antes de tocar nada.

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

Migración **por fases por dominio** (no por capa) — ver `work-agent/backend/10-plan-migracion-fases.md` y los prompts en `work-agent/backend/build/PROMPTS-POR-FASE.md`.

- [x] **Fase 0** — esqueleto: Express + Prisma (schema canónico completo) + `/api/v1/health` + env validado + formato de error + alias de tipos.
- [ ] **Fase A** — identidad + perfil + analytics (`/me`, `/analytics`).
- [ ] **Fase B** — eventos + bloques + inscripciones + **cupos** (transacción anti-carrera).
- [ ] **Fase C** — entradas + **pagos MP** (webhook). 🔶 cuenta MP de Gastón.
- [ ] **Fase D** — membresía Socio.
- [ ] **Fase E** — catálogo + galerías + contenido + **uploads** (object storage).
- [ ] **Fase F** — publicidad self-serve + sponsors.
- [ ] **Fase G** — auth admin (roles) + CRUD del organizador.
- [ ] **Fase H** — acreditación en puerta (scan QR, online/offline).

> El frontend conmuta a este backend con `VITE_API_URL`; sin esa env, vuelve al `LocalDataStore` (fallback). Nunca rompas ese fallback.
