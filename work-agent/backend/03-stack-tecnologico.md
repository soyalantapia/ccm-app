# Stack tecnológico y decisiones

Justificación del stack del backend de CCM (Córdoba Corazón de Moda) para llevar la app de demo 100% frontend a una versión real con datos compartidos, acreditación por QR y pagos reales antes del evento (19–20/09/2026). Cada elección viene con la alternativa que se evaluó y el trade-off, anclada en que Alan ya corre exactamente este stack en producción en otros proyectos (menor riesgo de ejecución).

## TL;DR del stack

| Capa | Elección | En vez de | Por qué (resumen) |
|---|---|---|---|
| Runtime + lenguaje | Node.js + TypeScript | Bun, Deno, Go | TS de punta a punta = tipos compartidos con el front; Alan ya lo domina |
| Framework HTTP | Express | Fastify, NestJS, Hono | Madurez + el dev ya lo conoce; el throughput no es el cuello de botella de CCM |
| Base de datos | PostgreSQL | MongoDB, SQLite, MySQL | El dominio es relacional (orders→plans, registrations→blocks); ACID para pagos |
| ORM | Prisma | Drizzle, Kysely, TypeORM | Esquema declarativo + migraciones + tipos; mismo patrón que Norte |
| Hosting | Railway | Render, Fly.io, VPS | Postgres + servicio + cron en un solo lugar; Alan ya tiene 5+ proyectos ahí |
| Pagos | Mercado Pago | Stripe, MODO | Es Argentina; los QR del mock ya son de MP |
| Auth | Passwordless (OTP por email) | Password + JWT, Auth0, Clerk | Coherente con la identidad sin contraseña por `deviceId` que ya usa la app |
| Storage de imágenes | Object storage S3-compatible (R2 / Spaces) | Postgres BLOB, base64, FS local | Las galerías de fotos y portfolios no van en la DB |
| Tiempo real (dashboard) | Polling con TanStack Query | SSE, WebSocket | Simple, sin estado de conexión; SSE queda como mejora posterior |

🔶 **[DECISIÓN ABIERTA]** Si el frontend se queda en GitHub Pages o se mueve a Railway/Vercel. Este doc asume que **se queda en GH Pages** y se conecta al API por `VITE_API_URL` con CORS (es la decisión fijada). Si cambia, solo cambia el deploy del front, no el stack del backend.

---

## La costura que define todo: `DataStore`

Antes de justificar nada, hay que entender por qué el backend casi no toca la UI. Hoy toda la app consume datos por una única interfaz `DataStore` (patrón repositorio, `src/data/store/DataStore.ts`). El singleton vive en `src/data/store/index.ts`:

```ts
// src/data/store/index.ts (ESTADO ACTUAL)
export const store: DataStore = new LocalDataStore()
```

La reactividad ya está resuelta con `useSyncExternalStore` + un set de subscribers que se bumpean en cada escritura (mismo archivo). La migración a backend **no reescribe pantallas**: implementa un `RemoteDataStore` contra la **misma interfaz** y conmuta el singleton por env, con fallback al `LocalDataStore`:

```ts
// src/data/store/index.ts (DESPUÉS — patrón fallback)
import { LocalDataStore } from './LocalDataStore'
import { RemoteDataStore } from './RemoteDataStore'

const API = import.meta.env.VITE_API_URL  // hoy NO existe; se agrega en .env del front
export const store: DataStore = API
  ? new RemoteDataStore(API)
  : new LocalDataStore()   // demo offline / GH Pages sin API sigue funcionando
```

**Consecuencia para la elección de stack:** el contrato del backend ya está escrito en TypeScript. El stack ideal es el que reusa esos mismos tipos sin traducción. Eso empuja fuerte hacia **TypeScript end-to-end**.

**Monorepo, un solo repo:** el backend vive en `server/` dentro del **mismo repo** que el front. Importa los tipos de dominio desde `src/data/types.ts` (vía path alias en el `tsconfig` del server, o import relativo a la raíz), así no se duplican ni se desincronizan. Los esquemas Zod del server **derivan** de esos tipos, con un test de paridad que falla si el tipo y el esquema se separan.

---

## 1. Runtime + lenguaje: Node.js + TypeScript

**Por qué.** Las entidades del dominio (`EventItem`, `TicketOrder`, `Sponsor`, `Application`, etc.) ya viven en `src/data/types.ts` como tipos TS. Con Node+TS en el backend, esos tipos se comparten (o se generan desde el esquema Prisma) en vez de redefinirse en otro lenguaje y desincronizarse. La interfaz `DataStore` pasa a ser, casi literalmente, el contrato del cliente HTTP.

**Alternativa considerada.**
- **Bun** — más rápido y con runtime/test/bundler integrados. Trade-off: madurez operativa y de librerías de pago (MP) todavía menor; Railway lo soporta pero Alan no tiene un proyecto de pagos en Bun probado. Para un evento con fecha dura, no es el momento de estrenar runtime.
- **Go / Python** — performance y ecosistema sólidos, pero se pierde el tipo compartido con el front y Alan no los corre en producción hoy. Más riesgo, cero upside para la escala de CCM.

**Trade-off asumido.** Node single-thread y un poco más de memoria que Go. Irrelevante: CCM no es un sistema de alto QPS; el pico real es la acreditación en puerta (cientos de scans concentrados), perfectamente manejable con un dyno chico + índices correctos.

**Anclaje (menor riesgo).** Norte, romi-alan y My Alquiler son todos Node + TS en producción. Es el lenguaje en el que Alan ya depura, despliega y monitorea.

---

## 2. Framework HTTP: Express

**Por qué.** El API de CCM es un CRUD REST con un puñado de flujos especiales (crear orden + redirigir a MP, webhook de MP, validar QR en puerta, OTP). Express cubre eso de sobra, con el ecosistema de middlewares más maduro que existe (CORS, rate-limit, validación, logging) y es lo que Alan ya tiene cableado en romi-alan y My Alquiler con JWT.

**Alternativas consideradas.**
- **Fastify** — ~2–3x throughput, validación de esquema con JSON Schema integrada, mejor tipado nativo. Trade-off: el throughput no es el problema de CCM, y cambiar de framework es fricción sin retorno para un proyecto con deadline. Si se quisiera validación fuerte, se logra con **Zod** sobre Express sin migrar.
- **NestJS** — estructura, DI, decoradores; bueno para equipos grandes. Trade-off: sobre-ingeniería para un backend de un solo dev y ~12 grupos de endpoints; la curva no se paga en CCM.
- **Hono** — modernísimo y portable a edge. Trade-off: menos batería incluida, menos kilometraje del dev; mejor candidato a futuro que apuesta para esta entrega.

**Trade-off asumido.** Express no trae validación ni tipado de request por defecto. Se cubre con **Zod** en cada handler (valida body/params y, de paso, da tipos). Es el patrón a estandarizar desde el día uno.

```ts
// Patrón de handler con validación (Express + Zod) — el router se monta en /api/v1
const CreateOrder = z.object({ planId: z.string(), qty: z.number().int().min(1).max(10).default(1) })

router.post('/orders', requireDevice, async (req, res) => {   // → POST /api/v1/orders
  const { planId, qty } = CreateOrder.parse(req.body)   // 400 si no valida
  const order = await orders.create({ deviceId: req.deviceId, planId, qty })
  res.status(201).json(order)
})
```

---

## 3. Base de datos: PostgreSQL

**Por qué.** El dominio de CCM es inherentemente **relacional** y con invariantes que importan:
- `TicketOrder.planId → TicketPlan`, `Registration.blockId → EventBlock`, `Application.convocatoriaId → Convocatoria`, `Gallery.sponsorId → Sponsor`. Son foreign keys reales.
- **Cupos** (`EventBlock.capacity` vs registraciones confirmadas) y **pagos** necesitan consistencia. Reservar un asiento o confirmar una orden no puede quedar a medias; Postgres da transacciones ACID y constraints (`UNIQUE`, `CHECK`) para que la DB sea la última línea de defensa contra doble inscripción o doble cobro.
- El **dashboard de analytics** ya consume agregaciones (conteos por evento, embudo de órdenes, impresiones/clicks de ads). SQL con `GROUP BY` e índices es la herramienta natural; el `AnalyticsEvent` bus encaja como tabla append-only.

**Alternativas consideradas.**
- **MongoDB** — Alan lo usa en el lado Deenex/Palta. Trade-off: las relaciones y los cupos pedirían transacciones multi-documento y validación a mano; se pierde el chequeo que Postgres da gratis. Para datos de pago, sumar fricción.
- **SQLite** — cero infra, perfecto para un solo proceso. Trade-off: el dashboard del organizador y el API de puerta son dos clientes concurrentes en Railway; SQLite single-writer es frágil ahí. Sirve para tests, no para prod.
- **MySQL/PlanetScale** — válido, pero Postgres es lo que Alan corre en Norte/romi-alan/My Alquiler y lo que Railway provisiona en un clic con backups.

**Trade-off asumido.** Hay que correr migraciones y pensar el esquema por adelantado (no es schemaless). Es justamente lo que se quiere para datos de pago y acreditación: el rigor es una feature.

---

## 4. ORM: Prisma

**Por qué.** Prisma da las tres cosas que CCM necesita en una: **esquema declarativo** (un solo `schema.prisma` como fuente de verdad), **migraciones versionadas** (`prisma migrate`) y **cliente totalmente tipado** que se alinea con los tipos del front. Es exactamente el patrón de Norte (Prisma + Postgres + Railway), así que la curva de aprendizaje ya está pagada y los scripts de deploy (`migrate deploy` en el build de Railway) son los mismos.

**Alternativas consideradas.**
- **Drizzle** — más liviano, SQL-first, sin engine binario, migraciones más transparentes. Trade-off real y honesto: en frío, Drizzle suele rendir mejor y es más "cerca del SQL". Pero Alan tiene kilometraje en Prisma (Norte), y para un deadline lo que importa es ejecución sin sorpresas, no 50ms menos de cold start. Drizzle es la apuesta válida si se priorizara performance/peso.
- **Kysely** — query builder tipado, control total del SQL, cero magia. Trade-off: no trae migraciones ni modelado; hay que armar más a mano.
- **TypeORM / Sequelize** — más viejos, decoradores o API menos ergonómica; sin ventaja sobre Prisma hoy.

**Trade-off asumido.** El engine de Prisma agrega peso al bundle y algo de cold start. Para un servicio always-on (o con poco sleep) en Railway no es un problema; si lo fuera, Drizzle es el plan B documentado.

```prisma
// schema.prisma — extracto que refleja el dominio actual
model TicketPlan {
  id            String        @id            // "sab-general" | "combo-vip" | ...
  name          String
  price         Int?                          // centavos; null = "a confirmar"
  serviceCharge Int           @default(0)
  mpLink        String?
  day           Day                            // sabado | domingo | combo
  kind          PlanKind                       // general | vip
  orders        TicketOrder[]
}

model TicketOrder {
  id         String      @id @default(cuid())
  plan       TicketPlan  @relation(fields: [planId], references: [id])
  planId     String
  deviceId   String                            // FK → Device.id (identidad sin contraseña)
  status     OrderStatus @default(iniciada)    // su PROPIA máquina de estados: iniciada | redirigida_mp | confirmada | cancelada
  qty        Int         @default(1)
  total      Int
  buyerName  String?
  buyerEmail String?
  ts         DateTime    @default(now())
  @@index([deviceId])
  @@index([status])
}
// Nota: el dinero (mpPreferenceId/mpPaymentId, idempotencia del webhook) NO vive acá:
// va en la tabla polimórfica Payment { kind, resourceId, … } (ver doc 04 + doc 07).
// El webhook MP solo MUEVE TicketOrder.status a 'confirmada' y emite Ticket + QR.
```

> El esquema canónico completo vive en **doc 04 (modelo-de-datos)**; este extracto es solo ilustrativo del dominio relacional.

---

## 5. Hosting: Railway

**Por qué.** Railway provisiona en un mismo proyecto el **servicio Node**, la **base Postgres** y los **cron jobs** (p. ej. pasar campañas de publicidad a `expirada` cuando `now > expiresAt`, o cerrar órdenes `iniciada` abandonadas), con variables de entorno, logs y backups integrados. Es donde Alan ya tiene Norte, romi-alan, My Alquiler, UPM y misanpedro: el flujo de `railway up`, los secretos y el `migrate deploy` automático ya son rutina.

**Alternativas consideradas.**
- **Render** — muy comparable; buen Postgres gestionado. Trade-off: ninguna ventaja decisiva, y el dev tiene más horas de vuelo en Railway → menos sorpresas operativas.
- **Fly.io** — excelente para multi-región y baja latencia. Trade-off: más config (volúmenes, Postgres self-managed históricamente más manual). CCM es un evento de Córdoba; no necesita multi-región.
- **VPS (Hetzner/DO droplet)** — más barato a escala y control total. Trade-off: hay que administrar SO, TLS, backups, deploy. Tiempo del único dev mal gastado para este alcance.

**Trade-off asumido.** Costo algo mayor que un VPS pelado y cierto lock-in suave de plataforma. Aceptable: el código es Node+Postgres estándar, portable a cualquier lado si hiciera falta.

🔶 **[DECISIÓN ABIERTA]** Presupuesto y plan de Railway (¿servicio always-on para evitar cold start el día del evento? ¿qué tier de Postgres?). Hay que dimensionar antes de septiembre.

🔶 **[DECISIÓN ABIERTA]** Dominio del API (p. ej. `api.ccm.com.ar`) y dominio público de la app. Definen `VITE_API_URL` y la lista de `CORS_ORIGINS`.

---

## 6. Pagos: Mercado Pago

**Por qué.** Es Argentina y el público compra con MP. Los QR del mock actual ya son de Mercado Pago, así que el modelo mental del organizador no cambia. MP cubre los **tres flujos de pago reales** que el dominio ya define:
1. **Entradas** — `createOrder(planId, qty)` → Preference de MP → redirección/QR → webhook confirma.
2. **Membresía Socio CCM** — `becomeSocio(paid)` → mismo patrón de Preference.
3. **Publicidad autogestionada** — `createCampaign(...)` → cobro antes de pasar la campaña de `pendiente_pago` a `activa` (vigencia por `startsAt`/`expiresAt`, ver doc 04/08).

El patrón es el mismo en los tres: crear **Preference**, persistir la orden en estado `iniciada`/`redirigida_mp`, y dejar que el **webhook** (server-to-server) sea la única fuente de verdad que marca `confirmada`. **Nunca** confiar en el redirect del browser para confirmar el pago.

**Alternativas consideradas.**
- **Stripe** — mejor DX y docs. Trade-off: cobertura/medios locales argentinos peores que MP y fricción para el comprador local. Descartado para este mercado.
- **MODO / otras pasarelas locales** — válidas, pero MP es lo que ya está en el mock y lo más extendido.

**Trade-off asumido.** SDK y docs de MP menos pulidos que Stripe; los webhooks piden **verificación de firma** e **idempotencia** (el `mpPaymentId @unique` de arriba evita doble confirmación si MP reintenta). Se asume como costo conocido.

🔶 **[DECISIÓN ABIERTA]** Cuenta de cobro de Mercado Pago (¿a nombre de quién?, ¿credenciales de producción?), y los **precios reales** de entradas y de la membresía Socio CCM. Hoy varios `price` son `null` ("a confirmar"). Sin esto, los flujos quedan en sandbox.

```
Flujo de compra (entradas / membresía / publicidad)
  UI (RemoteDataStore.createOrder)
    → POST /api/v1/orders                  [order: iniciada]
    → API crea MP Preference, devuelve init_point
    → UI redirige a Mercado Pago
    → POST /api/v1/orders/:id/redirected   [order: redirigida_mp]
       … el comprador paga en MP …
    → MP llama POST /api/v1/webhooks/mp     (server-to-server, firmado)
    → API verifica firma + idempotencia    [order: confirmada]  ← única fuente de verdad
    → (entradas) emite Ticket + accreditationToken (JWT del QR, ver doc 13)
```

---

## 7. Auth: passwordless

**Por qué.** La app ya tiene identidad **sin contraseña**, basada en una entidad raíz `Device` (PK `id`, con `publicId`) y captura progresiva de datos en `ProfileField` (ver doc 04). El tipo `DeviceProfile` del front se serializa desde `Device` + sus `ProfileField`; no es una tabla. Meter usuario+contraseña rompería ese modelo y agregaría fricción justo donde el valor es que la gente entre y se inscriba sin barreras. El esquema coherente es **passwordless**: el `Device.id` identifica el dispositivo; para acciones que requieren verificar a la persona (compra con email, recuperar datos en otro dispositivo) se usa **OTP por email** (código de un solo uso). Encaja con el mundo de Alan, que ya hace login tipo PIN (Norte) y tap-sin-clave (romi-alan).

Dos planos de identidad, separados:
- **Asistente / comprador** — `deviceId` (header `X-Device-Id`) + OTP por email cuando hace falta atar un email verificado a una compra. Sin password.
- **Organizador (admin)** — hoy el gate del admin acepta **cualquier clave** (demo). En real necesita **auth de organizador con rol** (enum `AdminRole { OWNER, EDITOR, STAFF, VIEWER }`, ver doc 06), también passwordless por OTP a una allow-list de emails, emitiendo un JWT de sesión (firmado con `ADMIN_TOKEN_SECRET`) que lleva el rol. La validación de QR en puerta la hace personal con rol **STAFF** autenticado.

**Alternativas consideradas.**
- **Password + JWT clásico** — lo que Alan tiene en romi-alan/My Alquiler. Trade-off: contradice la identidad sin contraseña de la app y suma manejo de hashes, reset, etc. Solo valdría si el cliente exigiera login tradicional.
- **Auth0 / Clerk / Supabase Auth** — listo para usar. Trade-off: dependencia externa y costo para un modelo de auth muy chico (un puñado de admins + OTP de compradores). El esfuerzo de hacerlo a mano con OTP es bajo y evita lock-in.

**Trade-off asumido.** Hay que implementar emisión/verificación de OTP y rate-limit (anti brute-force del código). Es código acotado y bajo riesgo.

El proveedor de email transaccional para OTP ya está decidido: **Resend** (`RESEND_API_KEY`). El primer admin OWNER se siembra por env con `ADMIN_BOOTSTRAP_EMAIL`.

🔶 **[DECISIÓN ABIERTA]** Quiénes son los organizadores (emails de la allow-list de admin, más allá del bootstrap). Sin esto no hay quién entre al panel.

---

## 8. Storage de imágenes: object storage S3-compatible

**Por qué.** Las **galerías de fotos** del evento (`Gallery.photos[]`) y los **portfolios/logos** de expositores y sponsors (`CatalogProfile.portfolio[]`, `Sponsor`) son binarios que **no van en Postgres**. Se sirven desde **object storage S3-compatible** (Cloudflare R2 o DigitalOcean Spaces), y la DB guarda solo la **URL/clave**. La subida se hace con **URLs pre-firmadas** (el browser sube directo al bucket, el API solo firma), así no pasa MB por el dyno.

**Alternativas consideradas.**
- **Guardar en Postgres (BLOB) o base64** — simple al inicio. Trade-off: infla la DB, encarece backups y mata el cache de CDN. No escala para una galería de evento.
- **Filesystem del dyno** — efímero en Railway; se pierde en cada deploy. No sirve.

**R2 vs Spaces (la elección concreta):**
- **Cloudflare R2** — **sin egress fees** y CDN de Cloudflare integrada. Para galerías de fotos que se ven/descargan mucho (la UI ya trackea `photo_download`), el ahorro de egress es el factor decisivo.
- **DigitalOcean Spaces** — más simple si ya se vive en DO; pricing de transferencia predecible. Trade-off: cobra egress sobre el incluido; menos conveniente para descargas intensivas.

**Recomendación: R2** por el modelo sin egress, salvo que aparezca una razón de cuenta/operación para Spaces.

🔶 **[DECISIÓN ABIERTA]** R2 vs Spaces según la cuenta que abra Alan/Gastón y el dominio del CDN para las imágenes.

---

## 9. Tiempo real del dashboard: polling primero

**Por qué.** El dashboard del organizador necesita verse "vivo" (órdenes confirmadas, inscripciones, impresiones/clicks). Lo más barato y robusto es que el front **haga polling con TanStack Query** (`refetchInterval`), que ya es el patrón que Alan usa en Norte. Sin estado de conexión, sin manejo de reconexión, sin infra extra. La precisión de "casi en vivo" (cada 5–15 s) sobra para un panel de evento.

**Alternativas consideradas.**
- **SSE (Server-Sent Events)** — push unidireccional server→cliente, sobre HTTP, simple. Trade-off: mantiene conexiones abiertas y suma complejidad; reservado como **mejora posterior** si el organizador pide live real durante la acreditación en puerta.
- **WebSocket** — bidireccional, lo que Alan tiene en romi-alan. Trade-off: overkill para un dashboard que solo lee; CCM no necesita que el server empuje a muchos clientes en tiempo real. Queda como última opción si SSE no alcanzara.

**Trade-off asumido.** Latencia de hasta el intervalo de polling y algunas requests "vacías". Despreciable a la escala de un panel de organizador.

```ts
// Front: dashboard con polling (patrón Norte)
useQuery({
  queryKey: ['analytics'],
  queryFn: () => store.getAnalytics(),   // RemoteDataStore → GET /api/v1/analytics (resumen)
  refetchInterval: 10_000,               // cada 10s; subir a SSE solo si hace falta
})
```

---

## Diagrama de arquitectura

```
                         ┌──────────────────────────────────────────────┐
                         │  USUARIOS                                      │
                         │  Asistente (PWA) · Expositor · Organizador     │
                         │  Staff en puerta (scan de QR)                  │
                         └───────────────┬────────────────────────────────┘
                                         │ HTTPS
                                         ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  FRONTEND — GitHub Pages (estático)                              │
        │  Vite 8 + React 19 + TS + Tailwind v4 + vite-plugin-pwa          │
        │  base '/ccm-app/'                                                │
        │                                                                  │
        │   UI ──► store: DataStore  (única puerta de datos)               │
        │            ├─ LocalDataStore   (sin VITE_API_URL → demo/offline) │
        │            └─ RemoteDataStore  (con VITE_API_URL → backend real) │
        └───────────────┬──────────────────────────────────────────────────
                        │ fetch + CORS (Authorization OTP/JWT, X-Device-Id)
                        │ base = VITE_API_URL + '/api/v1'  (VITE_API_URL = solo host, 🔶 dominio abierto)
                        ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  API — Railway                                                   │
        │  Node + TypeScript + Express                                     │
        │  REST · Zod (validación) · Auth passwordless (OTP/JWT)           │
        │  Prisma Client                                                   │
        │  Cron: campañas → 'expirada', cierra órdenes 'iniciada' viejas   │
        └───┬───────────────┬───────────────────────────┬──────────────────
            │               │                           │
            │ Prisma        │ SDK MP / webhook           │ S3 API (URLs firmadas)
            ▼               ▼                           ▼
   ┌──────────────┐  ┌────────────────────┐   ┌───────────────────────────┐
   │ PostgreSQL   │  │ Mercado Pago        │   │ Object storage (R2/Spaces)│
   │ (Railway)    │  │ Preferences +       │   │ fotos de galerías,        │
   │ events,      │  │ Webhooks            │   │ portfolios, logos sponsor │
   │ orders,      │  │ entradas/membresía/ │   │ (CDN; DB guarda la URL)   │
   │ registrations│  │ publicidad          │   │                           │
   │ analytics …  │  └────────────────────┘   └───────────────────────────┘
   └──────────────┘
```

Flujo de datos clave: **el browser nunca confirma un pago**. La UI dispara la Preference vía el API, redirige a MP, y el **webhook** server-to-server es lo único que marca la orden `confirmada` y genera el QR de acreditación. Las imágenes suben directo al bucket con URL pre-firmada; la DB solo referencia la clave.

---

## Variables de entorno (contrato de deploy)

**Backend (Railway):**
```bash
DATABASE_URL=postgres://…              # provisto por Railway

# Tres secretos JWT separados (NO un único JWT_SECRET): cada uno firma un plano distinto
DEVICE_TOKEN_SECRET=…                  # token de dispositivo (asistente/comprador)
ADMIN_TOKEN_SECRET=…                   # sesión de admin (OWNER/EDITOR/STAFF/VIEWER)
ACCREDITATION_TOKEN_SECRET=…           # firma del accreditationToken del QR (ver doc 13)

OTP_PEPPER=…                           # pepper para hashear los códigos OTP
RESEND_API_KEY=…                       # 🔶 email transaccional (OTP) vía Resend
ADMIN_BOOTSTRAP_EMAIL=…                # 🔶 primer admin OWNER (bootstrap de la allow-list)

MP_ACCESS_TOKEN=…                      # 🔶 cuenta de cobro de MP (prod)
MP_WEBHOOK_SECRET=…                    # verificación de firma del webhook MP

# Object storage S3-compatible (R2 / Spaces) — 🔶 R2 o Spaces
S3_ENDPOINT=…  S3_BUCKET=…  S3_KEY=…  S3_SECRET=…
CORS_ORIGINS=https://soyalantapia.github.io        # 🔶 + dominio propio si lo hay
```

**Frontend (build de GH Pages):**
```bash
VITE_API_URL=https://api.ccm.com.ar    # 🔶 dominio del API; ausente = demo/offline
```

`VITE_API_URL` es la **única** variable nueva que necesita el front para conmutar `LocalDataStore` → `RemoteDataStore`. **Apunta solo al host, sin prefijo**: el cliente arma la base como `VITE_API_URL + '/api/v1'` (todo el API cuelga de `/api/v1`). Si está vacía, la app sigue funcionando como demo (fallback intacto), lo que también sirve de plan de contingencia el día del evento.

---

## Resumen de riesgo

El stack está elegido para **minimizar lo desconocido** de cara a una fecha que no se mueve. Node+TS+Express+Postgres+Prisma+Railway+MP es, casi punto por punto, el stack que Alan ya tiene en producción en Norte (Prisma+Postgres+Railway), romi-alan y My Alquiler (Node/Express+JWT+Postgres) — más Mercado Pago como pasarela local. La pieza con más novedad es el **object storage** (R2/Spaces) y el **OTP de admin**, ambos acotados y de bajo riesgo. Las apuestas más modernas (Bun, Drizzle, Hono, Fastify) quedan documentadas como planes B válidos para después del evento, no como experimentos a estrenar contra deadline.
