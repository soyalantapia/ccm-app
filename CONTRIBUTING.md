# CONTRIBUTING — Cómo trabajamos en CCM

Guía para que **varios trabajemos en paralelo sin pisarnos**. Si sos nuevo: leé primero [`PROJECT.MD`](./PROJECT.MD) (la biblia) y [`work-agent/ESTADO-ACTUAL.md`](./work-agent/ESTADO-ACTUAL.md) (dónde estamos hoy).

---

## 1. Setup de cero (máquina nueva → corriendo)

> ⚠️ **Importante (patrón del equipo):** los archivos reales viven en `~/dev/ccm-app` con un **symlink** en `~/Desktop/Programacion`. El Desktop está en iCloud y rompe esbuild/rollup. **Trabajá siempre desde `~/dev/ccm-app`.**

```bash
# Frontend
cd ~/dev/ccm-app
npm install
npm run dev                      # http://localhost:5173/ccm-app/  (modo demo, sin backend)

# Backend
cd server
npm install
cp .env.example .env             # completar DATABASE_URL (mínimo) + secretos según fase
npm run prisma:generate
npm run prisma:migrate
npm run dev                      # http://localhost:4000/api/v1/health
```

Para correr el front **contra un backend**, poné en un `.env` de la raíz:
```
VITE_API_URL=http://localhost:4000          # tu server local
# o VITE_API_URL=https://ccm-api-production-91a9.up.railway.app  (prod; ⚠️ datos reales)
```

---

## 2. Flujo de ramas

- **`main`** — dispara el deploy de GitHub Pages (CI). No commitear directo salvo cosas triviales.
- **`feat/backend-foundation`** — rama de trabajo activa del backend + features. Hoy la base de la mayoría del trabajo.
- **Ramas de feature:** `feat/<descripcion-corta>` salida de la rama base correspondiente. Una rama por unidad de trabajo.
- **Fixes:** `fix/<descripcion>`. **Hotfix de prod:** `hotfix/<descripcion>`.

**Regla de oro:** nunca pushear a `main` algo sin verificar (rompe la demo pública). El deploy de producción (Railway) es manual y deliberado (ver §6).

---

## 3. Convención de commits

Formato [Conventional Commits](https://www.conventionalcommits.org/), en español, como ya viene el historial:

```
<tipo>(<scope>): <qué cambió, imperativo>

[cuerpo opcional: por qué, no el qué]
```

**Tipos:** `feat` · `fix` · `refactor` · `docs` · `chore` · `test` · `perf`.
**Scopes habituales:** `server`, `beneficios`, `banners`, `notas`, `participantes`, `deploy`, `review`, `async`, `membresia`, `publicidad`.

Ejemplos reales del repo:
```
feat(beneficios): descuentos para inscriptos (CMS editable + códigos gated)
fix(build): useStoreQuery devuelve T (cast initialData) — destraba tsc -b/deploy
feat(deploy): centralizar front+API en un solo servicio Railway
```

> Pie de commit para cambios asistidos por IA: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## 4. Antes de abrir un PR (checklist de "hecho")

- [ ] **Typecheck front:** `npm run build` (= `tsc -b && vite build`). ⚠️ **NO** alcanza `tsc --noEmit` — ver gotcha abajo.
- [ ] **Lint:** `npm run lint`.
- [ ] **Typecheck server:** `cd server && npm run typecheck`.
- [ ] **Migraciones:** si tocaste el schema Prisma, generaste una **migración versionada** (`prisma migrate dev --name <nombre>`), no editaste a mano. El seed sigue idempotente.
- [ ] **Reglas de oro respetadas** (§5): datos por `store`, voseo, tokens de tema, tracking, mobile-first.
- [ ] **Verificado a mano** el flujo que tocaste (no hay suite de tests todavía — ver §7).
- [ ] **Doc actualizada** si cambió el estado: `work-agent/ESTADO-ACTUAL.md` y/o `PROJECT.MD`.

> 🔴 **GOTCHA del typecheck del front:** el `tsconfig.json` raíz es un *solution file* con `"files": []`; `tsc --noEmit` **no compila `src/`**. El typecheck real es **`tsc -b`** (lo que corre `npm run build`). Si tu cambio compila con `--noEmit` pero rompe el build, este es el motivo.

---

## 5. Reglas de oro (no negociables)

**Frontend:**
- La UI consume **solo** `store` / `useStore` / hooks de `src/data/queries.ts`. **Nunca** importa el seed ni toca `localStorage` directo. Si necesitás un dato nuevo, agregalo a la interfaz `DataStore` y a sus dos implementaciones.
- Todo texto de UI en **español rioplatense (voseo)**; código, variables y tablas en inglés.
- **Theming 100% por tokens** `--t-*` (`src/index.css`). Prohibido hardcodear colores.
- **Nunca sacar al usuario de la app** — videos siempre embebidos de YouTube (`youtube-nocookie.com`).
- **Trackear toda interacción** relevante (`store.track`, taxonomía PRD §13).
- **Mobile-first** absoluto.
- URLs externas (banners, beneficios) **siempre** vía `safeExternalHref` (front) — nunca un `<a href>` crudo.

**Backend:**
- Prefijo único **`/api/v1`**. La lógica de datos va en `services/`, no inline en los routers.
- **`Device` es la única raíz de usuario**; la PII va en `ProfileField` (no columnas planas). El `deviceId` sale **del token verificado**, nunca del body.
- **Validá el borde con zod**; errores con el formato `{ error: { code, message } }` (`lib/errors.ts`).
- **No hard-delete** de datos con valor real (devolver 409 o soft-delete).
- URLs que se persisten (`banner.destinationUrl`, `benefit.url`) pasan por `cleanStoredUrl` (server).
- Tipos de dominio: **no se duplican**, se importan del front vía `@domain/types`.

Detalle: [`CLAUDE.md`](./CLAUDE.md) (front) · [`server/CLAUDE.md`](./server/CLAUDE.md) (back) · [`work-agent/backend/00-README.md`](./work-agent/backend/00-README.md) (16 decisiones canónicas = LEY).

---

## 6. Deploy

- **Producción (Railway, front + API):** `railway up . --path-as-root -s ccm-api -c` desde la raíz. Las migraciones se aplican solas en el arranque del contenedor. Es manual y deliberado.
- **GitHub Pages (demo, redundante):** automático al pushear a `main` (CI), o manual con `npm run deploy`.

Antes de deployar a prod: build y lint limpios, migraciones probadas, y avisá al equipo (es un evento con tráfico real).

---

## 7. Tests

🔴 **Hoy no hay tests** (andamiaje `vitest` + `supertest` montado en `server/`, 0 archivos). Si tu cambio toca lógica de negocio sensible, **sumá el primer test** del área. Prioridad de la suite: webhook MP (firma + idempotencia), concurrencia de cupo (anti-oversell), gating de códigos de beneficio, acreditación QR. Correr: `cd server && npm test`.

---

## 8. Dónde pedir contexto

| Necesito… | Voy a… |
|---|---|
| Entender el proyecto entero | `PROJECT.MD` |
| Saber qué está hecho/pendiente hoy | `work-agent/ESTADO-ACTUAL.md` |
| Correr/deployar | `README.md` |
| El contrato de la API | `API.md` |
| Seguridad / amenazas | `SECURITY.md` |
| Operar / día del evento | `RUNBOOK.md` |
| Producto / por qué | `docs/PRD.md` |
| Diseño / UI | `DESIGN.md` |
| Decisiones canónicas backend | `work-agent/backend/00-README.md` |
