# CCM — Handoff completo (para retomar en un chat nuevo)

> Este documento es **autosuficiente**: explica TODO el proyecto, dónde estamos parados, qué falta y cómo continuar, sin depender de ninguna conversación previa. Si sos un chat nuevo retomando esto: **leé esto entero primero**, después `work-agent/backend/00-README.md`.

---

## 0. TL;DR

CCM (Córdoba Corazón de Moda) es una **PWA de un evento de moda** que estaba 100% en el frontend (demo) y se le construyó un **backend real** para que los datos sean persistentes y compartidos. El backend está **EN VIVO en Railway** y cubre 5 de las ~8 fases planificadas. Lo que falta está **bloqueado por insumos externos** (sobre todo la cuenta de Mercado Pago de Gastón).

- **API en vivo:** https://ccm-api-production-91a9.up.railway.app/api/v1/health → `{ok:true,db:up}`
- **Código:** `~/dev/ccm-app`, rama **`feat/backend-foundation`** (15 commits, **sin pushear**).
- **Plan de arquitectura completo:** `work-agent/backend/` (17 docs).
- **Tarea pendiente creada:** chip `task_d44abe3b` ("Continuar backend CCM…").

---

## 1. Qué es CCM

- **Producto:** plataforma/PWA de **Córdoba Corazón de Moda 2026** (14ª edición, **19–20 de septiembre de 2026**, Hotel Quinto Centenario, Córdoba). Integra app del público (acreditación por QR, agenda, eventos, entradas, catálogo de expositores, galerías, contenido), panel del organizador (carga de todo + métricas en vivo), y autogestión de publicidad para sponsors.
- **Cliente / contacto:** **Gastón** (agencia Mabel / CCM). Demo presentada el 12/06/2026. Hay un mail enviado a `agenciamabel.gs@gmail.com` (cc juan.zaninetti@gmail.com, contacto.moio@gmail.com) con el estado y preguntas de negocio.
- **Quién construye:** Alan Tapia (soyalantapia). gh user `soyalantapia` (token sin scope workflow).
- **Demo pública (Fase 0, frontend puro):** https://soyalantapia.github.io/ccm-app/ (GitHub Pages, rama gh-pages). **Sigue siendo la demo de localStorage** — todavía NO apunta al backend.

---

## 2. Ubicaciones, URLs y accesos (todo en un lugar)

| Qué | Dónde |
|-----|-------|
| Código | `~/dev/ccm-app` (symlink en `~/Desktop/Programacion/ccm-app`) |
| Rama de trabajo | `feat/backend-foundation` (15 commits, **sin pushear ni PR**) |
| Repo GitHub | `soyalantapia/ccm-app` |
| Demo pública | https://soyalantapia.github.io/ccm-app/ (GH Pages, rama `gh-pages`) |
| Backend (API) | https://ccm-api-production-91a9.up.railway.app/api/v1 |
| Proyecto Railway | `ccm-api`, workspace **Deenex** · https://railway.com/project/1944e951-b049-4e9f-a15d-35fee058f8dc |
| Base de datos | servicio Railway **`Postgres-WTPk`** (el server usa su `DATABASE_PUBLIC_URL`) |
| Plan de arquitectura | `work-agent/backend/` (00-README + 13 docs + `build/`) |
| Backend (código) | `~/dev/ccm-app/server/` |
| Frontend (código) | `~/dev/ccm-app/src/` |

---

## 3. La arquitectura (lo más importante de entender)

**La costura `DataStore`.** Toda la UI lee/escribe SOLO a través de una interfaz `DataStore` (~60 métodos, `src/data/store/DataStore.ts`). En la demo la implementa `LocalDataStore` (seed estático + localStorage). El backend se enchufa con:

```
src/data/store/RemoteDataStore.ts  →  extends LocalDataStore
```

`RemoteDataStore` **sobreescribe solo los métodos de las fases ya migradas** (escribe/lee del backend), y **hereda el resto** de `LocalDataStore` (siguen en local hasta su fase). Se conmuta en `src/data/store/index.ts`:

```ts
const API_BASE = import.meta.env.VITE_API_URL
export const store = API_BASE ? new RemoteDataStore(API_BASE) : new LocalDataStore()
```

- **Con `VITE_API_URL`** → usa el backend real.
- **Sin la env** → `LocalDataStore` (la demo de GH Pages queda **byte-idéntica**, el `RemoteDataStore` se tree-shakea). **Por eso la demo nunca se rompió mientras se construía el backend.**

**Decisión clave — interfaz SÍNCRONA ("incremental seguro"):** la interfaz `DataStore` **NO se migró a async** todavía. `RemoteDataStore` mantiene un **caché hidratado** del backend (lecturas síncronas instantáneas) y hace **mutaciones optimistas** (actualiza el caché + `bus.emit` para re-render, dispara la request, reconcilia o revierte). Esto evitó el refactor de ~80 call-sites. **🔶 La migración a async se recomienda ANTES de la Fase C (pagos)**, porque el checkout necesita `await` (ver `work-agent/backend/10-plan-migracion-fases.md §0`).

**Stack backend:** Node + TypeScript (ESM/NodeNext) + Express + Prisma + PostgreSQL, en Railway, build vía **Dockerfile** (no Nixpacks/Railpack). El server importa los tipos del front (`src/data/types.ts`) vía alias `@domain/types` (no duplica tipos).

---

## 4. Dónde estamos parados — fases

### ✅ Completas (backend + frontend + verificadas e2e)

| Fase | Qué hace | Endpoints `/api/v1` |
|------|----------|---------------------|
| **0** | Esqueleto + schema Prisma completo + health | `GET /health` |
| **A** | Identidad (device) + perfil + analytics | `GET /me`, `PATCH /me/fields`, `PATCH /me/consents`, `POST /analytics`, `GET /admin/analytics`* |
| **B** | Eventos + bloques + inscripciones + **cupos** (transacción `SELECT FOR UPDATE`, sin oversell) | `GET /events`, `GET /events/:slug`, `GET /events/:id/blocks`, `GET /blocks/:id/availability`, `GET/POST /registrations`, `DELETE /registrations/:id` |
| **E** | Catálogo + galerías + contenido + favoritos/descargas (device) | `GET /catalog(/:slug)`, `GET /galleries(/:slug)`, `GET /contents`, `GET /favorites`, `PUT/DELETE /favorites/:photoId`, `POST/GET /downloads` |
| **G** | Panel admin: **auth Bearer** + CRUD de TODO + postulaciones | `GET /sponsors`, `GET /plans`, `GET /convocatorias/:slug`, `POST /applications`; `POST/PATCH/DELETE /admin/{events,blocks,contents,sponsors,galleries,catalog}`, `PATCH /admin/plans/:id`, `GET /admin/applications`, `PATCH /admin/applications/:id` |

\* `/admin/analytics` y todo `/admin/*` exige `Authorization: Bearer <ADMIN_TOKEN>`.

**Verificación:** cada fase se probó por **curl** (incluida concurrencia del cupo: 36 inscripciones paralelas → exactamente 28 entran, 8 dan `409 BLOCK_FULL`) **y en navegador real** (Playwright, levantando el dev contra el backend y confirmando persistencia en Postgres).

### ⛔ Pendientes — TODAS gateadas por un insumo externo

| Fase / tarea | Qué falta | Insumo que la destraba (de quién) |
|---|---|---|
| **C / D / F** — pagos (entradas, membresía, publicidad) | endpoints de órdenes/membresía/campañas + webhook MP + máquina de estados | **Cuenta de Mercado Pago de Gastón** (MP_ACCESS_TOKEN + MP_WEBHOOK_SECRET). 🔶 + decidir entradas-en-Tikealo vs checkout propio |
| **Migración async** de `DataStore` | pasar la interfaz a `Promise` + adaptar ~80 call-sites a TanStack Query | — (decisión técnica de Alan; conviene ANTES de C) |
| **E-uploads** | subir imágenes reales (presigned URL) `POST /admin/uploads/sign` | decidir **Cloudflare R2 vs DigitalOcean Spaces** + credenciales (Alan) |
| **G-auth real** | login **OTP por email** + roles `AdminRole` (en vez del token Bearer) | **RESEND_API_KEY** + emails de los admins |
| **H** — acreditación en puerta | scan de QR (JWT firmado + fila `Ticket`), modo online/offline | depende de C; detalle en `work-agent/backend/13-acreditacion-en-puerta.md` |
| Contenido real | fotos del Drive, precios reales, sponsors reales para el seed→prod | Gastón |

**Métodos del `DataStore` que siguen en LocalDataStore** (no migrados aún): `createOrder/markOrderRedirected/setOrderStatus/getOrders` (C), `getMembership/isSocio/becomeSocio` (D), `createCampaign/getCampaigns/getActiveCampaign` + `getCreative` (F).

---

## 5. El backend en detalle (`server/`)

```
server/
├─ Dockerfile           # builder (node:22-slim, npm ci --include=dev, prisma generate, start=db push + tsx)
├─ prisma/
│  ├─ schema.prisma     # schema canónico (doc 04): Device+ProfileField, eventos, Payment, Ticket, etc.
│  └─ seed.ts           # migra el seed del front a la DB (idempotente)
├─ src/
│  ├─ index.ts / app.ts # arranque + monta /api/v1
│  ├─ middlewares/      # device (X-Device-Id upsert), admin (Bearer), error
│  ├─ routes/           # health, me, analytics, events, registrations, catalog, photos, admin
│  ├─ services/         # device, analytics, event, registration, catalog, photo, admin, application
│  └─ lib/              # env (zod), prisma, errors, serialize (Prisma→shapes del dominio)
└─ .env.example         # contrato de entorno
```

### Comandos clave (memorizar)

```bash
# Deploy del backend (sube SOLO server/ como raíz del build):
> 🔴 **El path importa.** `railway up` empaqueta el directorio donde se lo corre. Este repo
> tiene varios worktrees y varios están commits atrás: deployar desde el equivocado hace
> RETROCEDER producción sin que nada avise. Deployá SIEMPRE desde un worktree en `origin/main`
> y verificá después con `GET /api/v1/version` que el `commit` coincida.
cd "$(git -C ~/dev/ccm-merge rev-parse --show-toplevel)" && railway up server --path-as-root -s ccm-api -c
# ⚠️ NO deployes desde ~/dev/ccm-app: ese worktree quedó en una rama vieja.

# Seed contra la DB (poblar/restaurar datos del front):
PUB=$(railway variables --service Postgres-WTPk --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
# 🔴 NO correr contra prod: el seed BORRA fotos/portfolios/campos y pisa lo cargado a mano.
#    La guardia aborta si la DB no es local; sólo se saltea con --force, y no deberías necesitarlo.

# Typecheck del server:
cd ~/dev/ccm-merge/server && npx tsc --noEmit

# Logs de Railway (OJO: necesita --lines, sino streamea y cuelga headless):
railway logs -s ccm-api -d --lines 60

# Verificación runtime del front contra el backend:
VITE_API_URL="https://ccm-api-production-91a9.up.railway.app" npm run dev -- --port 5191 --strictPort
# (luego Playwright en http://localhost:5191/ccm-app/, importar el store con
#  await import('/ccm-app/src/data/store/index.ts') y confirmar en el backend)
```

### Variables de entorno en Railway (servicio `ccm-api`)

- `DATABASE_URL` = `${{Postgres-WTPk.DATABASE_PUBLIC_URL}}` (la URL pública del proxy; la **red privada `*.railway.internal` NO conectó**).
- `NODE_ENV=production`, `CORS_ORIGINS` = `https://soyalantapia.github.io,http://localhost:5191,http://localhost:5179,http://localhost:5173`.
- `ADMIN_TOKEN` = el secret Bearer del panel admin (auth temporal de Fase G). **Para verlo:** `railway variables --service ccm-api` (buscar ADMIN_TOKEN). El front lo guarda en `sessionStorage('ccm:admin-token')` cuando se ingresa en el gate del panel; viaja como `Authorization: Bearer` en `/admin/*`.

---

## 6. Pendientes operativos (cosas a limpiar/hacer)

1. **🧹 Borrar 5 Postgres DUPLICADAS** (se crearon de más con `railway add` repetido). **Desde el dashboard de Railway** (el CLI no borra servicios). **Conservar SOLO `Postgres-WTPk`** (la que usa el backend). Borrar: `Postgres`, `Postgres-UOAO`, `Postgres-rCYq`, `Postgres-h9JU`, `Postgres-q-Mu`. (Cuestan plata; `Postgres` a secas está muerta.)
2. **📤 Pushear** la rama `feat/backend-foundation` + abrir PR (hoy todo es local).
3. **🔌 Prender el backend en la demo pública:** rebuild de GH Pages con `VITE_API_URL=https://ccm-api-production-91a9.up.railway.app npm run build` + deploy `gh-pages`. (Hoy la demo sigue en LocalDataStore a propósito.)
4. Hay **devices/postulaciones de prueba** en la DB (de los tests e2e) — inocuos; un re-seed no los borra pero no molestan.

---

## 7. Contexto de negocio (decisiones abiertas — de Gastón salvo aclaración)

Estas definiciones bloquean las fases de pago y el contenido real (están en el mail a Gastón y en `work-agent/backend/11-riesgos-y-decisiones-abiertas.md`):

- **Cuenta de Mercado Pago** (a nombre de quién entra la plata) — **insumo #1**, destraba C/D/F.
- ¿Entradas siguen en **Tikealo** o pasan a checkout propio?
- **Precios** reales (5 planes de entrada + membresía Socio CCM; varios están en `null`).
- **Sponsors reales** 2026 (hoy son ficticios: Banco Distrito, Aura Beauty, Terruño Wines).
- Acceso al **Drive de fotos** + IDs de YouTube reales (para el seed→prod).
- **Niveles** de la membresía (hoy binario free/socio).
- Emails de los **admins** + proveedor de email (RESEND) para el login OTP real.
- **R2 vs DigitalOcean Spaces** para los uploads (decisión de Alan).

---

## 8. Cómo retomar (en un chat nuevo)

1. **Leer**, en orden: este doc → `work-agent/backend/00-README.md` (decisiones canónicas) → la memoria del proyecto (si está disponible) → el doc de la fase a construir (`work-agent/backend/10-plan-migracion-fases.md` + `build/PROMPTS-POR-FASE.md`).
2. **Preguntar al usuario qué insumo ya tiene** (la cuenta de Mercado Pago es la que destraba ~80%).
3. **Construir la fase siguiendo el patrón establecido:**
   - Backend: endpoint en `server/src/routes/*` + service en `services/*` + serializer en `lib/serialize.ts` (Prisma → shape del dominio).
   - Frontend: override en `RemoteDataStore` (optimista + re-hidrata o revierte; mantener la interfaz síncrona salvo que se haga la migración async).
   - Si hay datos nuevos: ampliar `server/prisma/seed.ts` y correrlo.
   - Deploy: `railway up server --path-as-root -s ccm-api -c`.
   - **Verificar e2e** con curl Y en navegador (Playwright), y **limpiar la data de prueba**.
4. **Pagos (C):** el **webhook de MP es la única fuente de verdad**; idempotencia obligatoria; **sandbox primero**. Ver `work-agent/backend/07-pagos-mercadopago.md`.

---

## 9. Índice de docs del plan (`work-agent/backend/`)

`00-README` (índice + decisiones canónicas) · `01` estado actual · `02` objetivos · `03` stack · `04` modelo de datos (Prisma) · `05` API · `06` auth · `07` pagos MP · `08` analytics/tiempo real · `09` infra/deploy · `10` migración por fases · `11` riesgos/decisiones abiertas · `12` roadmap · `13` acreditación en puerta · `build/` (PROMPT-MAESTRO + PROMPTS-POR-FASE + CONTEXTO-Y-PLAN-ESTRATEGICO).

> **Nota:** los docs `01`–`13` se escribieron como PLAN antes de implementar. Algunos detalles (ej. la auth real OTP, los uploads, la red privada de Railway) describen el destino; lo realmente implementado y sus desvíos están en este HANDOFF (secciones 4–6) y en los mensajes de commit.
