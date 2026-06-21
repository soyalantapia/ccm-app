# Identidad, autenticación y seguridad

Cómo se identifica cada asistente sin pedirle una cuenta, cómo entra el organizador al panel con rol real, y qué blindaje transversal (CORS, rate limit, validación, PII, secretos) necesita el API de Railway cuando el front de GitHub Pages le empiece a hablar. Este doc fija el contrato de seguridad sobre el que se apoyan los flujos de pago, acreditación y CRUD del admin.

> Contexto canónico del proyecto: el front es Vite + React 19 estático en GH Pages (`base '/ccm-app/'`), toda la UI pasa por la interfaz `DataStore`, y la migración es enchufar un `RemoteDataStore` contra el API Node/Express/Prisma/Postgres en Railway sin tocar pantallas. Acá diseñamos quién es quién y cómo se protege la frontera.

---

## 0. Estado actual (lo que hay que reemplazar)

Tres mecanismos hoy son demo y hay que rehacerlos en el backend:

1. **Identidad del asistente** — `src/lib/identity.ts`. Es un `deviceId` anónimo (`dev-<uuid>`) que vive en `localStorage` bajo `ccm:profile`. No hay token, no hay firma, no hay forma de probar que un request "es" ese device. Cualquiera puede mandar `deviceId: "dev-xxx"` y hacerse pasar por otro.

2. **QR de acreditación** — `identity.ts → qrToken()`. Hoy es un hash débil (multiplicar-y-sumar sobre el string del id, no criptográfico) embebido en el string `CCM26-<id>-<hash>`. Sirve para la demo, pero **es falsificable**: cualquiera que entienda la fórmula genera un QR válido para cualquier device.

3. **Auth del organizador** — `src/components/layout/AdminLayout.tsx → AdminGate`. Literalmente:
   ```ts
   // Demo: cualquier clave habilita el panel (la auth real llega en Fase 1).
   sessionStorage.setItem('ccm:admin', '1')
   ```
   La "clave" `config.adminKey = 'ccm2026'` (`src/config/index.ts`) ni se compara. El gate es 100% client-side: las páginas `/admin/*` y sus mutaciones no están protegidas por nada del lado servidor (hoy no hay servidor).

El objetivo de este doc es cerrar los tres y blindar la frontera HTTP.

---

## 1. Identidad del asistente — device-token firmado

### 1.1 Principio: el dispositivo sigue siendo la cuenta (D22), pero ahora demostrable

Mantenemos la promesa de producto: **el asistente nunca crea usuario ni pone contraseña**. La identidad sigue naciendo silenciosa en el primer arranque. Lo que cambia es que el backend emite un **device-token JWT firmado** que liga el `deviceId` a un secreto del servidor. El front guarda ese token y lo manda en cada request; el backend lo verifica y sabe a qué device pertenece sin confiar en lo que el cliente "dice".

### 1.2 Tabla `Device` + `ProfileField` (Prisma)

UNA sola entidad raíz de identidad: `Device`. La PII **no va en columnas planas** del `Device`: vive en la tabla hija `ProfileField`, una fila por campo capturado. Esto da captura progresiva, trazabilidad de origen (`source`) y aislamiento de la PII (más fácil de purgar/exportar, §6). Es el schema canónico (definido en el doc 04 modelo-de-datos); acá lo replicamos por completitud y para fijar el contrato de seguridad encima.

```prisma
model Device {
  id          String   @id @default(cuid())   // deviceId interno — TODAS las FKs apuntan acá
  publicId    String   @unique                 // el que va en URLs, opaco
  createdAt   DateTime @default(now())

  profileFields ProfileField[]
  registrations Registration[]
  orders        TicketOrder[]
  tickets       Ticket[]
  membership    Membership?
  applications  Application[]
  payments      Payment[]
  events        AnalyticsEvent[]
  // ... favorites, downloads, etc.
}

model ProfileField {
  id         String   @id @default(cuid())
  deviceId   String                            // FK → Device.id
  key        String                            // 'firstName' | 'lastName' | 'email' | 'phone' | 'dni' | ...
  value      String
  source     String                            // de dónde se capturó (oro de segmentación, PRD §7)
  capturedAt DateTime @default(now())

  device     Device   @relation(fields: [deviceId], references: [id])
  @@unique([deviceId, key])
  @@index([deviceId])
}
```

- **No existe ninguna tabla `DeviceProfile`.** El tipo TS `DeviceProfile` del front (`src/data/types.ts`) se **serializa** desde `Device` + sus `ProfileField`: `getProfile()` rehidrata el shape `{ deviceId, createdAt, fields: { firstName: {value, capturedAt, source} ... }, consents }` leyendo las filas de `ProfileField`. El contrato hacia la UI no cambia.
- **Email, teléfono y DNI son `ProfileField`** (key `email`/`phone`/`dni`), no columnas del `Device`. La unicidad de email para recuperación (§1.5) se resuelve con índice/constraint sobre `ProfileField` (`key='email'`) o tabla puente — ver doc 04. El aislamiento de PII en su propia tabla simplifica el borrado/anonimización (§6.3): se purgan las filas `ProfileField` sensibles sin tocar el `Device` ni los agregados.
- **Consentimientos:** se modelan como `ProfileField` (keys `consentTerms`/`consentNews`/`consentSponsors`, con `value` = timestamp ISO y `source` = pantalla) o tabla dedicada según doc 04; lo importante es que conservan el **timestamp** de cuándo se consintió (§6.2), no un booleano.

### 1.3 Bootstrap del device (primer arranque)

```http
POST /api/v1/devices/bootstrap
Content-Type: application/json

{}                      # cuerpo vacío; el server crea el device
---
200 OK
{
  "deviceToken": "eyJhbGc...",   # JWT firmado, larga vida
  "device": { "publicId": "d_7Hk2...", "createdAt": "2026-..." }
}
```

- El backend crea la fila `Device`, genera `publicId` opaco (no adivinable) y firma un JWT:
  ```ts
  // payload del device-token
  { sub: device.id, pub: device.publicId, typ: 'device', iat, exp }
  ```
- Firma **HS256 con `DEVICE_TOKEN_SECRET`** (o RS256 si después querés verificar sin el secreto; HS256 alcanza para un solo servicio). `exp` largo (ej. 365 días) — esto es identidad de asistente, no sesión bancaria. Se renueva transparente si está por vencer (endpoint `POST /api/v1/devices/refresh` con el token viejo aún válido).
- El front guarda `deviceToken` en `localStorage` (`ccm:deviceToken`) **además** del perfil. En cada request: `Authorization: Bearer <deviceToken>`.

> Migración limpia: hoy `ensureDevice()` ya crea el `deviceId` local y dispara `track('user_created')`. En `RemoteDataStore`, `ensureDevice()` pasa a llamar a `/bootstrap` la primera vez (si no hay `ccm:deviceToken`), guarda token + `publicId`, y sigue emitiendo `user_created`. Si el bootstrap falla (offline), se cae al `LocalDataStore` (patrón fallback ya decidido) y reintenta después.

### 1.4 Por qué token firmado y no "mandá tu deviceId"

Sin firma, todo lo ligado al device es spoofeable: ver órdenes/membresía/acreditación de otro asistente con solo conocer su `deviceId`. Con el JWT, el `deviceId` real sale del token verificado en el server (`req.device.id`), **nunca del body**. Regla dura del backend:

> Ningún endpoint de asistente acepta `deviceId` en el body o la query. El device siempre se deriva del `Authorization: Bearer`. Si no hay token válido → `401`.

### 1.5 Recuperación de identidad entre dispositivos (OTP por email, opcional)

Caso real: el asistente se inscribió en el celular, después abre la PWA en otra compu, o borró datos del navegador. Sin cuenta, perdería su acreditación, órdenes y membresía. Solución **opt-in, sin contraseña**, coherente con la identidad passwordless:

1. El asistente toca "Recuperar mi acreditación / vincular este dispositivo" e ingresa su email.
2. `POST /api/v1/devices/link/request { email }` → el backend genera un OTP de 6 dígitos (numérico), lo guarda **hasheado** (con `OTP_PEPPER`, §5) con TTL corto (ver tabla abajo) y lo manda por email.
3. El asistente ingresa el código: `POST /api/v1/devices/link/verify { email, code }`.
4. Si valida:
   - Si ya existe un `Device` con un `ProfileField` `email` igual → el backend emite un **device-token nuevo apuntando al device existente** (el dispositivo nuevo "se vuelve" ese device). Opcional: fusionar el device anónimo recién creado en el viejo (mover registrations/orders) — 🔶 [DECISIÓN ABIERTA] política de merge: ¿se descarta el device anónimo nuevo o se fusiona su actividad? Recomiendo descartar el anónimo y adoptar el verificado (más simple, sin colisiones de membresía).
   - Si no existe device con ese email → se crea/actualiza el `ProfileField` `email` del device actual (con `source='device_link'`) y se marca como verificado.

```prisma
model OtpChallenge {
  id        String   @id @default(cuid())
  email     String
  codeHash  String                 // hash del OTP, NUNCA el código plano
  purpose   String                 // 'device_link' | 'admin_login'
  attempts  Int      @default(0)   // bloquear tras N intentos
  expiresAt DateTime               // ej. now + 10 min
  consumedAt DateTime?
  createdAt DateTime @default(now())
  @@index([email, purpose])
}
```

Reglas del OTP: máximo ~5 intentos por challenge, TTL 10 min, un solo uso (`consumedAt`), rate limit por email/IP (§4.2). El código viaja por email; en la DB solo se guarda `codeHash` = hash del OTP **con pepper** (`OTP_PEPPER`, §5) — nunca el código plano. 🔶 [DECISIÓN ABIERTA] proveedor de email transaccional (Resend / SES / Postmark) y dominio remitente — Alan ya usa Resend en Mi San Pedro, lo natural es reusarlo (por eso el secreto canónico es `RESEND_API_KEY`, §5). Depende de que haya dominio CCM verificado.

### 1.6 QR de acreditación verificable en la puerta (modelo híbrido)

El QR pasa de hash-de-juguete a un **modelo híbrido firma + estado en DB** (canónico; el detalle de puerta vive en el doc 13 acreditacion-en-puerta). En seguridad lo que nos importa es el secreto y el contrato:

- **El QR contiene un `accreditationToken`** = JWT firmado con `ACCREDITATION_TOKEN_SECRET` (secreto **separado** del device y del admin, §5). Payload: `{ deviceId, ticketId, jornada, typ: 'accred', exp }` con `exp` = fin del evento. Falsificar el QR exige ese secreto del server.
- **El estado de uso vive en la fila `Ticket`** (no en el JWT), para poder validar "un solo uso por jornada" server-side:
  ```prisma
  model Ticket {
    id          String   @id @default(cuid())
    deviceId    String                          // FK → Device.id
    orderId     String?                         // null si entrada gratis
    jornada     String                          // sábado / domingo
    qrToken     String   @unique                // jti del JWT de acreditación
    checkedIn   Boolean  @default(false)
    checkedInAt DateTime?
  }
  ```
- **Validación en puerta (canon, detalle en doc 13):** online se valida contra DB (firma + `Ticket.checkedIn` para evitar reúso); offline se valida solo la firma del JWT y el check-in se sincroniza después. El endpoint de check-in es **`POST /api/v1/admin/checkin`** con rol **STAFF** (§2) — verifica firma, marca `Ticket.checkedIn/checkedInAt` y devuelve nombre + tipo de entrada + si es Socio VIP.
- **Emisión del token+Ticket — dos disparadores** (canon, ver doc 13 y doc de pagos): (a) entrada **gratis** = una `Registration` confirmada emite `accreditationToken` + fila `Ticket` sin pago; (b) entrada **VIP paga** = el webhook MP `approved` (`POST /api/v1/webhooks/mp`) sobre el `TicketOrder` emite el token + `Ticket`. Ambos caminos terminan en `Ticket` + JWT.

🔶 [DECISIÓN ABIERTA] ¿el control de acceso del Hotel Quinto Centenario tiene WiFi/datos confiables el 19-20/09? Define cuánto se apoya la puerta en validación online vs offline (la firma del JWT funciona offline; el chequeo de reúso `Ticket.checkedIn` necesita DB o pre-sincronización) y si conviene HS256 vs RS256 para verificar offline en el lector. El detalle operativo lo cierra el doc 13. Mientras tanto, **`qrToken()` actual no debe usarse como mecanismo real de acceso** — es demo.

> Nota: el QR hoy se arma 100% client-side (`AccreditationCard` usa `qrToken()` + `qrcode`). En real, el front pide el `accreditationToken` al backend (`GET /api/v1/me/accreditation`) y lo dibuja; offline cae al token cacheado.

---

## 2. Autenticación del organizador (admin) con rol

### 2.1 Reemplazar el gate "cualquier clave entra"

El `AdminGate` actual se borra como mecanismo de seguridad (puede quedar el layout visual). El backend gana usuarios de organizador reales con rol. Dos caminos, elegí uno:

- **Passwordless por email + OTP (recomendado, coherente con la app).** Mismo motor de OTP de §1.5 con `purpose='admin_login'`, restringido a emails de una allowlist de organizadores. Cero contraseñas que gestionar, encaja con el patrón PIN/passwordless que Alan ya usa (Norte). 
- **Email + contraseña.** Hash con **argon2id** (o bcrypt cost ≥ 12). Más fricción operativa (reset de password, política de fortaleza) sin beneficio claro acá.

```prisma
model AdminUser {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  role         AdminRole @default(EDITOR)
  // passwordHash String?  // solo si se elige email+password
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
  disabledAt   DateTime?
}

enum AdminRole {
  OWNER    // Gastón / Alan: todo, incl. precios, MP, usuarios admin
  EDITOR   // carga de eventos, galerías, catálogo, contenido, postulaciones
  STAFF    // solo check-in en puerta (scan de QR), sin acceso al panel
  VIEWER   // solo lectura del dashboard
}
```

🔶 [DECISIÓN ABIERTA] quiénes son los organizadores reales y qué puede tocar cada uno: ¿Gastón = OWNER, Alan = OWNER, equipo de Néstor = EDITOR? ¿Cuántas personas de puerta = STAFF? El set de roles de arriba es una propuesta; los nombres/emails los define Gastón/Alan.

### 2.2 Login y sesión admin

```http
POST /api/v1/admin/auth/request   { email }            # manda OTP si el email está en AdminUser
POST /api/v1/admin/auth/verify    { email, code }      # devuelve adminToken (JWT) + perfil
```

- `adminToken` es un JWT **distinto** del device-token: firmado con `ADMIN_TOKEN_SECRET` (secreto separado), payload `{ sub: adminUser.id, role, typ: 'admin', iat, exp }`, `exp` **corto** (ej. 8-12 h; el panel no es daily-driver). Sin "sesión infinita" como en apps de asistente — acá hay datos sensibles.
- El front del panel guarda el `adminToken` y lo manda en `Authorization`. Al expirar → re-login por OTP.
- Logout = borrar el token local. Opcional: tabla `AdminSession` con `jti` para poder revocar (útil si despiden a alguien o se filtra un token). Recomendado si el evento maneja plata real.

### 2.3 Protección de rutas `/admin/*` del lado servidor

El punto clave: **el gate del front es solo UX; la seguridad vive en el backend.** Todo endpoint `/api/v1/admin/*` pasa por middleware:

```ts
// requireAdmin(...roles): exige adminToken válido y rol suficiente
function requireAdmin(...allowed: AdminRole[]) {
  return (req, res, next) => {
    const token = bearer(req)
    const claims = verifyAdminToken(token)          // 401 si inválido/expirado
    if (!allowed.includes(claims.role)) return res.status(403).json({ error: 'forbidden' })
    req.admin = claims
    next()
  }
}

// ejemplos
router.post('/api/v1/admin/events',  requireAdmin('OWNER','EDITOR'), createEvent)
router.patch('/api/v1/admin/plans/:id', requireAdmin('OWNER'), updatePlan)   // precios = solo OWNER
router.post('/api/v1/admin/checkin', requireAdmin('OWNER','EDITOR','STAFF'), checkin)  // puerta — detalle en doc 13
router.get('/api/v1/admin/analytics', requireAdmin('OWNER','EDITOR','VIEWER'), analytics)
```

Mapeo de la interfaz `DataStore` → roles mínimos (los `create/update/delete*` de admin):
- `updatePlan` (precios/mpLink de entradas) → **OWNER**.
- `createEvent/updateEvent/deleteEvent`, `createBlock/...`, `createGallery/...`, `createSponsor/...`, `createCatalogProfile/...`, `createContent/...`, `decideApplication` → **OWNER, EDITOR**.
- check-in en puerta (`POST /api/v1/admin/checkin`, scan de QR) → **OWNER, EDITOR, STAFF** (STAFF = personal de puerta, solo escanea).
- `getAnalytics` y lecturas del dashboard → **OWNER, EDITOR, VIEWER**.

Operaciones de asistente (`register`, `createOrder`, `becomeSocio`, `submitApplication`, `toggleFavorite`, `createCampaign`, `saveProfileFields`, `track`) usan el **device-token**, no el admin-token.

---

## 3. CORS (GitHub Pages → Railway)

El front sirve desde `https://soyalantapia.github.io` (path `/ccm-app/`) y pega al API en `https://<servicio>.up.railway.app`. Cross-origin obligado → CORS explícito y cerrado.

```ts
import cors from 'cors'

const ALLOWED = (process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
// ej. CORS_ORIGINS="https://soyalantapia.github.io,http://localhost:5173"

app.use(cors({
  origin(origin, cb) {
    // sin origin (curl, server-to-server, webhooks MP) lo maneja cada ruta aparte
    if (!origin) return cb(null, true)
    return ALLOWED.includes(origin) ? cb(null, true) : cb(new Error('CORS: origin no permitido'))
  },
  methods: ['GET','POST','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization'],
  maxAge: 86400,
  // credentials NO hace falta: usamos Bearer token en header, no cookies.
}))
```

- **Allowlist, no `*`.** El origin de GH Pages es **el dominio entero** (`https://soyalantapia.github.io`), no el path — CORS no distingue `/ccm-app/`. Cualquier página en ese github.io comparte origin; es lo que hay con GH Pages.
- Mandar siempre `Authorization` por header (Bearer), **no cookies** → así no necesitamos `credentials: true` ni preocuparnos por SameSite/CSRF de cookies.
- 🔶 [DECISIÓN ABIERTA] si CCM se muda a dominio propio (ej. `app.cordobacorazondemoda.com`), agregar ese origin a `CORS_ORIGINS` y revisar el `base` de Vite. La decisión "¿se queda en GH Pages o se mueve?" la toma Gastón/Alan; el código ya lee orígenes de env así que es solo cambiar la variable.
- El webhook de Mercado Pago (`POST /api/v1/webhooks/mp`) llega **sin origin del navegador** y se valida por firma/secreto (`MP_WEBHOOK_SECRET`), no por CORS (ver doc de pagos y doc 05 api-contrato).

---

## 4. Seguridad transversal del API

### 4.1 Validación de input (zod en todo borde)

Ningún handler confía en el body/query/params. Cada endpoint tiene un schema zod y un middleware que rechaza con `400` antes de tocar Prisma.

```ts
import { z } from 'zod'

const SaveProfileBody = z.object({
  values: z.object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName:  z.string().trim().min(1).max(80).optional(),
    email:     z.string().trim().email().max(120).optional(),
    profession:z.string().trim().max(80).optional(),
    phone:     z.string().trim().max(30).optional(),
    dni:       z.string().trim().regex(/^\d{6,9}$/).optional(),   // DNI argentino
    city:      z.string().trim().max(80).optional(),
    instagram: z.string().trim().max(60).optional(),
  }).strict(),
  source: z.string().max(60),
})

const CreateOrderBody = z.object({
  planId: z.enum(['sab-general','sab-night-vip','combo-vip','dom-general','dom-sunset-vip']),
  qty: z.number().int().min(1).max(10).default(1),
})

const CreateCampaignBody = z.object({
  slot: z.enum(['S1','S2','S3','S4','S6']),
  brand: z.string().trim().min(1).max(60),
  headline: z.string().trim().min(1).max(120),
  cta: z.string().trim().max(40).optional(),
  tagline: z.string().trim().max(120).optional(),
  hours: z.number().int().min(1).max(720),
})
```

- `.strict()` para rechazar campos extra (evita mass-assignment).
- **Los enums de zod derivan de los tipos del dominio** (`PlanId`, `AdSlot`, `OrderStatus`, `ApplicationStatus`, `ProfileFieldKey`) — un solo origen de verdad: el backend vive en `server/` dentro del mismo repo e **importa los tipos desde `src/data/types.ts`** vía path alias del tsconfig del server (o import relativo a la raíz); los schemas zod se derivan de esos tipos y un **test de paridad** verifica que coinciden (no duplicar literals a mano).
- **El `total` de una orden y el de una campaña los calcula el SERVIDOR**, nunca el cliente. Hoy `createOrder` calcula `(price + serviceCharge) × qty` en el front; en real el front manda `planId`+`qty` y el backend recalcula con el precio canónico de la DB. Igual `AdCampaign.total` = tarifa por hora × `hours` server-side. Nunca aceptar `total` del body (fraude de precio).
- Estados de orden/postulación: las transiciones las valida el server (`creada → redirigida_mp → confirmada/cancelada`, emitiendo `ticket_order_created` / `ticket_order_redirected_mp` / `ticket_order_confirmed`, ver doc 05); el cliente no puede saltar a `confirmada`. La confirmación la dispara **el webhook MP** (`POST /api/v1/webhooks/mp`), no el front. La marca de redirigida es `POST /api/v1/orders/:id/redirected`.

### 4.2 Rate limiting

`express-rate-limit`. En v1 corre **1 sola instancia en Railway**, así que el store en memoria alcanza (igual que el EventEmitter de SSE). Disparador para mover a **Redis**: cuando se escale a **≥2 instancias** (ahí el store en memoria deja de ser coherente entre réplicas). Límites diferenciados:

| Grupo de endpoints | Límite sugerido | Por qué |
|---|---|---|
| `POST /api/v1/devices/bootstrap` | ~10 / hora / IP | evitar creación masiva de devices fantasma que inflen analytics |
| `POST /api/v1/devices/link/request`, `/api/v1/admin/auth/request` | ~5 / 15 min / IP **y** / email | anti-spam de OTP / enumeración de emails |
| `.../link/verify`, `.../auth/verify` | ~5 / 15 min, + `attempts` en `OtpChallenge` | anti fuerza bruta del código de 6 dígitos |
| Escrituras de asistente (`register`, `createOrder`, `createCampaign`, `submitApplication`) | ~30 / min / device | abuso/bots |
| `POST /api/v1/analytics` (batch) | ~120 / min / device + cap de payload | el bus de analytics es público; sin esto se llena la tabla |
| Lecturas públicas (catálogo, eventos, galerías) | ~300 / min / IP | DoS básico |

Para el OTP: el límite por **email** importa tanto como por IP (un atacante rota IPs). El `attempts` de `OtpChallenge` es la segunda barrera: a los 5 intentos fallidos el challenge se quema.

### 4.3 Protección de endpoints de escritura

- Todas las mutaciones requieren token (device o admin según corresponda); cero escritura anónima salvo `bootstrap` y los `request` de OTP (`devices/link/request`, `admin/auth/request`).
- **Autorización a nivel de recurso (IDOR):** un device solo lee/cancela **sus** registrations/orders. `cancelRegistration(id)` valida `registration.deviceId === req.device.id` o devuelve `404` (no `403`, para no confirmar existencia). Mismo criterio en `POST /api/v1/orders/:id/redirected`, `getOrders`, `getDownloads`, `getFavorites`. Todas las FKs de estos recursos (Registration, TicketOrder, Membership, AnalyticsEvent, Payment, Ticket) referencian `Device.id`, que sale del token verificado, nunca del body.
- **Idempotencia** en creación de órdenes/campañas: aceptar un header `Idempotency-Key` (UUID generado por el front) para que un doble-tap o un reintento de red no genere dos órdenes/pagos. La clave + device se guardan; el segundo request devuelve la orden ya creada.
- Helmet para headers de seguridad (`app.use(helmet())`): `X-Content-Type-Options`, `Referrer-Policy`, etc. CSP la sirve GH Pages para el front; en el API importa menos pero no molesta.
- HTTPS only (Railway lo da); rechazar/upgradear http. HSTS vía helmet.
- Límite de body (`express.json({ limit: '256kb' })`) salvo el endpoint de subida de imágenes (galerías/portfolios), que va a object storage (R2/Spaces) con upload directo por URL prefirmada — **el API no recibe el binario**, solo emite la URL firmada tras validar rol/tamaño/mime.

---

## 5. Secretos y configuración (env)

Nada de secretos en el repo. Todo en variables de entorno de Railway:

```bash
# Backend (Railway service vars)
DATABASE_URL=postgres://...               # lo inyecta Railway
# --- TRES secretos JWT SEPARADOS (NO un único JWT_SECRET) ---
DEVICE_TOKEN_SECRET=...                    # firma device-tokens (32+ bytes random)
ADMIN_TOKEN_SECRET=...                     # firma admin-tokens (separado del de device)
ACCREDITATION_TOKEN_SECRET=...             # firma el accreditationToken del QR (separado, ver §1.6 / doc 13)
# --- otros secretos ---
OTP_PEPPER=...                             # pepper para hashear OTPs (no en la DB)
RESEND_API_KEY=...                         # email transaccional OTP                       🔶
ADMIN_BOOTSTRAP_EMAIL=...                  # primer OWNER sembrado por env (patrón Mi San Pedro)
MP_ACCESS_TOKEN=...                        # Mercado Pago (server-side, NUNCA al front)     🔶
MP_WEBHOOK_SECRET=...                      # validar firma del webhook MP (POST /api/v1/webhooks/mp)
CORS_ORIGINS=https://soyalantapia.github.io,http://localhost:5173
# Object storage de imágenes (R2/Spaces — credenciales)              🔶
R2_ACCESS_KEY_ID=... / R2_SECRET=... / R2_BUCKET=...

# Frontend (build-time de Vite, se hornea en el bundle de GH Pages)
VITE_API_URL=https://<servicio>.up.railway.app   # SIN el prefijo /api/v1; el cliente arma base = VITE_API_URL + '/api/v1'
                                                  # ausente → LocalDataStore (fallback)
```

- **`VITE_*` NO es secreto:** se hornea en el bundle estático y es público. Solo va ahí lo que puede ver cualquiera (la URL del API). El `MP_ACCESS_TOKEN`, los tres `*_SECRET`, `OTP_PEPPER` y `RESEND_API_KEY` **jamás** llevan prefijo `VITE_` ni tocan el front.
- **`VITE_API_URL` no incluye el prefijo `/api/v1`** (ej. `https://api.ccm.com.ar`): el cliente del front concatena `+ '/api/v1'` para armar el base. Nada de `/v1` ni `/api` sueltos (canon doc 05).
- Secretos largos y aleatorios: `openssl rand -base64 48`. **Los tres secretos de JWT son distintos entre sí** (comprometer device-tokens no compromete admin-tokens ni el QR de acceso, y viceversa). Nunca un único `JWT_SECRET` compartido.
- 🔶 [DECISIÓN ABIERTA] cuenta de Mercado Pago de cobro (¿a nombre de quién factura? ¿Gastón, CCM, una sociedad?) — define `MP_ACCESS_TOKEN` y a dónde cae la plata de entradas, membresías y publicidad. Es bloqueante para los tres flujos de pago.
- El primer `AdminUser` OWNER se siembra por env (`ADMIN_BOOTSTRAP_EMAIL`) en el arranque si la tabla está vacía — mismo patrón que Alan usó en el panel Owner de Mi San Pedro. Evita el huevo-y-la-gallina de "¿quién crea al primer admin?".

---

## 6. PII y consentimientos (DNI / email / teléfono)

La captura progresiva de datos es el activo de la app, y por eso mismo es el mayor riesgo. Los `ProfileField` con key `dni`, `email`, `phone` son **PII**; el `dni` es dato de identidad sensible. Que la PII viva en su propia tabla hija (§1.2) ayuda: se purga/anonimiza por filas sin tocar el `Device` ni los agregados.

### 6.1 Minimización

- Pedir cada campo **solo cuando la acción lo exige** (ya es el patrón just-in-time del `requireProfile`). Ejemplo: el `ProfileField` `dni` solo si la acreditación física del hotel lo requiere; si no, no se captura. 🔶 [DECISIÓN ABIERTA] ¿el ingreso al Hotel Quinto Centenario exige DNI? Si no, **sacar `dni` del flujo** y no almacenarlo: el dato más sensible se evita de raíz.
- El evento de analytics `profile_field_captured` (taxonomía canónica, doc 05) lleva `deviceId` pero **no debe llevar PII en el `payload`**. Hoy el front mete `key` (el nombre del campo capturado) y `source`, pero **no el valor** — mantener esa regla en el backend: el bus de analytics guarda *qué* se capturó y *desde dónde* (`source`), nunca el *valor*. Validar en el schema de `POST /api/v1/analytics` (ingesta batch, canon doc 05) que ningún evento traiga email/dni/phone en el payload.

### 6.2 Consentimientos (granulares, con timestamp)

El modelo ya es bueno: cada consentimiento guarda **timestamp ISO** por tipo, no un booleano — eso es prueba de *cuándo* consintió. Tres consentimientos separados:
- `terms` — términos y privacidad (obligatorio para operar).
- `news` — comunicaciones del evento (opt-in).
- `sponsors` — compartir/contactar con sponsors (opt-in, separado). **Clave:** no usar el dato del asistente para sponsors si no marcó este consentimiento.

El backend registra cada consentimiento con su `DateTime` (sea como `ProfileField` con `value`=timestamp o tabla dedicada, según doc 04) y, recomendado, la **versión del texto legal** aceptada por si los términos cambian.

### 6.3 Retención, baja y export

- **Retención:** definir cuánto se guarda la PII después del evento. Propuesta: datos operativos (registrations/orders) se conservan; PII de contacto (phone/dni) se purga o anonimiza pasado X tiempo post-evento salvo membresía activa. 🔶 [DECISIÓN ABIERTA] ventana de retención — la define negocio + lo que exija la ley (abajo).
- **Baja / derecho de supresión:** endpoint `DELETE /api/v1/me` (con device-token) que borra/anonimiza el `Device` y sus `ProfileField` (la PII vive aislada ahí, §1.2), conservando agregados de analytics ya anonimizados. Sin esto no se puede honrar un pedido de borrado.
- **Acceso/portabilidad:** `GET /api/v1/me/export` devuelve todo lo que el backend tiene de ese device (perfil = `ProfileField`, consents, registrations, orders) en JSON — cubre el derecho de acceso.

### 6.4 🔶 Obligaciones legales argentinas (REVISAR CON ASESOR)

🔶 [DECISIÓN ABIERTA — requiere validación legal, no es consejo jurídico]
- **Ley 25.326 de Protección de Datos Personales (Argentina)** y normativa de la **AAIP** (Agencia de Acceso a la Información Pública). Implica, entre otras cosas: base de datos eventualmente registrable, principios de finalidad y consentimiento previo, y los derechos **ARCO** (Acceso, Rectificación, Cancelación, Oposición) que los endpoints de §6.3 deben poder satisfacer.
- **Texto de privacidad y términos** visible y aceptado antes de capturar PII (el consentimiento `terms` ya existe en el modelo; falta el texto real). 🔶 quién redacta la política de privacidad de CCM.
- **Finalidad declarada del dato de sponsors:** si los datos se ceden/comparten con terceros (sponsors), eso debe estar explícito en la política y atado al consentimiento `sponsors`. Ceder datos sin esa base es el riesgo legal más concreto del modelo de negocio.
- **Menores:** si pudiera haber asistentes menores de edad, hay reglas adicionales de consentimiento. 🔶 ¿el evento admite menores que se registren?

Esto NO lo resuelve el backend solo: necesita una definición legal de Gastón/Alan (texto de privacidad + asesoría). El backend ya queda *preparado* (consents con timestamp+versión, export, borrado) para cumplir cuando se defina.

---

## 7. Checklist de implementación (orden sugerido)

1. **Tablas + migraciones** `Device`, `ProfileField`, `AdminUser`, `OtpChallenge`, `Ticket` (schema canónico en doc 04).
2. **Middleware** `requireDevice` / `requireAdmin(...roles)` + verificación JWT (los tres secretos separados).
3. **Endpoints de identidad:** `POST /api/v1/devices/bootstrap`, `/refresh`, `GET /api/v1/me`, `/me/export`, `DELETE /api/v1/me`, `/devices/link/request`, `/devices/link/verify`.
4. **Auth admin:** `POST /api/v1/admin/auth/request`, `/admin/auth/verify`, siembra del primer OWNER por env (`ADMIN_BOOTSTRAP_EMAIL`).
5. **CORS allowlist por env + helmet + límite de body + rate limiting** (OTP primero; store en memoria en v1 = 1 instancia, Redis al pasar a ≥2).
6. **Schemas zod** en todos los bordes, derivados de `src/data/types.ts` con test de paridad; `total` y transiciones de estado calculados server-side.
7. **QR real:** `GET /api/v1/me/accreditation` (emite `accreditationToken` + fila `Ticket`) + check-in en puerta `POST /api/v1/admin/checkin` (rol STAFF) — modelo híbrido firma+DB, detalle operativo en doc 13.
8. **RemoteDataStore** en el front: bootstrap al primer arranque, `Authorization: Bearer` en todo, fallback a `LocalDataStore` si `VITE_API_URL` ausente o el API cae.
9. **Borrar el `AdminGate` de juguete** como mecanismo de seguridad (queda solo como pantalla de login que llama a `auth/request`).
10. **Texto legal de privacidad/términos** (bloqueante de negocio, §6.4).

---

## 8. Decisiones abiertas (resumen)

- 🔶 Política de merge al vincular device por email: ¿descartar anónimo o fusionar actividad? (§1.5)
- 🔶 Proveedor de email transaccional + dominio remitente (Resend probable → `RESEND_API_KEY`). (§1.5)
- 🔶 ¿Hay conectividad confiable en la puerta del Hotel Quinto Centenario? → cuánto se apoya el check-in en validación online (DB) vs offline (solo firma del JWT) y HS256 vs RS256. El detalle de puerta lo cierra el doc 13. (§1.6)
- 🔶 Roles reales de organizador: quiénes son OWNER/EDITOR/STAFF (Gastón, Alan, equipo de Néstor, puerta). (§2.1)
- 🔶 ¿El front se queda en GH Pages o se mueve a dominio propio? → orígenes CORS + `base` de Vite. (§3)
- 🔶 Cuenta de Mercado Pago de cobro (a nombre de quién factura) — bloquea los 3 flujos de pago. (§5)
- 🔶 ¿El ingreso exige DNI? Si no, sacar el campo más sensible de raíz. (§6.1)
- 🔶 Ventana de retención de PII post-evento. (§6.3)
- 🔶 Cumplimiento Ley 25.326 / AAIP / derechos ARCO + redacción de política de privacidad + tratamiento de datos cedidos a sponsors + menores — requiere asesoría legal. (§6.4)
