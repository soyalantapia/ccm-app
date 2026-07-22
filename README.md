# CCM · Córdoba Corazón de Moda — Plataforma

PWA oficial de **Córdoba Corazón de Moda 2026 (14ª edición)** — la app, la landing y el panel del organizador, todo en un solo producto. Hoy **en producción** sobre un único servicio Railway que sirve el frontend **y** la API.

> 📖 **¿Primera vez acá? Leé [`PROJECT.MD`](./PROJECT.MD)** — la biblia del proyecto (negocio, arquitectura, modelo de datos, estado real, roadmap). Este README es el **onboarding técnico**: cómo está armado, cómo correrlo y dónde está cada cosa.

---

## 🔗 En vivo

| Qué | URL / acceso |
|---|---|
| **App + API (producción, Railway)** | https://ccm-api-production-91a9.up.railway.app |
| Panel del organizador | `…/admin` (clave = el `ADMIN_TOKEN`; en la demo GH Pages, cualquier clave) |
| API health | `…/api/v1/health` |
| Demo estática (GitHub Pages, redundante) | https://soyalantapia.github.io/ccm-app/ |
| Repo | `soyalantapia/ccm-app` · rama de trabajo `feat/backend-foundation` |

---

## 🧱 Stack

**Frontend** (raíz del repo): React 19 · React Router 7 (`createBrowserRouter`) · TanStack Query 5 · Vite 8 · TypeScript 6 (project references) · Tailwind **v4 CSS-first** (tokens en `src/index.css`, sin `tailwind.config.js`) · `vite-plugin-pwa` (`registerType: 'prompt'`) · `lucide-react` · `qrcode`.

**Backend** (`server/`): Node ≥20 (ESM) · Express 4 · Prisma 6 · PostgreSQL · zod · helmet · cors · express-rate-limit · corre con **`tsx`** (no se compila en prod). Tests: vitest + supertest (**andamiaje listo, 0 archivos** — ver [Testing](#-testing)).

**Infra:** Railway (servicio único `ccm-api` = front + API, + plugin Postgres) vía Docker multi-stage · GitHub Pages (demo estática). **Repo single-app** (no monorepo): front en `src/`, backend en `server/`.

> Detalle de versiones exactas: [`PROJECT.MD` §6](./PROJECT.MD#6-stack-tecnológico).

---

## 📂 Estructura del repo

```
ccm-app/
├── PROJECT.MD            ← biblia del proyecto (empezá acá)
├── README.md             ← este archivo (onboarding técnico)
├── CONTRIBUTING.md       ← cómo trabajamos en equipo (setup, ramas, PRs, reglas)
├── API.md                ← contrato de la API (todos los endpoints)
├── SECURITY.md           ← seguridad: controles, amenazas, pendientes
├── RUNBOOK.md            ← operación: deploy, rollback, incidentes, día del evento
├── CLAUDE.md             ← convenciones para agentes (front)
├── DESIGN.md             ← sistema de diseño
├── DECISIONS.md          ← log de ~74 decisiones de la Fase 0 (demo)
├── AUDITORIA.md          ← auditoría 360 de la demo
├── docs/PRD.md           ← PRD v1.1 (biblia de producto)
├── Dockerfile            ← imagen de prod (multi-stage: front + server)  ⚠️ el activo
├── vite.config.ts        ← base path configurable + PWA + prerender OG
│
├── src/                  ← FRONTEND
│   ├── main.tsx          ← entry: React + QueryClient + initTheme + ensureDevice
│   ├── App.tsx           ← router (todas las rutas) + layouts
│   ├── index.css         ← Tailwind v4 + design tokens (--t-*)
│   ├── config/           ← marca/venue/fechas (index.ts) + planes de entrada (plans.ts)
│   ├── data/             ← ★ CAPA DE DATOS (el corazón)
│   │   ├── store/        ←   DataStore (interfaz) · LocalDataStore · RemoteDataStore · overlay · index (singleton)
│   │   ├── queries.ts    ←   hooks TanStack Query (useEvents, useBenefits, useBanners, useNotas…)
│   │   ├── types.ts      ←   tipos de dominio (compartidos con el server vía @domain/types)
│   │   ├── ids.ts        ←   IDs/slugs canónicos (contrato de deep-links)
│   │   └── seed/         ←   contenido semilla (events, catalog, benefits, banners, notas…)
│   ├── lib/              ← utilidades (bus, storage, api, identity, track, theme, assets, href, ics…)
│   ├── components/       ← layout/ (SiteLayout, AdminLayout, RouteError…) + ui/ (kit propio) + profile/
│   ├── features/<area>/  ← lógica por sección (admin, ads, catalogo, eventos, fotos, tickets…)
│   ├── pages/            ← una página por ruta + pages/app/ (asistente) + pages/admin/ (13 pantallas)
│   └── fonts/            ← Schibsted Display (auto-hosteada)
│
├── server/               ← BACKEND
│   ├── src/
│   │   ├── index.ts      ← bootstrap: assertProd() → createApp() → listen()
│   │   ├── app.ts        ← middlewares + montaje de routers en /api/v1 + serving del SPA
│   │   ├── routes/       ← 13 routers (health, devices, me, events, registrations, catalog,
│   │   │                    photos, benefits, banners, notas, memberships, analytics, admin)
│   │   ├── services/     ← 12 services (lógica de negocio + Prisma)
│   │   ├── lib/          ← env (zod), deviceToken (HMAC), errors, prisma, serialize, url
│   │   └── middlewares/  ← device, admin, error
│   └── prisma/
│       ├── schema.prisma ← 29 modelos · 15 enums
│       ├── migrations/   ← 6 migraciones versionadas (0_init … 5_nota)
│       └── seed.ts       ← seed idempotente
│
├── scripts/              ← generación de assets (make-icons, make-og, optimize-images, fetch-images)
├── public/               ← estáticos (img/, icons/, video/, og-*.jpg, favicon)
└── work-agent/           ← ★ documentación de trabajo (ver sección dedicada abajo)
```

---

## 🚀 Cómo correr en local

### Frontend
```bash
npm install
npm run dev          # Vite dev server → http://localhost:5173/ccm-app/
```
- **Sin `VITE_API_URL`** → modo demo offline (`LocalDataStore`: seed + localStorage). El fallback nunca se rompe.
- **Con `VITE_API_URL`** (en un `.env` de la raíz) → pega a un backend real (`RemoteDataStore`). Ej: `VITE_API_URL=http://localhost:4000` (tu server local) o el dominio de Railway.

#### Links de pago de Mercado Pago (Membresía y Publicidad)

| Variable | Qué habilita |
| --- | --- |
| `VITE_MP_LINK_MEMBRESIA` | Link de cobro real de la membresía Socio CCM en `/membresia`. |
| `VITE_MP_LINK_PUBLICIDAD` | Link de cobro real de los espacios publicitarios en `/publicidad`. |

Ambas son **opcionales** y se leen en build-time. Si están seteadas con un link de cobro real de
Mercado Pago (`https://mpago.la/…` o `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=…`),
esas pantallas muestran el **QR + el botón "Abrir el pago en Mercado Pago"**. Si no están —o si el
valor no es un link de MP válido— muestran un mensaje para **coordinar el pago con el equipo por
Instagram**, sin QR.

Antes había un QR hardcodeado a `mercadopago.com.ar/checkout/ccm?…`, una URL **que no existe**: MP
responde "La página que buscás ya no existe" y el que escaneaba no podía pagar creyendo que sí. La
validación vive en [`src/lib/mpLink.ts`](src/lib/mpLink.ts) (rechaza la home pelada, `/checkout/ccm`,
dominios ajenos y todo lo que no sea `https`).

### Backend
```bash
cd server
npm install
cp .env.example .env              # completá DATABASE_URL (y secretos según fase)
npm run prisma:generate           # genera el Prisma Client
npm run prisma:migrate            # aplica migraciones (necesita Postgres + DATABASE_URL)
npm run db:seed                   # (opcional) siembra datos de ejemplo
npm run dev                       # tsx watch → http://localhost:4000  ·  GET /api/v1/health
```

### Base de datos
No hay Postgres local en el repo. Opciones: levantar uno propio y poner su URL en `server/.env`, **o** apuntar a la DB de prod copiando la `DATABASE_URL` de Railway (⚠️ **escribe datos reales** — usar con cuidado). Para inspeccionarla: `cd server && npx prisma studio`.

---

## 🛠️ Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Front en dev (HMR) |
| `npm run build` | **`tsc -b && vite build`** — build de prod (genera `dist/` + `404.html` + HTMLs OG por ruta) |
| `npm run lint` | ESLint (flat config en `eslint.config.js`) |
| `npm run preview` | Sirve el `dist/` ya buildeado |
| `npm run deploy` | Build + push a la rama `gh-pages` |
| `cd server && npm run dev` | API en watch (`tsx`) |
| `cd server && npm run typecheck` | `tsc --noEmit` del server |
| `cd server && npm run prisma:deploy` | Aplica migraciones (idempotente, prod) |
| `cd server && npm run db:seed` | Siembra datos |
| `cd server && npm test` | Vitest (hoy corre 0 tests) |
| `railway up . --path-as-root -s ccm-api -c` | **Deploy de todo (front + API)** en un comando |

> ⚠️ **GOTCHA del typecheck del front:** el typecheck real es **`tsc -b`** (lo que corre `npm run build`). El `npx tsc --noEmit` que sugiere `CLAUDE.md` **NO chequea `src/`**: el `tsconfig.json` raíz es un *solution file* con `"files": []` que solo referencia a `tsconfig.app.json`/`tsconfig.node.json`, así que `--noEmit` no compila nada de la app. **Para verificar tipos del front usá `tsc -b` o `npm run build`.**

---

## 🌐 Deploy

### Producción (Railway, un solo servicio)
```bash
railway up . --path-as-root -s ccm-api -c
```
La imagen (`Dockerfile` de la **raíz**, multi-stage) buildea el front con `VITE_BASE=/` + `VITE_API_URL=<el propio dominio>`, instala el server con Prisma, y arranca con `npx prisma migrate deploy && npx tsx src/index.ts` (las migraciones se aplican en cada deploy; si fallan, el contenedor sale y Railway conserva la versión sana). El server sirve `dist/` + fallback SPA y la API en `/api/v1` (`FRONT_DIST=/app/dist`).

**Variables de entorno (prod):** obligatorias `DATABASE_URL`, `CORS_ORIGINS` (≠ `*`), `ADMIN_TOKEN`, `DEVICE_TOKEN_SECRET` (sin ellas `assertProd` aborta el arranque). Las fija el Dockerfile: `NODE_ENV`, `FRONT_DIST`. Opcionales por fase: `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET`, `STORAGE_*`, `RESEND_API_KEY`, `RATE_LIMIT_WRITES`/`RATE_LIMIT_ANALYTICS`, etc. Contrato completo: `server/src/lib/env.ts`.

### GitHub Pages (redundante)
CI en `.github/workflows/deploy.yml` (push a `main`, buildea con `VITE_API_URL` apuntando a Railway, base `/ccm-app/`). Deploy manual: `npm run deploy`. Quedó secundario tras centralizar en Railway.

---

## 🧠 Arquitectura en 60 segundos

- **Toda la UI lee/escribe por una sola interfaz: `DataStore`** (`src/data/store/DataStore.ts`). Las pantallas nunca tocan `localStorage`, el seed ni la red directo.
- Dos implementaciones intercambiables por `VITE_API_URL`: **`LocalDataStore`** (demo: seed + localStorage + overlay) y **`RemoteDataStore`** (backend: caché hidratada + mutaciones optimistas + reconcile/revert). La interfaz es **síncrona**; el caché responde al instante y el backend recibe escrituras en segundo plano.
- **Reactividad:** cada escritura emite en un **bus**; un bridge invalida la `queryKey` correspondiente de TanStack Query (y el evento `storage` propaga cambios entre pestañas → el dashboard se mueve "en vivo").
- **Identidad sin contraseñas:** el dispositivo es la cuenta; `POST /api/v1/devices` emite un **device-token HMAC** (`X-Device-Token`); el perfil se completa "justo a tiempo" (`requireProfile`).
- **Un solo servicio en prod:** Express sirve el SPA buildeado **y** `/api/v1` desde el mismo origen (sin CORS cross-origin).

> Detalle completo: [`PROJECT.MD` §5](./PROJECT.MD#5-arquitectura).

---

## 📁 Qué hay en `work-agent/`

Documentación de trabajo del proyecto (no es código). Mapa:

| Archivo | Qué es |
|---|---|
| **`ESTADO-ACTUAL.md`** | ⭐ **Estado real vivo**: qué fase está hecha, qué hay en prod, qué falta, accesos y comandos. **Leé esto para saber dónde estamos hoy.** |
| `HANDOFF-COMPLETO.md` | Handoff autosuficiente del estado real del backend (TL;DR, URLs, la costura `DataStore`, fases). |
| `PROMPT-SENIOR-DEV.md` | Prompt para arrancar un chat nuevo como senior dev del proyecto. |
| `README.md` | Índice de la carpeta. |
| `backend/00-README.md` | **16 decisiones canónicas (LEY)** del backend + fuentes de verdad por tema. |
| `backend/01–13-*.md` | **El PLAN de arquitectura** del backend (escrito *antes* de implementar): estado de partida, objetivos, stack, modelo de datos, contrato de API, auth/seguridad, pagos MP, analytics, infra, plan de fases, riesgos, roadmap, acreditación en puerta. |
| `backend/build/*` | Prompts de construcción (CONTEXTO-Y-PLAN, PROMPT-MAESTRO, PROMPTS-POR-FASE). |

> ⚠️ **Los `backend/00–13` y `build/*` son PLAN, no estado.** Hablan en futuro de cosas ya implementadas (device-token, fases A/B/D/E/F/G, centralización Railway). Para el **estado real** mandan `PROJECT.MD` y `work-agent/ESTADO-ACTUAL.md`. Los `00` (decisiones canónicas) y `04` (modelo de datos) sí son referencia vigente.

---

## 🧰 Qué tenemos a la mano (accesos y recursos)

- **Backend en vivo:** `https://ccm-api-production-91a9.up.railway.app/api/v1` (health, events, catalog, benefits, banners, notas, plans, sponsors…).
- **Panel admin:** `…/admin` con el `ADMIN_TOKEN` (Railway → variables del servicio `ccm-api`).
- **DB de prod:** plugin Postgres de Railway. Inspección: `DATABASE_URL` en `server/.env` + `npx prisma studio` (o `psql`).
- **Deploy:** `railway up . --path-as-root -s ccm-api -c` (front + API juntos).
- **Seed de desarrollo:** `cd server && npm run db:seed`. 🔴 **No es inofensivo:** hace `deleteMany` de fotos, obras de portfolio y campos de convocatoria, y sus upsert pisan lo cargado desde el panel. Una guardia lo aborta si la base no es local.
- **CLI:** `railway` (proyecto enlazado), `gh` (cuenta `soyalantapia`).

---

## 🧪 Testing

🔴 **Estado actual: no hay tests.** El andamiaje (`vitest` + `supertest`) está montado en `server/` (`npm test` corre, pero encuentra 0 archivos); el front no tiene runner. La correctness se valida hoy con `tsc -b` + `npm run lint` + revisiones adversariales/QA manuales. **Es la deuda técnica #1.** Próximos tests de mayor valor (sobre Postgres real): webhook MP (firma + idempotencia), concurrencia de cupo (anti-oversell), gating de códigos de beneficio, acreditación QR.

---

## 📜 Reglas de oro (convenciones)

- La UI consume **solo** `store` / `useStore` / hooks de `queries.ts`. Nunca importa seed ni toca `localStorage` directo.
- Todo en **español rioplatense (voseo)** en la UI; código, variables y tablas en inglés.
- **Theming 100% por tokens** `--t-*` (cambiar un valor retematiza toda la app). No hardcodear colores.
- **Nunca sacar al usuario de la app** (videos siempre embebidos de YouTube).
- **Trackear toda interacción** (`store.track`, taxonomía del PRD §13).
- **Mobile-first** absoluto.
- Archivos reales en `~/dev/ccm-app` + symlink en `~/Desktop/Programacion` (Desktop = iCloud rompe esbuild/rollup).

Detalle: [`CLAUDE.md`](./CLAUDE.md) (front) · [`DESIGN.md`](./DESIGN.md) (diseño) · [`work-agent/backend/00-README.md`](./work-agent/backend/00-README.md) (canon backend).

---

## 📌 Estado y pendientes

✅ **En prod:** identidad + analytics, eventos/cupos atómicos, catálogo/galerías/contenido, publicidad self-serve, membresía Socio, auth+CRUD admin, y las 4 features de los audios de Gastón (beneficios, banners, participantes con precio/contacto, notas-CMS). Todo centralizado en un servicio Railway.

⏳ **Pendiente** (mayormente por insumos externos): checkout MP de entradas (cuenta de Gastón), uploads de imágenes reales (R2 vs Spaces), login OTP + roles para el organizador, acreditación QR en puerta (Fase H), **suite de tests**, y la ronda de testeo de flujos end-to-end antes del lanzamiento.

> Estado detallado y bloqueantes: [`PROJECT.MD` §10 y §13](./PROJECT.MD#10-estado-por-fases-qué-está-en-prod) · [`work-agent/ESTADO-ACTUAL.md`](./work-agent/ESTADO-ACTUAL.md).
