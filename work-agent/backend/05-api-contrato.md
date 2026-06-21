# Contrato de API (REST)

Este documento define el contrato HTTP del backend de CCM. La regla de oro: **cada método de la interfaz `DataStore` (`src/data/store/DataStore.ts`) tiene un mapeo claro a uno o varios endpoints**. El `RemoteDataStore` que vamos a escribir es un traductor `método → fetch`, nada más. Si un método no aparece acá, falta y rompe la costura.

---

## 0. Convenciones globales

### Base URL y versionado

```
https://<railway-host>/api/v1
```

- **Todo cuelga de `/api/v1`** (canon de paths). No existe `/v1` suelto ni `/api` pelado: el prefijo completo y único es `/api/v1`. Cuando rompamos compatibilidad, `/api/v2` convive con `/api/v1` hasta que el frontend (en GH Pages, desplegado por separado) migre. Esto importa porque **frontend y backend se despliegan en momentos distintos** — el front estático puede quedar viejo días.
- El front arma la base con `import.meta.env.VITE_API_URL` (hoy NO existe esa env; ver doc de migración). **`VITE_API_URL` NO incluye el prefijo**: vale el origin pelado (ej. `VITE_API_URL=https://api.ccm.com.ar`) y el cliente concatena `VITE_API_URL + '/api/v1'`. Nada de hornear `/api/v1` (ni `/v1`) dentro de la env. 🔶 [DECISIÓN ABIERTA] Dominio final del API (¿`api.ccm.com.ar`? ¿subdominio Railway crudo?). Define el `VITE_API_URL` de prod y el `Access-Control-Allow-Origin`.

### Paths canónicos (fuente de verdad)

Este doc es el canon de **paths** y de **taxonomía de eventos**. Los endpoints que tocan a otros docs se fijan acá y el resto se alinea:

| Acción | Método + path (siempre bajo `/api/v1`) |
|---|---|
| Ingesta de analytics (batch) | `POST /api/v1/analytics` — **prohibido** `/events` o `/api/track` |
| Webhook Mercado Pago | `POST /api/v1/webhooks/mp` — **prohibido** `/webhooks/mercadopago` |
| Marcar orden redirigida a MP | `POST /api/v1/orders/:id/redirected` (participio, no `/redirect`) |
| Check-in en puerta (rol `STAFF`) | `POST /api/v1/admin/checkin` — el detalle vive en el doc de acreditación |

### Identidad y auth

Dos planos de auth, coherentes con la app passwordless:

1. **Asistente (device).** La identidad es el `deviceId` (UUID generado en el cliente, hoy ya vive en `DeviceProfile`). El front manda en cada request:
   ```
   X-Device-Id: <uuid>
   Authorization: Bearer <deviceJWT>   # opcional en fase 1, ver doc de auth
   ```
   El backend hace un *upsert* del device en el primer contacto. No hay contraseña. 🔶 [DECISIÓN ABIERTA] Si elevamos a JWT por device (firmar el `deviceId` con un secreto del server) o dejamos el header crudo para fase 1.

2. **Organizador (admin).** Endpoints bajo `/admin/*` exigen `Authorization: Bearer <adminJWT>` con rol. Hoy el gate del admin acepta cualquier clave (demo); en real es login de organizador. Ver doc de auth.

> **Lectura pública vs privada.** Los `GET` de catálogo público (`/events`, `/plans`, `/sponsors`, `/catalog`, `/galleries`, `/contents`, `/convocatorias/:slug`) no requieren auth. Las mutaciones del admin (crear/editar/borrar evento, sponsor, etc.) sí. Las lecturas/escrituras *propias del device* (`/me`, `/registrations`, `/orders` propias, `/favorites`) usan el `X-Device-Id`.

### Formato de respuesta

Respuesta exitosa: el recurso o la colección **tal cual** los espera el tipo de TS del front (mismos nombres de campo que `src/data/types.ts`). Sin envoltorio `{ data: ... }` para recursos simples — el `RemoteDataStore` quiere devolver el objeto del dominio directo. Para colecciones paginadas (solo analytics) sí hay envoltorio (ver §11).

### Formato de error (uniforme)

Todos los errores devuelven el mismo shape, así el `RemoteDataStore` los maneja en un solo lugar:

```jsonc
// HTTP 4xx / 5xx
{
  "error": {
    "code": "BLOCK_FULL",          // string estable, para switch en el front
    "message": "El bloque no tiene cupo disponible.",  // legible (es-AR)
    "details": { "blockId": "blk_123", "left": 0 }      // opcional
  }
}
```

Códigos de `code` propios del dominio CCM: `BLOCK_FULL`, `ALREADY_REGISTERED`, `SOCIO_ONLY`, `PLAN_NOT_PURCHASABLE` (price null / sin mpLink), `DEADLINE_PASSED` (convocatoria cerrada), `SLOT_OCCUPIED` (campaña, slot ya tomado), `DEVICE_REQUIRED`, `ADMIN_REQUIRED`, `VALIDATION` (body inválido, `details` lista los campos), `NOT_FOUND`, `IDEMPOTENCY_CONFLICT`.

### Códigos de estado

| Código | Uso |
|---|---|
| `200 OK` | GET / mutación que devuelve recurso |
| `201 Created` | POST que crea recurso (devuelve el creado, con `Location`) |
| `204 No Content` | DELETE y mutaciones sin body (ej. `saveConsents`, `toggleFavorite`) |
| `400 Bad Request` | `VALIDATION` |
| `401 Unauthorized` | falta/expiró auth (`DEVICE_REQUIRED` / `ADMIN_REQUIRED`) |
| `403 Forbidden` | autenticado pero sin permiso (admin sin rol, `SOCIO_ONLY`) |
| `404 Not Found` | slug/id inexistente |
| `409 Conflict` | regla de negocio: `BLOCK_FULL`, `ALREADY_REGISTERED`, `SLOT_OCCUPIED`, `IDEMPOTENCY_CONFLICT` |
| `422` | (reservado, no lo usamos; las reglas de negocio van a 409) |

### Idempotencia (POSTs de pago)

Los tres flujos de pago — **órdenes de entrada** (`createOrder`), **membresía** (`becomeSocio`) y **campaña publicitaria** (`createCampaign`) — aceptan header de idempotencia para que un doble-tap o un reintento de red no genere doble cobro/doble registro:

```
Idempotency-Key: <uuid generado por el cliente por intento>
```

El server guarda `(idempotencyKey, deviceId) → response` por 24 h. Mismo key → devuelve la respuesta original (200/201) sin re-ejecutar. Key reusada con body distinto → `409 IDEMPOTENCY_CONFLICT`. Webhooks de Mercado Pago son idempotentes por `payment.id` (ver doc de pagos).

---

## 1. Perfil / identidad (`/me`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `getProfile()` | `GET` | `/me` |
| `saveProfileFields(values, source)` | `PATCH` | `/me/fields` |
| `saveConsents(consents)` | `PATCH` | `/me/consents` |

**`GET /me`** → `200` con `DeviceProfile`. Si el `X-Device-Id` no existía, el server lo crea (upsert) y devuelve perfil vacío (`fields: {}`, `consents: {}`, `createdAt` = ahora).

```jsonc
{
  "deviceId": "dev_8f...",
  "createdAt": "2026-09-01T12:00:00.000Z",
  "fields": {
    "firstName": { "value": "Ana", "capturedAt": "...", "source": "registro_charla" },
    "email":     { "value": "ana@x.com", "capturedAt": "...", "source": "checkout_entrada" }
  },
  "consents": { "terms": "2026-09-01T...", "news": "2026-09-01T..." }
}
```

**`PATCH /me/fields`** — captura progresiva. El server completa `capturedAt` (server-side, no confiar en el cliente) y guarda `source`. Devuelve el `DeviceProfile` actualizado.

```jsonc
// request
{ "values": { "phone": "351...", "city": "Córdoba" }, "source": "checkout_entrada" }
```

> **PII.** `email`, `phone`, `dni` son datos personales. El server los persiste cifrados/segmentados según el doc de datos; el contrato no cambia, pero el `source` es clave para el dashboard de segmentación.

**`PATCH /me/consents`** → `200` con perfil actualizado (o `204`). Body: `{ "terms"?: boolean, "news"?: boolean, "sponsors"?: boolean }`. El server traduce `true → timestamp ISO` (el tipo `consents` guarda strings, no booleanos).

---

## 2. Membresía Socio CCM (`/me/membership`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `getMembership()` | `GET` | `/me/membership` |
| `isSocio()` | (derivado de `getMembership`, no pega a la red) | — |
| `becomeSocio(paid)` | `POST` | `/me/membership` |

**`GET /me/membership`** → `200` con `Membership` (`{ tier, since, paid }`). Free por defecto.

**`POST /me/membership`** — flujo de pago real (Mercado Pago). **NO** marca socio de una; **crea una preferencia de pago** y devuelve a dónde redirigir. El socio se activa cuando entra el webhook de MP (`membership_purchased`).

```jsonc
// request  (Idempotency-Key obligatorio)
{ "paid": 0 }   // 'paid' lo fija el server desde el precio configurado, no el cliente
// response 201
{
  "membership": { "tier": "free", "since": "", "paid": 0 },  // sigue free hasta confirmar pago
  "checkout": { "provider": "mercadopago", "initPoint": "https://mp.../checkout", "orderRef": "mem_abc" }
}
```

> `isSocio()` en el `RemoteDataStore` se resuelve del `Membership` cacheado, no hace request. 🔶 [DECISIÓN ABIERTA] Precio de la membresía Socio CCM y cuenta de cobro de Mercado Pago (Gastón/Alan). Sin eso, `paid` y el `initPoint` son placeholders.

---

## 3. Eventos (`/events`) + bloques

| DataStore | Método HTTP | Path |
|---|---|---|
| `getEvents()` | `GET` | `/events` |
| `getEvent(slug)` | `GET` | `/events/:slug` |
| `getEventById(id)` | `GET` | `/events/by-id/:id` |
| `createEvent(input)` | `POST` | `/admin/events` |
| `updateEvent(id, patch)` | `PATCH` | `/admin/events/:id` |
| `deleteEvent(id)` | `DELETE` | `/admin/events/:id` |
| `getBlocks(eventId)` | `GET` | `/events/:eventId/blocks` |
| `getBlock(blockId)` | `GET` | `/blocks/:blockId` |
| `createBlock(input)` | `POST` | `/admin/blocks` |
| `updateBlock(id, patch)` | `PATCH` | `/admin/blocks/:id` |
| `deleteBlock(id)` | `DELETE` | `/admin/blocks/:id` |
| `blockAvailability(blockId)` | `GET` | `/blocks/:blockId/availability` |

- `GET /events` → `200` con `EventItem[]`, ordenado por `startDate`. Soporta filtros query: `?type=principal|camino|capacitacion`, `?past=true|false`.
- `GET /events/:slug` y `/events/by-id/:id` → `200` con `EventItem` o `404`. Mantenemos dos rutas porque el front resuelve por slug (deep links) y por id (relaciones internas); el `RemoteDataStore` necesita ambas firmas de la interfaz.
- `GET /blocks/:blockId/availability` → `200` con `BlockAvailability` (`{ capacity, taken, left, full }`). Lo calcula el server contando `Registration` confirmadas + `seedTaken`. **No** lo derivamos en el cliente para evitar oversell.
- Las mutaciones (`POST/PATCH/DELETE`) van bajo `/admin/*` con `adminJWT`. `createEvent`/`createBlock` devuelven `201` con el recurso (server genera `id` y `slug` — ver `NewEvent`/`NewBlock`, que omiten `id`).

El gate `socioOnly` aplica a nivel **evento** (`Event.socioOnly`): el bloque (`EventBlock`) **no** tiene flag propio, hereda el del evento. El server rechaza la inscripción de no-socios con `403 SOCIO_ONLY` mirando el `socioOnly` del **evento** (aunque `register` reciba `blockId`). 🔶 [DECISIÓN ABIERTA] Confirmar qué eventos/capacitaciones son socio-only para CCM 2026 (qué eventos llevan el flag, no dónde vive).

---

## 4. Inscripciones (`/registrations`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `getRegistrations()` | `GET` | `/registrations` |
| `isRegistered(eventId, blockId?)` | (derivado de `getRegistrations`) | — |
| `register(eventId, blockId?)` | `POST` | `/registrations` |
| `cancelRegistration(id)` | `DELETE` | `/registrations/:id` |

- `GET /registrations` → `200` con `Registration[]` **del device actual** (`X-Device-Id`). El admin ve todas vía `/admin/registrations`.
- `POST /registrations` → `201` con `Registration` (`status: 'confirmada'`).
  ```jsonc
  { "eventId": "evt_1", "blockId": "blk_3" }   // blockId opcional
  ```
  Reglas server-side (acá vive la lógica de negocio, no en el cliente):
  - bloque lleno → `409 BLOCK_FULL`.
  - ya inscripto a ese `(eventId, blockId)` → `409 ALREADY_REGISTERED`.
  - **evento** con `Event.socioOnly` y device no-socio → `403 SOCIO_ONLY`. El gate se chequea contra el `socioOnly` del **evento**, no del bloque (el bloque no tiene flag propio; hereda el del evento).
  - **El cupo se chequea atómicamente** (transacción + `SELECT ... FOR UPDATE`), porque `register` hoy puede devolver `null` y la UI cuenta con eso. En REST traducimos: `null` ⇄ `409`.

  > **El QR de acreditación** sale de acá: una `Registration` confirmada genera un token firmado que la app muestra como QR y la puerta escanea. Endpoint de validación en puerta: `POST /admin/checkin` (ver doc de acreditación, fuera de este contrato).

- `DELETE /registrations/:id` → `204`. Idempotente (cancelar dos veces no falla).

`register` puede devolver `null` en la interfaz; el `RemoteDataStore` mapea: `409 ALREADY_REGISTERED` o `409 BLOCK_FULL` → `return null` (no lanza, así no rompe pantallas que esperan `null`). Otros 4xx → throw.

---

## 5. Planes de entrada y órdenes (`/plans`, `/orders`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `getPlans()` | `GET` | `/plans` |
| `getPlan(id)` | `GET` | `/plans/:id` |
| `updatePlan(id, patch)` | `PATCH` | `/admin/plans/:id` |
| `createOrder(planId, qty?)` | `POST` | `/orders` |
| `markOrderRedirected(orderId)` | `POST` | `/orders/:id/redirected` |
| `setOrderStatus(orderId, status)` | `PATCH` | `/admin/orders/:id` |
| `getOrders()` | `GET` | `/orders` |

- `GET /plans` → `200` con `TicketPlan[]` (los 5 tiers: `sab-general`, `sab-night-vip`, `combo-vip`, `dom-general`, `dom-sunset-vip`). `price: null` = pendiente de confirmar; el front ya lo muestra como "a confirmar".
- `PATCH /admin/plans/:id` — admin fija `price` y `mpLink`. Body: `{ price?: number|null, mpLink?: string }`.
- **`POST /orders`** — flujo de pago real, igual patrón que membresía:
  ```jsonc
  // request  (Idempotency-Key obligatorio)
  { "planId": "sab-night-vip", "qty": 2, "buyerName": "Ana", "buyerEmail": "ana@x.com" }
  // response 201
  {
    "order": {
      "id": "ord_abc", "planId": "sab-night-vip", "ts": "...",
      "status": "iniciada", "qty": 2, "total": 0,   // total lo calcula el server: (price+serviceCharge)*qty
      "buyerName": "Ana", "buyerEmail": "ana@x.com"
    },
    "checkout": { "provider": "mercadopago", "initPoint": "https://mp.../checkout?pref=..." }
  }
  ```
  - El server calcula `total` desde el `TicketPlan` (precio + `serviceCharge` × qty). **Nunca** confiar en un `total` del cliente.
  - Plan con `price: null` o `mpLink: null` → `409 PLAN_NOT_PURCHASABLE`.
- **`POST /orders/:id/redirected`** → `200`, marca `status: 'redirigida_mp'` (el front lo llama justo antes de mandar al usuario a MP). Sin body.
- **`PATCH /admin/orders/:id`** → admin fuerza estado (`confirmada`/`cancelada`) en casos de soporte. El camino normal de confirmación es el **webhook de Mercado Pago** (`ticket_order_confirmed`), no este endpoint.
- `GET /orders` → `200` con `TicketOrder[]` del device. Admin ve todas vía `/admin/orders`.

`OrderStatus` = `iniciada | redirigida_mp | confirmada | cancelada`. El flujo: `iniciada` (POST) → `redirigida_mp` (redirected) → `confirmada`/`cancelada` (webhook MP). 🔶 [DECISIÓN ABIERTA] Precios reales de los 5 tiers + cuenta de cobro MP. Sin eso `total` e `initPoint` no son reales.

---

## 6. Catálogo de expositores (`/catalog`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `getCatalog()` | `GET` | `/catalog` |
| `getCatalogProfile(slug)` | `GET` | `/catalog/:slug` |
| `createCatalogProfile(input)` | `POST` | `/admin/catalog` |
| `updateCatalogProfile(id, patch)` | `PATCH` | `/admin/catalog/:id` |
| `deleteCatalogProfile(id)` | `DELETE` | `/admin/catalog/:id` |

- `GET /catalog` → `200` con `CatalogProfile[]`. Filtros opcionales: `?role=`, `?platform=`, `?verified=true`.
- `GET /catalog/:slug` → `CatalogProfile` con `portfolio` embebido, o `404`.
- Las imágenes (`photo`, `portfolio[].image`) **no** van en base64 por el body en producción: el admin sube a object storage (R2/Spaces) vía `POST /admin/uploads` (presigned URL, ver doc de storage) y manda solo la URL resultante. `createCatalogProfile` recibe `NewCatalogProfile` (omite `id`/`slug`; server los genera).

---

## 7. Fotos y galerías (`/galleries`, `/favorites`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `getGalleries()` | `GET` | `/galleries` |
| `getGallery(slug)` | `GET` | `/galleries/:slug` |
| `createGallery(input)` | `POST` | `/admin/galleries` |
| `updateGallery(id, patch)` | `PATCH` | `/admin/galleries/:id` |
| `deleteGallery(id)` | `DELETE` | `/admin/galleries/:id` |
| `getFavorites()` | `GET` | `/me/favorites` |
| `toggleFavorite(photoId)` | `POST` | `/me/favorites/:photoId/toggle` |
| `recordDownload(photoId, galleryId)` | `POST` | `/downloads` |
| `getDownloads()` | `GET` | `/downloads` |

- `GET /galleries` → `Gallery[]` con `photos` embebidas (cada galería tiene `sponsorId` — la foto va "patrocinada"). `GET /galleries/:slug` → una galería o `404`.
- `GET /me/favorites` → `200` con `string[]` (ids de foto del device).
- `POST /me/favorites/:photoId/toggle` → `200` con el array resultante `{ favorites: string[] }`. Idempotencia natural: alterna estado.
- `POST /downloads` → `201` con `PhotoDownload` (`{ photoId, galleryId, sponsorId, ts }`). El server resuelve `sponsorId` desde la galería (no el cliente) — esto alimenta la métrica "descargas atribuidas al sponsor". Emite evento analytics `photo_download`.
- `GET /downloads` → `PhotoDownload[]` del device. Admin: agregado vía `/admin/downloads`.

Subida de fotos del admin: presigned URL a object storage; el body de `createGallery` lleva las URLs ya subidas.

---

## 8. Contenido / videos (`/contents`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `getContents()` | `GET` | `/contents` |
| `createContent(input)` | `POST` | `/admin/contents` |
| `updateContent(id, patch)` | `PATCH` | `/admin/contents/:id` |
| `deleteContent(id)` | `DELETE` | `/admin/contents/:id` |

- `GET /contents` → `200` con `ContentItem[]` (videos de YouTube; el front renderiza por `youtubeId`). Soporta `?socioOnly=` para filtrar.
- Si `socioOnly: true` y el device no es socio: el server **igual lista el item** pero puede omitir `youtubeId` (gate de reproducción). 🔶 [DECISIÓN ABIERTA] Si el contenido socio-only se oculta del listado o se muestra "bloqueado" (decisión de producto Gastón).

---

## 9. Sponsors y creatividades (`/sponsors`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `getSponsors()` | `GET` | `/sponsors` |
| `getSponsor(id)` | `GET` | `/sponsors/:id` |
| `createSponsor(input)` | `POST` | `/admin/sponsors` |
| `updateSponsor(id, patch)` | `PATCH` | `/admin/sponsors/:id` |
| `deleteSponsor(id)` | `DELETE` | `/admin/sponsors/:id` |
| `getCreative(slot, index?)` | `GET` | `/creatives/:slot` |

- `GET /sponsors` → `Sponsor[]` (con `creatives` embebidas, `level`, `exclusive`).
- **`GET /creatives/:slot`** (slot ∈ `S1|S2|S3|S4|S6`) → `200` con `{ sponsor, creative }` o `404`. Query `?index=` para elegir cuál cuando hay varias.
  - **Prioridad:** primero mira si hay una `AdCampaign` autogestionada activa para ese slot (§10) y la sirve; si no, cae al creative del sponsor seed. Esto unifica `getCreative` + `getActiveCampaign` del lado del server, pero el front sigue llamando a los dos métodos distintos de la interfaz. (Alternativa: dejarlo separado y que el front decida; lo dejamos server-side para no tocar pantallas.)
  - Servir un creative emite (o el front trackea) `ad_impression`.

🔶 [DECISIÓN ABIERTA] Sponsors reales de CCM 2026, niveles (Principal/Oro/Plata) y exclusividad de rubro (D20). Hoy son seed.

---

## 10. Publicidad autogestionada / self-serve (`/campaigns`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `createCampaign(input)` | `POST` | `/campaigns` |
| `getCampaigns()` | `GET` | `/campaigns` |
| `getActiveCampaign(slot)` | `GET` | `/campaigns/active/:slot` |

- **`POST /campaigns`** — tercer flujo de pago. Una marca compra un slot por X horas:
  ```jsonc
  // request  (Idempotency-Key obligatorio)
  { "slot": "S2", "brand": "Marca X", "headline": "...", "cta": "Ver más", "tagline": "...", "hours": 24 }
  // response 201
  {
    "campaign": { "id": "cmp_1", "slot": "S2", "brand": "...", "hours": 24, "total": 0, "ts": "..." },
    "checkout": { "provider": "mercadopago", "initPoint": "https://mp.../..." }
  }
  ```
  - El server calcula `total` desde la tarifa por hora × `hours` (no el cliente).
  - Slot ya ocupado por una campaña activa en esa ventana → `409 SLOT_OCCUPIED`.
  - La campaña entra "en vivo" recién cuando confirma el pago (webhook MP) y dentro de su ventana de `hours`.
- `GET /campaigns` → `AdCampaign[]` (admin / panel de quién compró qué).
- `GET /campaigns/active/:slot` → la campaña activa de ese slot o `404`. Lo consume `getCreative` server-side (§9).

🔶 [DECISIÓN ABIERTA] Tarifa por hora del self-serve y si va contra la misma cuenta MP que entradas/membresía.

---

## 11. Convocatorias y postulaciones (`/convocatorias`)

| DataStore | Método HTTP | Path |
|---|---|---|
| `getConvocatoria(slug)` | `GET` | `/convocatorias/:slug` |
| `submitApplication(convocatoriaId, data)` | `POST` | `/convocatorias/:id/applications` |
| `getApplications()` | `GET` | `/admin/applications` |
| `decideApplication(id, status)` | `PATCH` | `/admin/applications/:id` |

- `GET /convocatorias/:slug` → `Convocatoria` (con `fields` para construir el form dinámico) o `404`.
- **`POST /convocatorias/:id/applications`** → `201` con `Application` (`status: 'preinscripta'`). Body `{ "data": { "<fieldKey>": "<valor>", ... } }`. El server valida `data` contra los `fields.required` de la convocatoria (`400 VALIDATION` lista los faltantes) y contra `deadline` (`409 DEADLINE_PASSED`). Emite `application_submitted`.
- `GET /admin/applications` → `Application[]` (admin). Soporta `?convocatoriaId=` y `?status=`.
- `PATCH /admin/applications/:id` → admin decide. Body `{ "status": "aceptada" | "rechazada" }` (nunca `preinscripta` — el tipo lo excluye). Setea `decidedAt`. `200`.

`getApplications`/`decideApplication` son admin-only aunque la interfaz no lo distinga; el `RemoteDataStore` les agrega el `adminJWT`.

---

## 12. Analytics (`/analytics`) — paginado

| DataStore | Método HTTP | Path |
|---|---|---|
| `track(event, payload?)` | `POST` | `/analytics` |
| `getAnalytics()` | `GET` | `/admin/analytics` |

- **`POST /analytics`** → `202 Accepted` (fire-and-forget; no bloquea UI). Acepta **batch** (varios eventos en un request). Body:
  ```jsonc
  // batch: array de eventos
  [
    { "event": "ticket_order_redirected_mp", "payload": { "planId": "combo-vip", "qty": 1 } },
    { "event": "block_view", "payload": { "blockId": "blk_3" } }
  ]
  ```
  El server completa `id`, `ts` y `deviceId` (desde `X-Device-Id`).

  **Taxonomía canónica (estos nombres EXACTOS — son los del código actual; este doc es la fuente de verdad):**
  `user_created`, `registration_created`, `registration_cancelled`, `ticket_order_created`, `ticket_order_redirected_mp`, `ticket_order_confirmed`, `membership_purchased`, `ad_impression`, `ad_click`, `photo_view`, `photo_download`, `video_play`, `content_view`, `content_locked_view`, `application_submitted`, `event_view`, `block_view`, `profile_field_captured`.

  Ojo con los falsos amigos: es `ticket_order_created` (no `_initiated`) y `ticket_order_redirected_mp` (no `_redirected`). **Tip:** los eventos disparados por mutaciones del propio backend (ej. confirmación de pago por webhook) los emite el server, no el front — evita doble conteo.
- **`GET /admin/analytics`** — la única colección que **debe** paginar (puede ser grande, alimenta el dashboard en vivo + export CSV). Cursor-based:
  ```
  GET /admin/analytics?event=ticket_order_confirmed&from=2026-09-19T00:00:00Z&to=...&limit=200&cursor=<opaco>
  ```
  Respuesta **con envoltorio** (excepción a §0):
  ```jsonc
  {
    "data": [ { "id": "...", "event": "...", "ts": "...", "deviceId": "...", "payload": {} }, ... ],
    "page": { "nextCursor": "eyJ0cyI6...", "hasMore": true, "count": 200 }
  }
  ```
  - `cursor` es opaco (base64 de `{ts, id}`), estable ante inserts concurrentes — mejor que `offset` para un stream que crece en vivo.
  - Filtros: `event`, `from`/`to` (ISO), `limit` (default 100, máx 500).
  - `getAnalytics()` de la interfaz devuelve un array plano: el `RemoteDataStore` lo implementa **paginando internamente** (loop sobre `nextCursor`) o, mejor, exponiendo una variante que reciba filtros. Para el dashboard en vivo conviene **polling con TanStack Query** sobre la primera página ordenada desc por `ts` (SSE/WebSocket queda como mejora posterior).
  - Para export CSV grande: `GET /admin/analytics/export.csv?...` (stream, fuera del shape JSON).

🔶 [DECISIÓN ABIERTA] Retención de analytics y si el export CSV es self-service del admin o on-demand.

---

## 13. Cómo `RemoteDataStore` mapea método → endpoint

El `RemoteDataStore` implementa la **misma** interfaz `DataStore`, pero en esta era la interfaz **migra a asíncrona**: los métodos devuelven `Promise<T>` (decisión tomada, no abierta). El `RemoteDataStore` los implementa con `async`/`fetch`; `LocalDataStore` envuelve sus retornos sync en `Promise.resolve(...)` para respetar la misma firma. Los call-sites que ya usan `await`/TanStack Query se adaptan; los puntuales a tocar incluyen **TicketSelector** (`createOrder`), el **botón de membresía** (`becomeSocio`) y la **compra de publicidad** (`createCampaign`). Cache local (snapshot en memoria para que la UI lea sin parpadeo): el `RemoteDataStore` mantiene el snapshot, hace fetch en background y notifica subscribers al resolver. Conmutable por env con fallback a `LocalDataStore`.

```ts
// src/data/store/RemoteDataStore.ts  (esqueleto)
const base = `${import.meta.env.VITE_API_URL}/api/v1`

async function api<T>(path: string, init?: RequestInit & { idemKey?: string }): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId(),
      ...(init?.idemKey ? { 'Idempotency-Key': init.idemKey } : {}),
      ...init?.headers,
    },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json()
  if (!res.ok) throw new ApiError(body.error)   // { code, message, details }
  return body as T
}

class RemoteDataStore implements DataStore {
  // GET simple → recurso del dominio, tal cual el tipo de TS (ahora async: la interfaz devuelve Promise<T>)
  async getEvent(slug: string): Promise<EventItem | undefined> {
    return this.cache.events.find(e => e.slug === slug)   // lee del snapshot; el fetch lo hizo refresh()
  }

  // POST con regla de negocio: 409 conocidos → null (no rompe la UI que espera null)
  async register(eventId: string, blockId?: string): Promise<Registration | null> {
    try {
      const reg = await api<Registration>('/registrations', {
        method: 'POST',
        body: JSON.stringify({ eventId, blockId }),
      })
      this.cache.registrations.push(reg); this.emit()
      return reg
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'BLOCK_FULL' || e.code === 'ALREADY_REGISTERED')) return null
      throw e
    }
  }

  // POST de pago: Idempotency-Key por intento; devuelve recurso + checkout
  async createOrder(planId: PlanId, qty = 1): Promise<TicketOrder> {
    const { order } = await api<{ order: TicketOrder; checkout: Checkout }>('/orders', {
      method: 'POST',
      idemKey: crypto.randomUUID(),
      body: JSON.stringify({ planId, qty }),
    })
    // el RemoteDataStore guarda el initPoint para que la pantalla redirija; markOrderRedirected() lo confirma
    return order
  }
}
```

Reglas de mapeo a recordar:
- La interfaz es **asíncrona** (`Promise<T>` en todos los métodos). Los `getX()` resuelven del **snapshot en memoria** (devuelven una promesa ya resuelta); `refresh()` los rellena con `GET`. `LocalDataStore` envuelve sus retornos sync en `Promise.resolve(...)`.
- `create*` → `POST /admin/...` (devuelve `201` + recurso con `id`/`slug` generados).
- `update*(id, patch)` → `PATCH /admin/.../:id`.
- `delete*(id)` → `DELETE /admin/.../:id` (`204`).
- Métodos derivados (`isSocio`, `isRegistered`) **no** pegan a la red: se calculan del snapshot.
- Los tres `create*` de pago (`createOrder`, `becomeSocio`, `createCampaign`) llevan `Idempotency-Key`.
- Errores de negocio que la interfaz modela como `null` (`register`) → atrapar el `409` y devolver `null`; el resto → throw.
