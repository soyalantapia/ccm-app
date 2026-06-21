# Plan de migración por fases

Cómo llevar CCM de demo 100% frontend (seed + localStorage) a backend real **sin reescribir pantallas**: implementar `RemoteDataStore` contra la misma interfaz `DataStore`, conmutar por `VITE_API_URL` con fallback al `LocalDataStore`, y migrar dominio por dominio con doble modo y rollback en cada paso. La fecha dura es el evento (19–20/09/2026); el backend tiene que estar estable bastante antes.

---

## 0. La costura y la decisión tomada: la interfaz `DataStore` migra a ASÍNCRONA

Hoy `src/data/store/index.ts` hace:

```ts
export const store: DataStore = new LocalDataStore()
```

y la UI lee con `useStore((s) => s.getEvents())`, que corre sobre `useSyncExternalStore`. Hoy **todos los métodos de `DataStore` devuelven el valor ya resuelto** (`EventItem[]`, no `Promise<EventItem[]>`), y `LocalDataStore` lo cumple porque lee de localStorage de forma síncrona. Hay 46 archivos con `~80+` call-sites de `useStore`, más decenas de llamadas directas `store.track(...)`, `store.createOrder(...)`, etc.

El backend es asíncrono (red). **Decisión tomada (ya no es 🔶): en la era `RemoteDataStore` la interfaz `DataStore` migra a asíncrona — todos los métodos devuelven `Promise<T>`.** `LocalDataStore` se mantiene como fallback envolviendo sus retornos síncronos en `Promise.resolve(...)`, así sigue cumpliendo la misma interfaz sin cambiar su lógica interna (lee localStorage sync, devuelve `Promise.resolve(valor)`). Es un cambio de tipo, no de motor.

```ts
// src/data/store/index.ts (DESPUÉS)
import { LocalDataStore } from './LocalDataStore'
import { RemoteDataStore } from './RemoteDataStore'

const API = import.meta.env.VITE_API_URL   // hoy NO existe en .env del front; NO incluye el prefijo
// el cliente arma base = `${API}/api/v1` (ver doc de API). VITE_API_URL=https://api.ccm.com.ar
export const store: DataStore = API
  ? new RemoteDataStore(API)
  : new LocalDataStore()                    // GH Pages sin API o demo offline siguen vivos
```

**Por qué async y no la caché síncrona "stale-while-revalidate".** Probamos el camino de mantener la firma síncrona con un caché en memoria que bumpea el `bus` al resolver. Lo descartamos como contrato: arrastra estados intermedios raros (`[]` en el primer render que se confunde con "vacío real"), complica el manejo de errores y, sobre todo, choca con los flujos de pago que **sí** necesitan `await` (el checkout quiere el `init_point` real de MP antes de redirigir). Con la interfaz async + TanStack Query en los call-sites el estado (`isLoading`/`error`/`data`) es explícito y uniforme.

### Call-sites a adaptar (await / TanStack Query)

La mayoría de los call-sites de lectura ya pueden migrar a `useQuery` (que naturalmente espera la `Promise`). Los **puntuales que hay que tocar a mano** porque hoy asumen retorno síncrono y son mutaciones de cara al usuario:

- **`TicketSelector.tsx` → `createOrder`**: ya tiene que esperar la orden + `init_point`/`preference_id` de MP antes de redirigir; pasa a `await store.createOrder(...)`.
- **Botón de membresía → `becomeSocio`**: la compra de socio espera la preferencia de MP igual que la orden; `await store.becomeSocio(...)`.
- **Compra de publicidad → `createCampaign`**: tercer flujo de pago, mismo patrón; `await store.createCampaign(...)`.

El resto de mutaciones "blandas" (`toggleFavorite`, `recordDownload`, `saveConsents`) pueden seguir disparándose sin `await` (fire-and-forget con optimistic update), pero su firma igual es `Promise` — simplemente el call-site no la espera. `track()` nunca se espera (fire-and-forget, falla en silencio).

### Reactividad y caché interno del RemoteDataStore

El `RemoteDataStore` reusa el `bus` existente para invalidar/refrescar, pero ahora **devuelve `Promise`**. Esqueleto:

```ts
// src/data/store/RemoteDataStore.ts (forma, no completo)
export class RemoteDataStore implements DataStore {
  private cache = new Map<string, unknown>()   // 'events' -> EventItem[]

  constructor(private base: string) {}

  async getEvents(): Promise<EventItem[]> {
    return this.api<EventItem[]>(`/events`)   // base ya incluye /api/v1
  }

  async register(eventId: string, blockId?: string): Promise<Registration | null> { /* ... */ }
}

// LocalDataStore (fallback) envuelve sync en Promise.resolve
export class LocalDataStore implements DataStore {
  async getEvents(): Promise<EventItem[]> {
    return Promise.resolve(this.readLocal('events'))
  }
}
```

> El **dashboard del admin** estrena el patrón de **polling con TanStack Query** (la regla "tiempo real = polling con TanStack Query" del doc de stack); con la interfaz async, ese mismo patrón se vuelve el default de toda la app (no solo el admin), lo que unifica la costura y baja el riesgo del refactor.

### Tipos compartidos front/back (un solo origen de verdad)

El backend vive en `server/` **dentro del mismo repo**. No duplicamos los tipos de dominio: el server importa `EventItem`, `Registration`, `TicketOrder`, etc. desde `src/data/types.ts` vía un **path alias del `tsconfig` del server** (o import relativo a la raíz del repo). Los **esquemas zod** del server (validación de inputs) **derivan de esos mismos tipos**, con un **test de paridad** que falla si el tipo TS y el schema zod divergen. Esto es lo que hace que el seed (`seed/*.ts`) entre a Postgres con cero traducción y que el contrato del API no se desincronice del front: una sola definición de los tipos, dos consumidores.

### Optimistic update + reconciliación

Para que la UI no se sienta "lenta", las mutaciones aplican el cambio al caché **antes** de la respuesta y lo reconcilian al volver (o lo revierten si falla). Esto replica la sensación instantánea que hoy da localStorage. Caso crítico: `register()` con cupo — el optimismo se permite, pero si el server responde `409 BLOCK_FULL` se revierte el caché y se muestra el error (ver doc de API, `code: BLOCK_FULL`).

---

## 1. Orden de las fases (por dominio, no por capa)

Migramos **un dominio entero por vez** (su corte de la interfaz + sus tablas + sus endpoints), no "todas las lecturas y después todas las escrituras". Así cada fase es desplegable y testeable de punta a punta, y el resto de la app sigue en `LocalDataStore` vía un store **híbrido** (ver §9).

| Fase | Dominio | Métodos de `DataStore` | Por qué este orden |
|---|---|---|---|
| **A** | Identidad + perfil + analytics | `getProfile`, `saveProfileFields`, `saveConsents`, `track`, `getAnalytics` | Base de todo: el `deviceId` y el header `X-Device-Id` habilitan el resto. Bajo riesgo (datos del propio device). |
| **B** | Eventos + bloques + inscripciones + cupos | `getEvents`/`getEvent`/`getEventById`, `getBlocks`/`getBlock`, `blockAvailability`, `getRegistrations`/`isRegistered`/`register`/`cancelRegistration` | Es el corazón del producto y del cupo compartido. Lecturas públicas + 1 escritura con regla de negocio (cupo). |
| **C** | Entradas + pagos (MP) | `getPlans`/`getPlan`, `createOrder`, `markOrderRedirected`, `setOrderStatus`, `getOrders` | Dinero real. Depende de A (buyer = device). El más sensible: webhooks, idempotencia. |
| **D** | Membresía Socio | `getMembership`, `isSocio`, `becomeSocio` | Segundo flujo de pago; reusa todo lo de C. Pequeño. |
| **E** | Catálogo + galerías + contenido + uploads | `getCatalog*`, `getGalleries*`, `getFavorites`/`toggleFavorite`/`recordDownload`/`getDownloads`, `getContents`/CRUD, object storage | Mucho contenido (fotos reales del Drive). Lecturas públicas pesadas + uploads a R2/Spaces. |
| **F** | Publicidad self-serve + sponsors | `getSponsors`/CRUD, `getCreative`, `createCampaign`/`getCampaigns`/`getActiveCampaign` | Tercer flujo de pago (campaña). `getCreative` mezcla sponsors fijos + campañas activas: lógica delicada, mejor al final del lado público. |
| **G** | Auth admin + CRUD del organizador | gate de admin real + las mutaciones `create*/update*/delete*/decideApplication`/`updatePlan` | El admin escribe sobre lo de B–F. Necesita rol real (hoy acepta cualquier clave). Va al final porque consume todos los modelos ya migrados. |

Las **convocatorias** (`getConvocatoria`, `submitApplication`, `getApplications`, `decideApplication`) se reparten: lectura + submit (público) entra con E o como mini-fase entre F y G; `getApplications`/`decideApplication` son admin y entran en G.

---

## 2. Fase A — Identidad, perfil y analytics

**Métodos:** `getProfile`, `saveProfileFields(values, source)`, `saveConsents`, `track`, `getAnalytics`.
**Endpoints (ver doc de API):** `GET /me`, `PATCH /me/fields`, `PATCH /me/consents`, `POST /analytics` (ingesta batch de analytics), `GET /admin/analytics`. Recordá que todo cuelga de `/api/v1` (el cliente arma `base = VITE_API_URL + '/api/v1'`; `VITE_API_URL` NO incluye el prefijo).

- El `deviceId` ya existe en `lib/identity.ts` (UUID robusto con fallbacks). En modo remoto, ese mismo UUID viaja como `X-Device-Id` en **cada** request; el server hace upsert del device en el primer contacto.
- `track()` deja de escribir localStorage y manda `POST /analytics` (batch) con un array de `{ event, payload, ts, deviceId }`. **Batchear**: bufferear eventos y enviar cada N segundos o al `pagehide`/`visibilitychange` (igual que `lib/track.ts` ya bufferea en memoria). Un `track` perdido no debe romper nada → siempre fire-and-forget, nunca `await`, fallar en silencio. (Nada de `/events` ni `/api/track`: la ingesta canónica es `POST /api/v1/analytics`.)
- `getAnalytics()` solo lo consume el dashboard admin → puede quedar en `LocalDataStore` hasta la Fase G, o exponerse ya como `GET /admin/analytics` paginado (es la única colección con envoltorio paginado, ver doc de API §11).

**Riesgo:** bajo. Datos del propio device, sin reglas de negocio duras. El único cuidado es **PII** (`email`, `phone`, `dni`): no loggear payloads crudos en el server.
**Cómo se testea:** abrir la app con `VITE_API_URL` apuntando a staging, completar el perfil en un flujo (registro de charla) y verificar en la DB que el `source` quedó bien (`profile_field_captured`). Borrar localStorage y recargar → el perfil debe **volver del server** (prueba de que ya no depende del navegador). Abrir en otro navegador con el mismo `deviceId` (header forzado) → mismo perfil.
**Listo cuando:** un device creado en un navegador aparece en la tabla `Device` del server, su perfil persiste tras limpiar localStorage, y los eventos de analytics llegan al server (verificable en el dashboard, aunque el dashboard siga leyendo local).

---

## 3. Fase B — Eventos, bloques, inscripciones y cupos

**Métodos:** `getEvents/getEvent/getEventById`, `getBlocks/getBlock`, `blockAvailability`, `getRegistrations/isRegistered/register/cancelRegistration`.
**Endpoints:** `GET /events`, `GET /events/:slug`, `GET /events/:id/blocks`, `GET /blocks/:id/availability`, `GET /registrations` (del device), `POST /registrations`, `DELETE /registrations/:id`.

- **Cupo compartido = la razón de ser del backend.** Hoy `blockAvailability` suma `seedTaken + inscripciones locales`; en remoto el `taken` lo calcula el server (count de `Registration` confirmadas + el `seedTaken` migrado como base). El cliente NUNCA decide el cupo.
- `register()` es la primera mutación con regla de negocio real: el server valida cupo en una transacción (`SELECT ... FOR UPDATE` o `count` dentro de la tx) y devuelve `409 BLOCK_FULL` o `409 ALREADY_REGISTERED`. El `RemoteDataStore` traduce esos `code` a su retorno (`null` para lleno, igual que hoy).
- Optimistic update permitido pero **reconciliado**: si dos personas toman el último lugar a la vez, una recibe 409 y el caché se revierte.

**Riesgo:** medio. La condición de carrera del cupo es real y solo se ve con concurrencia. El bug clásico (oversell) no aparece en pruebas de un solo usuario.
**Cómo se testea:** bloque con `capacity: 2`, dos navegadores/incógnito, anotarse casi simultáneo (o un script que dispare 5 `POST /registrations` en paralelo) → exactamente 2 confirmadas, el resto `409`. Verificar que `GET /blocks/:id/availability` da `full: true`. Cancelar una → vuelve a haber 1 lugar y otro device puede entrar.
**Listo cuando:** dos navegadores ven el mismo `taken`, el cupo no se sobre-vende bajo carga concurrente, y una inscripción hecha en un device se ve reflejada en el conteo de otro device tras refetch.

---

## 4. Fase C — Entradas y pagos (Mercado Pago)

**Métodos:** `getPlans/getPlan`, `createOrder`, `markOrderRedirected`, `setOrderStatus`, `getOrders`.
**Endpoints:** `GET /plans`, `POST /orders` (con `Idempotency-Key`), `POST /orders/:id/redirected` (participio, marca `redirigida_mp`), `GET /orders` (del device), `POST /webhooks/mp` (webhook de Mercado Pago).

- **`createOrder` se `await`ea en el call-site** (`TicketSelector.tsx`): toda la interfaz es `Promise` (ver §0), y acá el `await` es obligatorio porque el checkout necesita el `init_point`/`preference_id` real de MP antes de redirigir. El server crea la `TicketOrder` en estado `iniciada`, llama a la API de MP para crear la preferencia, y devuelve la orden + URL de pago.
- **El cliente ya no calcula el `total`.** Hoy `LocalDataStore.createOrder` multiplica `(price + serviceCharge) * qty` en el browser; eso es manipulable. En remoto el **server** recalcula el total desde el `Plan` autoritativo. El front solo manda `planId` + `qty`.
- **`setOrderStatus('confirmada')` lo decide el WEBHOOK de MP, no el cliente.** El front nunca debe poder marcar una orden como pagada. `markOrderRedirected` (estado `redirigida_mp`) sí es del cliente. El paso `redirigida_mp → confirmada` ocurre server-side al recibir `payment.approved`. El `RemoteDataStore.getOrders()` refleja el estado real tras polling/refetch (la pantalla "Mis entradas" muestra "Confirmando…" hasta que el webhook llega).
- **Idempotencia obligatoria** (doble-tap, reintento de red): `Idempotency-Key` por intento; el webhook es idempotente por `payment.id`. Ver doc de API §0 y doc de pagos.

**Riesgo:** alto. Es dinero. Los modos de falla (doble cobro, orden confirmada sin pago, webhook perdido) son caros y silenciosos.
**Cómo se testea:** **sandbox de Mercado Pago** con tarjetas de prueba (aprobada/rechazada/pendiente). Flujo completo: crear orden → redirigir → pagar aprobado → verificar que el webhook llega a staging y mueve la orden a `confirmada`. Probar webhook rechazado (queda `iniciada`/`cancelada`). Probar idempotencia: doble `POST /orders` con la misma key → una sola orden. Simular webhook duplicado (mismo `payment.id`) → no duplica.
🔶 **[DECISIÓN ABIERTA — Gastón/Alan]** Cuenta de cobro de Mercado Pago (a nombre de quién entra la plata) y **precios reales** de los 5 planes (hoy `price` puede ser `null` = `PLAN_NOT_PURCHASABLE`). Sin esto, el flujo no se puede activar en prod.
**Listo cuando:** en sandbox un pago aprobado confirma la orden vía webhook, un doble-tap no genera dos órdenes, y el QR de acreditación de la entrada se genera contra una orden `confirmada` real.

### 4.bis 🔶 [DECISIÓN ABIERTA — Gastón/Alan] Rama alternativa: las entradas siguen en Tikealo

Si Gastón decide **no** mover la venta de entradas a MP y la mantiene en **Tikealo** (su ticketera actual), la Fase C cambia de forma: CCM **no procesa el pago**, solo necesita **emitir el QR de acreditación** para las entradas vendidas afuera. El modelo de acreditación (canon: doc 13) no cambia — sigue siendo `Ticket` + JWT firmado con `ACCREDITATION_TOKEN_SECRET` —, lo que cambia es el **disparador** de emisión y la **conciliación**. Diseño corto de la rama:

- **Endpoint de ingesta de venta externa:** `POST /api/v1/admin/external-tickets` (rol `OWNER`/`EDITOR`), que registra una venta hecha en Tikealo y emite el `Ticket` + `accreditationToken`. Payload: `{ externalRef (id de Tikealo), deviceId? (si lo conocemos), jornada, buyerEmail }`. El server crea un `Ticket { deviceId?, orderId: null, jornada, qrToken, checkedIn:false }` (sin `TicketOrder` propia, porque el pago vivió en Tikealo) y devuelve el JWT para el QR. Es un **cuarto disparador** de emisión, sumado a los dos canónicos (registro gratis confirmado + webhook MP `approved`): mismo final, `Ticket` + JWT.
- **Cómo llega la venta:** dos sub-opciones a definir con Gastón — (a) **webhook de Tikealo** (si lo expone) → un `POST /api/v1/webhooks/tikealo` que mapea a `external-tickets`; (b) **import batch** de un CSV/export de Tikealo que el admin sube y el server procesa idempotente por `externalRef`.
- **Entrega del QR al comprador:** como el pago no pasó por CCM, el QR se manda por **email** (Resend) al `buyerEmail` que vino de Tikealo, o se muestra al asociar el `deviceId` en la app. El `Ticket` puede existir sin `deviceId` y vincularse después cuando esa persona abre la PWA con el mismo email.
- **Conciliación:** idempotencia por `externalRef` (no emitir dos QR para la misma venta de Tikealo); un reporte admin que cruza ventas de Tikealo vs `Ticket` emitidos para detectar faltantes/duplicados antes del evento. El check-in en puerta es idéntico a la rama MP (`POST /api/v1/admin/checkin`, rol `STAFF`, validación online contra DB / offline contra la firma del JWT — doc 13).
- **Qué se simplifica:** en esta rama no hay `TicketOrder`/`Payment` de tipo `ticket_order` ni webhook MP para entradas; el motor MP queda solo para **membresía** (Fase D) y **publicidad** (Fase F). El resto de la Fase C (planes como catálogo informativo, idempotencia, conciliación) se reduce a la emisión de acreditación.

**Decisión pendiente:** Gastón confirma si entradas = MP (rama principal, §4) o entradas = Tikealo (esta rama). El resto del backend no se entera: ambos caminos terminan en `Ticket` + JWT de acreditación.

---

## 5. Fase D — Membresía Socio CCM

**Métodos:** `getMembership`, `isSocio`, `becomeSocio(paid)`.
**Endpoints:** `GET /me/membership`, `POST /me/membership` (con `Idempotency-Key`), webhook compartido con C.

- Mismo motor de pago que C. `becomeSocio` se `await`ea en el botón de membresía (toda la interfaz es `Promise`, ver §0). La membresía se activa por **webhook de MP**, igual que la orden; el cliente no se auto-promueve a socio.
- `isSocio()` es derivado (no pega a la red): lee del caché de `getMembership()`. Importa porque hay contenido y eventos `socioOnly` que el front gatea visualmente — pero el **gate real es server-side** (un `GET` de contenido `socioOnly` sin membresía devuelve `403 SOCIO_ONLY`). El front no debe ser la única barrera.

**Riesgo:** medio (es pago, pero el flujo ya está probado en C).
**Cómo se testea:** sandbox MP, comprar membresía, verificar `tier: 'socio'` tras webhook, y que el contenido `socioOnly` deja de dar 403.
🔶 **[DECISIÓN ABIERTA — Gastón]** Precio de la membresía y qué incluye cada nivel (la app habla de "niveles de suscripción" pero el modelo hoy es binario `free`/`socio`). Si hay más de un nivel, cambia el tipo `MembershipTier` y el modelo.
**Listo cuando:** una compra real en sandbox vuelve socio al device y desbloquea contenido `socioOnly` validado server-side.

---

## 6. Fase E — Catálogo, galerías, contenido y uploads

**Métodos:** `getCatalog/getCatalogProfile`, `getGalleries/getGallery`, `getFavorites/toggleFavorite/recordDownload/getDownloads`, `getContents`.
**Endpoints:** `GET /catalog`, `GET /catalog/:slug`, `GET /galleries`, `GET /galleries/:slug`, `GET /contents`, `GET /favorites`, `PUT/DELETE /favorites/:photoId`, `POST /downloads`, + **uploads** `POST /admin/uploads/sign` (presigned URL a R2/Spaces).

- **Lecturas pesadas, públicas, cacheables.** Catálogo y galerías son las colecciones más grandes (las fotos reales del evento). El `RemoteDataStore` las cachea agresivo; el server puede poner `Cache-Control` y servir las imágenes desde el CDN del object storage, no desde el dyno.
- **Object storage S3-compatible (R2 / Spaces).** Las imágenes (`gallery.photos[].src`, `catalogProfile.photo`, `portfolio[].image`) NO van en Postgres. El flujo de subida (lo usa el admin en Fase G, pero el modelo de datos se define acá): el server firma un `PUT` presigned, el cliente sube directo al bucket, y guarda solo la URL pública en la DB. El seed actual usa rutas relativas bajo `BASE_URL` (`/ccm-app/...`); al migrar, esas imágenes del seed se suben una vez al bucket y se reemplaza la URL (ver §8).
- `toggleFavorite`/`recordDownload` son del device → `X-Device-Id`. `recordDownload` alimenta `photo_download` (importa para el valor que se le vende al sponsor de la galería).

**Riesgo:** bajo-medio. El riesgo no es la lógica sino el **volumen de imágenes** y el costo/latencia si se sirven mal (desde el dyno en vez del CDN).
**Cómo se testea:** medir tamaño/tiempo de `GET /galleries` con las fotos reales; verificar que las imágenes salen del bucket/CDN (no del API). Subir una foto vía presigned URL y confirmar que queda accesible por su URL pública. Favoritos y descargas se reflejan cross-device.
🔶 **[DECISIÓN ABIERTA — Alan]** R2 vs DigitalOcean Spaces (costo/egress vs Railway ya en DO-friendly). 🔶 **[DECISIÓN ABIERTA — Gastón]** Acceso al Drive con las fotos reales y a los videos de YouTube (IDs) para el seed→prod.
**Listo cuando:** las galerías reales cargan rápido desde el CDN, una imagen nueva se sube por presigned URL, y favoritos/descargas persisten en el server por device.

---

## 7. Fase F — Publicidad self-serve y sponsors

**Métodos:** `getSponsors/getSponsor`, `getCreative(slot, index)`, `createCampaign`, `getCampaigns`, `getActiveCampaign(slot)`.
**Endpoints:** `GET /sponsors`, `GET /creatives/:slot`, `POST /campaigns` (con `Idempotency-Key`), `GET /campaigns`.

- `getCreative(slot)` tiene **lógica de prioridad** delicada (ver `LocalDataStore`): una **campaña autogestionada activa** para el slot le gana al sponsor fijo en `index 0`; los sponsors fijos rotan en el resto. Esa resolución debe vivir **server-side** (`GET /creatives/:slot` devuelve `{ sponsor, creative }` ya resuelto) para que el cliente no la reimplemente. La "campaña como sponsor sintético" (`campaignSponsor`) es un detalle de presentación que el server expone tal cual.
- `createCampaign` es el **tercer flujo de pago** → mismo motor que C/D, se `await`ea en la compra de publicidad (interfaz `Promise`, ver §0), idempotencia, webhook. La campaña se vuelve `activa` recién con pago confirmado (hoy en la demo se considera activa al crearla — eso cambia: `pendiente_pago` hasta el webhook; ver el enum `CampaignStatus { pendiente_pago, activa, expirada, rechazada }` del modelo de datos).
- `getActiveCampaign(slot)` necesita una noción real de **vigencia**: hoy "la última comprada gana"; en prod filtra `status='activa'` AND `now` entre `startsAt` y `expiresAt` (campos `DateTime?` del modelo de datos; nada de `activeFrom/activeTo` ni un flag booleano `paid`). El slot self-serve admite **una campaña `activa` por slot a la vez** (constraint único + transacción, mismo patrón que el cupo de bloque). 🔶 **[DECISIÓN ABIERTA — Gastón]** Reglas de exclusividad/solapamiento: ¿qué pasa si dos marcas compran el mismo slot para ventanas que se pisan? (`SLOT_OCCUPIED` ya está previsto en el doc de API).

**Riesgo:** medio. Mezcla pago + lógica de selección de creatividad + vigencia temporal.
**Cómo se testea:** comprar una campaña en sandbox, verificar que tras webhook pasa a `status='activa'` y ocupa el slot desplazando al sponsor fijo, y que al pasar `expiresAt` el slot vuelve al sponsor fijo. `ad_impression`/`ad_click` siguen registrándose contra el sponsor sintético correcto.
**Listo cuando:** una campaña pagada en sandbox aparece en su slot durante su ventana, se mide su impression/click, y libera el slot al vencer.

---

## 8. Fase G — Auth admin y CRUD del organizador

**Métodos:** todo `create*/update*/delete*` de eventos, bloques, galerías, sponsors, catálogo, contenido; `updatePlan`; `getApplications`/`decideApplication`; `getAnalytics`.
**Endpoints:** `POST /admin/auth/...` (login passwordless de organizador), y los `POST/PATCH/DELETE /admin/*` de cada recurso.

- **Hoy el gate de admin acepta cualquier clave** (demo). En real: login de admin con **rol** (OTP por email, coherente con el passwordless del resto). `AdminUser.role` es el enum `AdminRole { OWNER, EDITOR, STAFF, VIEWER }` (ver doc de auth); `STAFF` = personal de puerta que solo escanea QR. El `adminJWT` se firma con `ADMIN_TOKEN_SECRET` (uno de los tres secretos JWT separados — `DEVICE_TOKEN_SECRET`/`ADMIN_TOKEN_SECRET`/`ACCREDITATION_TOKEN_SECRET`, nunca un único `JWT_SECRET`), viaja en `Authorization: Bearer` y el server exige rol en todo `/admin/*` (`403 ADMIN_REQUIRED`).
- El `RemoteDataStore` necesita poder guardar/mandar el `adminJWT`. La forma más limpia: el admin usa el **mismo `RemoteDataStore`** pero con el token en un header inyectado tras el login; o un thin wrapper que solo agrega el header a las rutas `/admin`.
- Estas mutaciones son las que hoy disparan los `track('admin_*')`. Esos eventos deben seguir generándose (server-side ahora) para el dashboard.
- El **dashboard del admin** acá sí estrena el patrón de **polling con TanStack Query** sobre `GET /admin/analytics` y los listados, en vez de leer del caché del `RemoteDataStore`. (El resto de la app no cambia.)

**Riesgo:** medio-alto. Es la superficie de escritura privilegiada; un fallo de auth acá expone CRUD destructivo. La regla: ningún `/admin/*` sin rol verificado.
**Cómo se testea:** intentar un `POST /admin/events` sin token → `401`; con token de device (no admin) → `403`; con admin → `201`. Crear/editar/borrar un evento desde el panel y verlo reflejado en el front público de otro navegador.
🔶 **[DECISIÓN ABIERTA — Gastón/Alan]** Quiénes son los admins (emails) y a qué rol del enum `AdminRole` mapea cada uno (OWNER/EDITOR/STAFF/VIEWER) — ej. quién es `OWNER` (toca pagos), quién `EDITOR` (carga contenido), quién `STAFF` (solo escanea QR en puerta).
**Listo cuando:** solo un organizador autenticado puede mutar, y un cambio del admin se ve en el front real de otro dispositivo.

---

## 9. Estrategia de doble modo, store híbrido y rollback

El interruptor global `VITE_API_URL` es el rollback más grueso: sin la env, todo vuelve a `LocalDataStore`. Pero entre fases necesitamos **granularidad por dominio**: la Fase B remota mientras C–G siguen locales.

**Patrón: `HybridDataStore` por feature flag.** Un store que delega cada grupo de métodos a `RemoteDataStore` o `LocalDataStore` según una flag de dominio (env o config remota):

```ts
// conceptual — un decorador que rutea por dominio
const remote = new RemoteDataStore(API)
const local = new LocalDataStore()
export const store: DataStore = API ? makeHybrid({
  identity: flags.A ? remote : local,   // Fase A
  events:   flags.B ? remote : local,   // Fase B
  payments: flags.C ? remote : local,   // ...
  // ...
}) : local
```

Esto permite:
- **Activar un dominio por vez** en prod sin re-deployear el resto.
- **Rollback quirúrgico:** si la Fase C (pagos) se rompe en prod, apagás solo `payments` y vuelve a mock, sin tocar B ni A. Como el front es estático en GH Pages, la flag debe poder venir de una **config remota** (`GET /config`) o de un re-deploy rápido — un re-deploy de GH Pages tarda; tener `GET /config` que el front lee al arrancar permite apagar un dominio sin re-build.

🔶 **[DECISIÓN ABIERTA — Alan]** Flags por env (requieren re-build del front) vs `GET /config` runtime (apagado instantáneo sin re-deploy). Para los dominios de pago, runtime es muy recomendable.

**Coexistencia de datos:** mientras un dominio está local y otro remoto, ojo con las **referencias cruzadas** (ej. `Order` remota referencia `Plan` que todavía sale del seed local). Por eso el orden de fases pone primero las dependencias (A antes que C; planes/eventos antes que sus pagos).

---

## 10. Seed → prod: migrar el contenido real

El seed actual (`src/data/seed/*.ts`) es la fuente de verdad de la demo: eventos, bloques, catálogo, galerías, sponsors, contenidos, convocatorias, applications y un histórico de analytics para que el dashboard no nazca vacío. Hay que separar **qué del seed es contenido real que se migra** y **qué es relleno de demo que se descarta**.

| Seed | Acción en prod |
|---|---|
| `events.ts`, `blocks.ts` | **Migrar** la grilla real del evento (con `seedTaken` como base del cupo) tras confirmarla con Gastón. |
| `plans.ts` (config) | **Migrar** los 5 planes; los `price` `null` se completan con los reales. |
| `catalog.ts` | **Migrar** los expositores reales; las fotos suben a R2/Spaces (Fase E). |
| `galleries.ts` | **Migrar** desde el **Drive de Gastón** (🔶 falta acceso); subir imágenes al bucket, no rutas `BASE_URL`. |
| `contents.ts` | **Migrar** los `youtubeId` reales del canal de Gastón. |
| `sponsors.ts` | **Migrar** los sponsors reales y sus niveles/exclusividad. 🔶 [DECISIÓN ABIERTA — Gastón] |
| `convocatorias.ts` | **Migrar** las convocatorias vigentes. |
| `applications.ts` | **Descartar** (son postulaciones inventadas). En prod nace vacío. |
| `analytics.ts` | **Descartar** o marcar `seed: true` y NO contarlas como métricas reales. El dashboard de prod arranca con datos reales desde el primer device. |

**Mecánica:** un **script `prisma/seed.ts`** (idempotente, `upsert` por id/slug) que lee los `seed/*.ts` actuales (mismos tipos TS, cero traducción — esto es el upside de TS end-to-end) y los inserta en Postgres. Las imágenes se procesan en un paso aparte: subir a bucket → reescribir URL → upsert. El script corre una vez contra **staging** para validar, y luego contra **prod** ya con el contenido confirmado por Gastón. Ids estables (mismos del seed) para que las referencias (`sponsorId`, `eventId`) no se rompan.

> Importante: el seed sirve **para popular la DB**, no para que el front lo siga leyendo. Una vez en prod con `VITE_API_URL`, el front lee del API; el seed solo sobrevive como fallback del `LocalDataStore` (demo offline).

---

## 11. Staging y proceso de prueba por fase

- **Entorno staging en Railway** = misma topología que prod (servicio + Postgres + bucket de pruebas) pero con MP en **sandbox** y datos descartables. URL propia (ej. `ccm-api-staging.up.railway.app`).
- **Front contra staging:** un build/preview del front con `VITE_API_URL=<staging>` (o el branch `gh-pages` de un repo de pruebas). No tocar el GH Pages de prod hasta que la fase pase.
- **Por cada fase, el ritual:** (1) migración Prisma + endpoints en staging; (2) activar la flag de ese dominio en el front-staging; (3) correr el guion de prueba de la fase (los "Cómo se testea" de arriba); (4) revisar que los **otros dominios siguen funcionando** (no regresión por el store híbrido); (5) recién ahí, activar la flag en prod (idealmente vía `GET /config`, sin re-build).
- **Pruebas de concurrencia** (Fase B cupos, Fase C idempotencia): scripts que disparan N requests en paralelo, no clicks manuales — el oversell y el doble cobro no se ven de a uno.
- **Smoke test de fallback:** apagar el API (o `VITE_API_URL` vacío) y confirmar que la app no se rompe (vuelve a `LocalDataStore`). Es la red de seguridad si Railway se cae el día del evento.

---

## 12. Criterio de "migración terminada"

1. Con `VITE_API_URL` apuntando a prod, las 7 fases corren contra el backend; sin la env, la app sigue funcionando offline (fallback intacto).
2. Un socio que paga (sandbox→prod) aparece en el panel del admin **de verdad**; el QR de acreditación valida en puerta (`POST /api/v1/admin/checkin`, rol `STAFF`) contra un `Ticket` real (emitido por registro gratis confirmado, por webhook MP `approved`, o por la rama Tikealo — §4.bis).
3. El cupo de las charlas no se sobre-vende bajo carga.
4. La migración a la interfaz async no rompió pantallas: las lecturas pasaron a `useQuery`/TanStack Query y las 3 mutaciones de pago (`createOrder`/`becomeSocio`/`createCampaign`) se `await`ean en su call-site; el resto sigue contra la misma costura `store`.
5. El contenido real (eventos, fotos del Drive, videos, sponsors) está migrado y servido desde el API/CDN.
6. Cada dominio de pago se puede apagar en caliente (rollback runtime) sin re-deployear el front.

---

## 13. Resumen de DECISIONES ABIERTAS de este plan

> Nota: la interfaz `DataStore` async (Promise) **ya NO es decisión abierta** — está tomada (ver §0). `LocalDataStore` envuelve sync en `Promise.resolve`; los call-sites a `await` son `createOrder` (TicketSelector), `becomeSocio` (botón membresía) y `createCampaign` (compra de publicidad).

- 🔶 **Entradas vía MP (§4) vs entradas en Tikealo (§4.bis)** (Gastón/Alan) — define el disparador de emisión del QR; el resto del backend es igual en ambas ramas.
- 🔶 Precios reales de los 5 planes + cuenta de cobro de Mercado Pago (Gastón/Alan) — §4.
- 🔶 Precio y niveles de la membresía Socio (Gastón) — §5.
- 🔶 R2 vs DigitalOcean Spaces para imágenes (Alan); acceso al Drive de fotos y a los YouTube IDs (Gastón) — §6/§10.
- 🔶 Reglas de exclusividad/solapamiento de campañas y `SLOT_OCCUPIED` (Gastón) — §7.
- 🔶 Emails de los admins y a qué rol del enum `AdminRole` mapea cada uno (Gastón/Alan) — §8.
- 🔶 Feature flags por env (re-build) vs `GET /config` runtime (apagado instantáneo) (Alan) — §9.
- 🔶 Sponsors reales y su nivel/exclusividad para el seed→prod (Gastón) — §10.
