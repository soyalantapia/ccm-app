# Infraestructura, deploy y DevOps

Cómo se hostea, se despliega y se opera el backend de CCM (Córdoba Corazón de Moda) en Railway, cómo convive con el front estático en GitHub Pages, y qué hace falta para que el día del evento (19–20/09/2026) nada se caiga. Este doc es el "runbook" de infra: servicios, variables de entorno, migraciones, object storage, dominios/CORS, backups, logging y CI/CD. La justificación de *por qué* este stack ya está en `03-stack-tecnologico.md`; acá va el *cómo*.

---

## 0. Topología de un vistazo

```
   GitHub (soyalantapia/ccm-app)
   ├── push a main ─────────────► GitHub Actions (build front) ──► gh-pages branch
   │                                                                    │
   │                                                          GitHub Pages (estático)
   │                                                  https://soyalantapia.github.io/ccm-app/
   │                                                                    │ fetch + CORS
   │                                                                    │ VITE_API_URL
   └── push a main (server/) ────► Railway (auto-deploy)                ▼
                                   ├── Servicio "ccm-api"  (Node + Express)  ◄── browser
                                   │     └─ release: prisma migrate deploy
                                   ├── Postgres "ccm-db"   (plugin Railway, backups)
                                   └── Cron (expirar órdenes/campañas)
                                              │
                            ┌─────────────────┼──────────────────────┐
                            ▼                 ▼                       ▼
                       Mercado Pago     Cloudflare R2          (logs/monitoreo
                       (webhooks)       (fotos/portfolios/      Railway + Better Stack)
                                         logos, URLs firmadas)
```

Dos pipelines **independientes**: el front sigue desplegando a GH Pages como hoy (`npm run deploy`), y el backend vive en Railway. El único acoplamiento es `VITE_API_URL` (build-time del front) + `CORS_ORIGINS` (runtime del API).

---

## 1. Servicios en Railway

Un solo **proyecto** Railway `ccm` con estos servicios. Alan ya corre este mismo layout en Norte, My Alquiler y misanpedro, así que el flujo (`railway link`, `railway up`, variables compartidas, plugin Postgres) es rutina.

| Servicio | Qué es | Notas |
|---|---|---|
| `ccm-api` | Node 20 + Express, builds desde `server/` del repo | Expone `/health` y todo el API bajo el prefijo `/api/v1/*` (incluido `/api/v1/webhooks/mp`). Restart policy: `on-failure`, max 3 |
| `ccm-db` | Plugin **PostgreSQL** de Railway | Provee `DATABASE_URL`. Backups gestionados (ver §6) |
| `ccm-cron` *(opcional)* | El mismo imagen que `ccm-api`, arrancado con `npm run cron` | Expira `TicketOrder` en `pending` abandonadas y marca `AdCampaign` con `status='activa'` cuyo `expiresAt` ya pasó como `expirada`. Alternativa: Railway Cron sobre el propio `ccm-api` |

**Layout del repo.** El backend va en un subdirectorio `server/` del MISMO repo (`soyalantapia/ccm-app`), no en un repo aparte. Railway apunta su *Root Directory* a `server/`. Así el front (raíz) y el API (`server/`) comparten los tipos del dominio (`src/data/types.ts`) sin un paquete publicado.

```
ccm-app/
├── src/                  ← front (Vite, deploy GH Pages)
├── server/               ← backend (Railway Root Directory = server/)
│   ├── prisma/schema.prisma
│   ├── src/
│   ├── package.json
│   └── railway.json      ← config declarativa de deploy (build/release/start)
└── .github/workflows/    ← CI (lint/typecheck front + back, deploy front)
```

🔶 **[DECISIÓN ABIERTA]** **Plan de Railway y always-on.** Para que el API NO duerma el día del evento (cold start de Prisma + Postgres = primeros requests lentos en la puerta), conviene un servicio que no haga sleep. El **Hobby ($5/mes, sin sleep) o Pro ($20/mes/asiento)** alcanza para la escala de CCM. Hay que dimensionar con Alan/Gastón antes de septiembre. Recomendación operativa: pasar a always-on al menos la semana del evento.

🔶 **[DECISIÓN ABIERTA]** **Presupuesto mensual estimado.** Orden de magnitud para CCM (un evento puntual, tráfico bajo el resto del año):

| Ítem | Estimado |
|---|---|
| Railway `ccm-api` (Hobby/Pro, usage-based RAM+CPU) | ~USD 5–20 / mes |
| Railway Postgres (volumen chico, <1 GB) | incluido en el uso del proyecto, ~USD 5–10 / mes |
| Cloudflare R2 (storage + **egress $0**) | ~USD 0–5 / mes (10 GB de fotos ≈ USD 0,15) |
| Dominio `.com.ar` (NIC Argentina) | ~ARS, anual, no mensual |
| Mercado Pago | sin fee fijo; comisión por venta |
| **Total mensual aproximado** | **~USD 15–35 / mes** fuera de evento; picos el mes del evento |

Cifras a confirmar contra el pricing vigente de Railway/R2 y el volumen real de fotos. El driver de costo es el **storage de fotos** (mitigado por R2 sin egress) y el **always-on** del mes del evento.

---

## 2. Variables de entorno

### 2.1 Backend — servicio `ccm-api` (Railway)

```bash
# Base de datos — la inyecta el plugin Postgres de Railway (no se setea a mano)
DATABASE_URL=postgresql://...@...railway.internal:5432/railway

# Auth — TRES secretos JWT separados (NO un único JWT_SECRET); ver doc 06 (auth)
DEVICE_TOKEN_SECRET=             # firma del token de identidad de Device (passwordless)
ADMIN_TOKEN_SECRET=              # firma de sesiones de AdminUser (OTP); rotar = invalida sesiones admin
ACCREDITATION_TOKEN_SECRET=      # firma del accreditationToken del QR (ver doc 13)
OTP_PEPPER=                      # sal del hash del OTP de admin
RESEND_API_KEY=                  # envío del OTP de admin por email (Resend)
ADMIN_BOOTSTRAP_EMAIL=           # email del primer OWNER bootstrappeado por env

# Mercado Pago
MP_ACCESS_TOKEN=                 # 🔶 token de la cuenta de cobro real (Gastón/CCM)
MP_WEBHOOK_SECRET=               # verificación de firma del webhook (x-signature)

# Object storage S3-compatible (R2 recomendado; ver §4)
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_REGION=auto                   # R2 usa 'auto'
S3_BUCKET=ccm-media
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=https://media.ccm.com.ar   # 🔶 dominio/CDN público del bucket

# CORS — origins permitidos (coma-separados), SIN trailing slash
CORS_ORIGINS=https://soyalantapia.github.io   # + dominio propio si lo hay 🔶

# Operación
NODE_ENV=production
PORT=                            # Railway lo inyecta; el server debe leer process.env.PORT
APP_BASE_URL=https://api.ccm.com.ar            # 🔶 para back_urls de MP y links del webhook
LOG_LEVEL=info
```

Reglas:
- **`CORS_ORIGINS` es exactamente el origin de GH Pages.** Para `soyalantapia.github.io/ccm-app/`, el *origin* del navegador es `https://soyalantapia.github.io` (sin el path `/ccm-app/`). El path NO entra en CORS. Si más adelante hay dominio propio del front, se suma a la lista.
- **`PORT`** lo asigna Railway: el server hace `app.listen(process.env.PORT)`. No hardcodear.
- Secretos (los tres `*_TOKEN_SECRET`, `OTP_PEPPER`, `RESEND_API_KEY`, `MP_*`, `S3_*`) se cargan en **Railway → Variables**, nunca al repo. Para local, un `.env` git-ignored.

### 2.2 Frontend — build de GitHub Pages

El front necesita **una sola variable nueva**: `VITE_API_URL`. Hoy no existe (el único uso de env es `import.meta.env.BASE_URL`).

```bash
# .env.production del front (o secret de GitHub Actions)
VITE_API_URL=https://api.ccm.com.ar    # 🔶 dominio del API SIN prefijo; AUSENTE = modo demo/offline
```

`VITE_API_URL` lleva **solo el dominio**, sin `/api/v1` ni `/v1`: el cliente arma la base como `VITE_API_URL + '/api/v1'` (canon de paths, doc 05). Es **build-time** (Vite la hornea en el bundle), no runtime. Cambiarla exige re-build + re-deploy del front. Esto es la costura del fallback:

```ts
// src/data/store/index.ts
const API = import.meta.env.VITE_API_URL
export const store: DataStore = API
  ? new RemoteDataStore(API)   // backend real
  : new LocalDataStore()       // demo/offline (sin VITE_API_URL)
```

Que `VITE_API_URL` vacía = demo es también el **plan de contingencia**: si el API se cae el día del evento, un re-deploy del front sin la variable vuelve a la demo local, y al menos la PWA funciona offline para mostrar agenda/galerías cacheadas.

---

## 3. Migraciones (Prisma) en el release

El esquema vive en `server/prisma/schema.prisma`. La regla de oro: **`migrate deploy` corre en el release de Railway**, NUNCA `migrate dev` ni `db push` en producción.

```jsonc
// server/railway.json  — config declarativa del deploy
{
  "$schema": "https://railway.app/railway.schema.json",
  "build":   { "builder": "NIXPACKS" },
  "deploy": {
    // Release Command: se ejecuta UNA vez por deploy, antes de levantar instancias.
    // Si la migración falla, Railway aborta el deploy y mantiene la versión anterior.
    "preDeployCommand": ["npx prisma migrate deploy"],
    "startCommand": "node dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "healthcheckPath": "/health"
  }
}
```

```jsonc
// server/package.json — scripts
{
  "scripts": {
    "build": "prisma generate && tsc -b",
    "start": "node dist/index.js",
    "migrate:dev": "prisma migrate dev",        // SOLO local
    "migrate:deploy": "prisma migrate deploy",  // CI/release
    "cron": "node dist/cron.js",
    "seed": "tsx prisma/seed.ts"
  }
}
```

Flujo de cambio de esquema:
1. Dev local: `prisma migrate dev --name agrega_x` → genera la carpeta de migración versionada en `prisma/migrations/`.
2. Commit de la migración + push.
3. Railway hace build → corre `preDeployCommand` (`migrate deploy`, aplica solo las pendientes) → si OK, swap a la nueva versión.

**Seed inicial.** El seed del front (`src/data/seed*`) sirve de fuente para poblar Postgres por primera vez (eventos de la 14ª edición, planes de entrada, sponsors demo, convocatorias). Se corre **a mano una vez** (`railway run npm run seed`), no en cada deploy, para no re-insertar. Ojo: el seed NO debe pisar datos reales (socios pagos, órdenes confirmadas) — escribir el seed con `upsert` idempotente por `slug`/`id` estable.

🔶 **[DECISIÓN ABIERTA]** Qué del seed actual es "dato real fijado" (precios y planes los define Gastón) vs "relleno demo a borrar antes del evento", igual que se hizo en Norte/misanpedro antes de lanzar.

### 3.1 Rollback de migraciones (qué hacer si una migración falla en prod)

Prisma Migrate **no genera down-migrations automáticas**: `migrate deploy` solo aplica hacia adelante. El plan de reversión depende de *cuándo* falla, y la clave es que el `preDeployCommand` corre **antes** del swap de instancias.

- **Falla durante el deploy (en `migrate deploy`).** Railway **aborta el deploy y deja viva la versión anterior** (no hace swap). El API sigue sirviendo con el esquema viejo. La migración rota queda registrada como *failed* en `_prisma_migrations`. Antes de reintentar hay que resolver el estado: corregir la migración y, si dejó la DB a medias, marcarla con `prisma migrate resolve --rolled-back <nombre>` (o `--applied` si en realidad sí se aplicó) y re-deployar. **Nunca** editar una migración ya aplicada en prod: se crea una nueva que arregla.
- **Falla después del deploy (esquema OK, app rota).** Rollback = **re-deploy del commit anterior** desde Railway (Deployments → Redeploy). Esto solo revierte el **código**, no el esquema. Por eso toda migración debe ser **retrocompatible hacia atrás** (expand/contract): primero agregar columnas/tablas nullables, deployar código que las usa, y recién en un release posterior borrar lo viejo. Así el código viejo sigue funcionando contra el esquema nuevo y un redeploy del commit previo no explota.
- **Reversión de datos real (último recurso).** Si una migración corrompió datos, se restaura desde el backup más cercano (ver §6) en una DB scratch, se valida, y se promueve. Por eso la semana del evento los backups van cada 6 h y el restore se prueba.

**Regla dura para la semana del evento (14–20/09):** **freeze de migraciones**. Ningún cambio de esquema en los días previos ni durante el evento salvo hotfix crítico; si hay que tocar algo, que sea aditivo (columna nullable) y probado antes en una copia de la DB de prod. Una migración que falla en `migrate deploy` con la puerta llena de gente es el peor escenario, y el expand/contract + freeze lo evitan.

---

## 4. Object storage para imágenes subidas (R2 / Spaces)

Las **galerías de fotos** (`Gallery.photos[]`), los **portfolios** de expositores (`CatalogProfile.portfolio[]`) y los **logos/creativos** de sponsors son binarios: **no van en Postgres**. Van a object storage S3-compatible; la DB guarda solo la **clave/URL**.

**Recomendación: Cloudflare R2** por egress $0 (las fotos del evento se ven y descargan mucho — la UI ya trackea `photo_download`). DigitalOcean Spaces es el plan B.

🔶 **[DECISIÓN ABIERTA]** R2 vs Spaces según la cuenta que abra Alan/Gastón, y el dominio del CDN público de imágenes (`media.ccm.com.ar`).

### 4.1 Patrón de subida: URL pre-firmada (presigned PUT)

El browser sube **directo al bucket**; el API solo firma. Así ningún MB pesado pasa por el dyno de Railway.

```
Admin sube foto ──► POST /api/v1/uploads/sign  { kind: 'gallery', contentType, ext }
                         │  (el API valida rol + tipo, genera key, firma)
                         ▼
              { uploadUrl: presigned-PUT, key: 'galleries/2026/<uuid>.webp' }
                         │
Admin ──PUT bytes──► R2 (directo, no pasa por el API)
                         │
Admin ──► POST /api/v1/galleries/:id/photos  { key, alt }   (persiste la referencia)
```

```ts
// server: firma de subida (R2 vía @aws-sdk/client-s3 + s3-request-presigner)
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,           // 'auto' en R2
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
})

const uploadUrl = await getSignedUrl(
  s3,
  new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,                               // 'galleries/2026/<uuid>.webp'
    ContentType: contentType,
  }),
  { expiresIn: 300 },                        // 5 min
)
```

Convenciones:
- **Keys por dominio**: `galleries/<año>/<uuid>.webp`, `portfolios/<catalogId>/<uuid>.webp`, `sponsors/<sponsorId>/logo.webp`.
- **Servir lectura por dominio público/CDN**, no por URL firmada: `S3_PUBLIC_BASE_URL` + key. R2 expone bucket público vía dominio custom (`media.ccm.com.ar`) detrás de Cloudflare.
- **Optimización**: el repo ya usa `sharp` en el front para imágenes. Idealmente convertir/redimensionar a `.webp` antes del PUT (cliente) o con un paso server. CCM ya cachea imágenes en el SW (`runtimeCaching` CacheFirst), así que la URL debe ser estable e inmutable por foto.
- **Límites**: validar `contentType` (solo image/*) y tamaño en el cliente antes de firmar; el SW del front cachea hasta 4 MB por asset.

---

## 5. Dominios y CORS (GH Pages → API)

Hoy el front vive en `https://soyalantapia.github.io/ccm-app/` (base path `/ccm-app/`, deploy a la rama `gh-pages`). **Eso no cambia con el backend**: el front sigue estático en GH Pages; solo se le hornea `VITE_API_URL`.

### 5.1 El API necesita dominio

Railway da un dominio `*.up.railway.app` gratis y funcional. Para producción conviene un dominio propio del API.

🔶 **[DECISIÓN ABIERTA]** **Dominio propio.** Definir `api.ccm.com.ar` (API) y `media.ccm.com.ar` (CDN de R2), y si el front se queda en `soyalantapia.github.io/ccm-app/` o pasa a un dominio propio (`ccm.com.ar` / `app.ccm.com.ar`). Mientras no haya dominio, se usa el `*.up.railway.app` y se ajusta `VITE_API_URL`/`CORS_ORIGINS`. El dominio define las tres variables: `VITE_API_URL`, `CORS_ORIGINS`, `APP_BASE_URL`.

### 5.2 CORS en el API

```ts
// server: middleware CORS — origins desde env, no '*'
const allowed = process.env.CORS_ORIGINS!.split(',').map(s => s.trim())
app.use(cors({
  origin: (origin, cb) => {
    // sin origin = same-origin / curl / app nativa → permitir
    if (!origin || allowed.includes(origin)) return cb(null, true)
    return cb(new Error(`Origin no permitido: ${origin}`))
  },
  credentials: false,            // auth por header Authorization (Bearer), no cookies
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}))
```

Puntos clave para CCM:
- El **origin** de GH Pages es `https://soyalantapia.github.io` (host, sin path). Va literal en `CORS_ORIGINS`.
- **No usar `origin: '*'`**: hay un panel de organizador y endpoints de pago; lista blanca explícita.
- Auth por **header `Authorization`** (Bearer OTP/JWT) + `X-Device-Id` para la identidad sin contraseña → `credentials: false` (no cookies), evita el lío de CORS con cookies cross-site.
- El **webhook de MP** (`/api/v1/webhooks/mp`) es server-to-server, **no pasa por CORS** (no hay browser). Se protege por **firma**, no por origin.

---

## 6. Backups de Postgres

Postgres tiene la verdad de negocio: socios pagos, órdenes confirmadas, inscripciones, postulaciones. Perder eso = perder plata y credibilidad.

- **Backups gestionados de Railway**: el plugin Postgres ofrece snapshots. Verificar la **frecuencia y retención del plan** contratado y, si hace falta, programar uno más agresivo cerca del evento.
- **Backup lógico propio (cinturón + tirantes)**: un cron diario que hace `pg_dump` y lo sube a **R2** (mismo bucket o uno `ccm-backups`). Independiente de Railway = recuperable aunque el proyecto Railway se rompa.

```bash
# cron diario: dump comprimido + subida a R2 (retención por lifecycle del bucket)
pg_dump "$DATABASE_URL" --no-owner --format=custom \
  | gzip \
  | aws s3 cp - "s3://ccm-backups/$(date +%F).dump.gz" \
      --endpoint-url "$S3_ENDPOINT"
```

- **La semana del evento**: subir frecuencia (cada 6 h) y hacer **una prueba de restore** en una DB scratch. Un backup nunca probado no es un backup.
- **Imágenes en R2** no necesitan backup tradicional (R2 es durable); opcionalmente activar **versioning** del bucket.

🔶 **[DECISIÓN ABIERTA]** Retención exacta de backups y si se contrata el tier de Postgres con PITR (point-in-time recovery) para el período del evento.

---

## 7. Logging y monitoreo básico

Escala de CCM = no hace falta un stack de observabilidad pesado. Lo mínimo serio:

- **Logs estructurados** con `pino` (JSON, niveles), enviados a stdout → Railway los captura y muestra/retiene. `LOG_LEVEL=info` en prod, `debug` para depurar.
  ```ts
  import pino from 'pino'
  export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })
  // loguear con cuidado de PII: nunca DNI/email/teléfono en claro (ver doc privacidad)
  ```
- **`/health`** que el healthcheck de Railway pinga (devuelve `{ ok, db }` haciendo un `SELECT 1`). Es el `healthcheckPath` del `railway.json`.
- **Uptime externo**: monitor HTTP gratis (Better Stack / UptimeRobot) golpeando `/health` cada 1–5 min, con alerta a WhatsApp/email de Alan. Imprescindible **la semana del evento**.
- **Errores**: empezar con los logs de Railway; si crece, **Sentry** (free tier) para capturar excepciones no manejadas con stack y contexto de request. Recomendado para los flujos de pago (un webhook MP que falla en silencio = orden que nunca se confirma).
- **Trazabilidad de pagos sin un APM**: el propio modelo de datos es la auditoría — el estado del recurso (`TicketOrder.status`, `Membership.status`, `AdCampaign.status`) + la tabla polimórfica `Payment` (`mpPaymentId`, `status`, `raw`) + el bus de `AnalyticsEvent` (`ticket_order_created`, `ticket_order_redirected_mp`, `ticket_order_confirmed`, `membership_purchased`, `ad_impression`, `ad_click`) dan la película de cada cobro desde el dashboard. El logging refuerza, no reemplaza.

🔶 **[DECISIÓN ABIERTA]** Si se contrata Sentry/Better Stack o se vive solo con los logs de Railway (decisión de presupuesto; para un evento puntual, el uptime monitor + Sentry free alcanza).

---

## 8. CI/CD

Dos pipelines en `.github/workflows/`, disparados por el mismo `push` pero con responsabilidades separadas.

### 8.1 Front → GitHub Pages (ya existe, casi sin cambios)

Hoy el deploy es manual (`npm run deploy` → `gh-pages -d dist`). Se mantiene, opcionalmente automatizado:

```yaml
# .github/workflows/deploy-front.yml
name: Deploy front (GH Pages)
on:
  push:
    branches: [main]
    paths: ['src/**', 'public/**', 'index.html', 'vite.config.ts', 'package.json']
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
        env:
          VITE_API_URL: ${{ vars.VITE_API_URL }}   # 🔶 vacío = demo; seteado = backend real
      - run: npm run deploy   # gh-pages -d dist
        env:
          GIT_USER: github-actions
```

Clave: `VITE_API_URL` entra como **GitHub Actions Variable** (no secret — no es sensible, es una URL pública). Mientras esté vacía, el deploy a GH Pages sigue siendo la demo de hoy; cuando el backend esté listo, se setea la variable y el próximo deploy conecta al API. **Cero cambios de código en pantallas.**

### 8.2 Backend → Railway

Railway tiene **auto-deploy** integrado: conectás el repo, apuntás Root Directory a `server/`, y cada push a `main` que toque `server/**` dispara build + `preDeployCommand` (migraciones) + deploy. No hace falta workflow propio para deployar.

Lo que sí va en GitHub Actions para el backend es el **gate de calidad** (que corre antes de que Railway despliegue algo roto):

```yaml
# .github/workflows/ci-backend.yml
name: CI backend
on:
  pull_request:
    paths: ['server/**']
  push:
    branches: [main]
    paths: ['server/**']
jobs:
  check:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: server } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: server/package-lock.json }
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc -b --noEmit      # typecheck
      - run: npm run lint
      - run: npm test                  # cuando haya tests (webhook MP, validación QR)
```

Convenciones de despliegue (de las MEMORY de Alan): **branch primero, no pushear directo a main** salvo acuerdo del repo; los commits cierran con la firma `Co-Authored-By`. El front se despliega cuando el cliente lo pide, no en cada cambio.

### 8.3 Orden de un release coordinado (front + back)

Cuando un cambio toca ambos lados (p. ej. un endpoint nuevo que la UI consume):

1. **Backend primero**: merge a `main` → Railway despliega API + migración. El API nuevo es retrocompatible con el front viejo (no romper contratos en uso).
2. **Verificar** `/health` y el endpoint nuevo (curl / dashboard).
3. **Front después**: build con `VITE_API_URL` apuntando al API ya desplegado → `gh-pages`.

Nunca al revés: si el front sale primero llamando a un endpoint que el API todavía no tiene, se rompe en producción.

---

## 9. Estrategia de testing del backend

No se busca cobertura total: se testea **lo que duele si falla en la puerta o en un cobro**. Tres zonas son obligatorias; el resto es typecheck + lint del CI (§8.2).

- **Framework**: **Vitest** (mismo runner que ya usa el front del repo, cero herramienta nueva) + **Supertest** para golpear el Express in-process sin levantar un puerto. Los esquemas zod del server derivan de los tipos de dominio de `src/data/types.ts`; un **test de paridad** verifica que zod y los tipos TS no diverjan (canon de tipos compartidos).
- **DB de test**: Postgres real, no SQLite (Prisma + features de Postgres no son intercambiables). En CI, un **service container** de Postgres; en local, un Postgres descartable (Docker o Railway scratch). Antes de cada suite: `prisma migrate deploy` sobre la DB de test + truncate entre tests. Esto además **valida las migraciones** en cada PR.
- **Webhook MP (`POST /api/v1/webhooks/mp`) — el test crítico**:
  - **Firma**: un payload con `x-signature` válido se procesa; uno con firma inválida o ausente se rechaza con 401/403 y **no toca la DB**.
  - **Idempotencia**: el mismo evento `approved` entregado dos veces (MP reintenta) confirma el recurso **una sola vez** — emite un solo `Ticket`/`Payment`, no duplica. Se apoya en el `mpPaymentId` único de `Payment` y en la máquina de estados del recurso (`TicketOrder.status`, `Membership.status`, `AdCampaign.status`): un recurso ya `approved`/`activa` ignora el reintento.
  - **Transición de estado**: `approved` sobre un `TicketOrder` pendiente lo confirma y emite `Ticket` + `accreditationToken` (canon de emisión del QR); `rejected` lo deja rechazado sin emitir nada.
- **Concurrencia del cupo (y del slot publicitario)**: test que dispara **N inscripciones en paralelo** sobre un bloque con cupo M (N>M) y verifica que entran **exactamente M** y el resto recibe 409 — el mismo patrón transaccional (constraint único + transacción / contador atómico) cubre el cupo de bloque y la regla de "una campaña `activa` por slot a la vez". Sin DB real este test no tiene sentido (de ahí Postgres en CI).
- **Emisión del QR / acreditación**: el `accreditationToken` se firma con `ACCREDITATION_TOKEN_SECRET` y se valida; el check-in en puerta (`POST /api/v1/admin/checkin`) marca `Ticket.checkedIn` y un segundo escaneo de la misma jornada se rechaza (un solo uso por jornada). El detalle de puerta vive en doc 13; acá solo se asegura que el flujo tiene test.

El `npm test` del CI (§8.2) corre esta suite; mientras no exista, el gate es typecheck + lint.

---

## 10. Instancias y escala (1 instancia en v1)

**v1 corre 1 sola instancia** del servicio `ccm-api` en Railway. Esto es una decisión deliberada, no una limitación a documentar como deuda: para la escala de CCM (un evento puntual, tráfico bajo el resto del año) una instancia con always-on alcanza, y simplifica dos cosas que de otro modo necesitarían infraestructura compartida:

- **Rate-limit en memoria**: el contador de requests por IP/Device vive en un `Map` en el proceso. Con una instancia es exacto.
- **SSE / tiempo real en memoria**: el dashboard de organizador recibe actualizaciones vía un `EventEmitter` en proceso (SSE). Con una instancia, todos los clientes cuelgan del mismo emitter y no se pierde ningún evento.

**Disparador para mover a Redis: ≥2 instancias.** El día que se escale horizontalmente (más de una réplica de `ccm-api`, sea por carga o por alta disponibilidad), ambos mecanismos se rompen — cada instancia tendría su propio `Map` y su propio `EventEmitter`, así que el rate-limit sería laxo y un cliente SSE colgado de la instancia A no vería los eventos emitidos por la instancia B. En ese momento, y solo en ese momento, se migra a **Redis**: rate-limit con `INCR`/`EXPIRE` compartido y pub/sub para fanout de SSE entre instancias. Hasta entonces, Redis es complejidad innecesaria.

🔶 **[DECISIÓN ABIERTA]** Si el pico del evento (acreditación + compras simultáneas en puerta) justifica una segunda instancia ese día. Si la respuesta es sí, hay que tener Redis listo **antes** del evento, no improvisarlo; la recomendación por defecto es 1 instancia con always-on bien dimensionada.

---

## 11. Checklist pre-evento (semana del 14/09/2026)

- [ ] `ccm-api` en **always-on** (sin sleep) y plan dimensionado 🔶.
- [ ] `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` son de la **cuenta de cobro real** de CCM 🔶, no de sandbox. Webhook de MP apuntando a `https://api.ccm.com.ar/api/v1/webhooks/mp`.
- [ ] `CORS_ORIGINS` incluye el origin final del front (GH Pages y/o dominio propio 🔶).
- [ ] Backups de Postgres cada 6 h + **restore probado** en DB scratch.
- [ ] Uptime monitor sobre `/health` con alerta a Alan.
- [ ] Seed real cargado (eventos 14ª edición, planes de entrada con precios reales 🔶, sponsors reales 🔶); datos demo borrados.
- [ ] Plan de contingencia ensayado: re-deploy del front **sin** `VITE_API_URL` vuelve a la demo offline si el API cae.
- [ ] QR de acreditación validado end-to-end contra el API de puerta (no contra mock).
- [ ] **Freeze de migraciones** activo (ningún cambio de esquema salvo hotfix aditivo probado en copia de prod).
- [ ] `ccm-api` corriendo **1 instancia** con always-on; si se decide escalar el día del evento 🔶, Redis listo de antemano (rate-limit + fanout SSE).
- [ ] Suite de tests verde (webhook MP firma+idempotencia, concurrencia de cupo, acreditación).

---

## 12. Resumen

Dos pipelines desacoplados: el **front sigue estático en GitHub Pages** (único cambio: hornear `VITE_API_URL` con el dominio del API **sin** prefijo — el cliente arma la base `+ '/api/v1'`) y el **backend vive en Railway** (servicio Node + Postgres + cron, **1 instancia** con always-on), con migraciones aplicadas vía `prisma migrate deploy` en el release (estrategia expand/contract + freeze la semana del evento para reversión segura) y auto-deploy por push a `server/`. Todo el API cuelga de `/api/v1`, incluido el webhook de MP (`/api/v1/webhooks/mp`) y el check-in de puerta (`/api/v1/admin/checkin`). Auth con **tres secretos JWT separados** (device/admin/acreditación). Las imágenes subidas van a **R2** con URLs pre-firmadas (la DB solo guarda la clave). CORS es lista blanca explícita del origin de GH Pages; el webhook de MP queda fuera de CORS y se protege por firma. Backups de Postgres con doble red (Railway + `pg_dump` a R2), logging con `pino` + `/health` + uptime monitor externo. Testing con Vitest sobre Postgres real, foco en webhook MP (firma + idempotencia), concurrencia de cupo y acreditación. El rate-limit en memoria y el SSE por `EventEmitter` son correctos con 1 instancia; el disparador para Redis es ≥2 instancias. Casi todo es el patrón que Alan ya corre en Norte/My Alquiler/misanpedro; lo nuevo y acotado es R2 y el coordinar dos deploys. Las decisiones abiertas son de negocio (dominio, presupuesto, cuenta de MP, precios/sponsors reales), no técnicas.
