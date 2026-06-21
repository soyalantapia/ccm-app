# Estado actual de la arquitectura

Cómo está construida hoy la app de CCM (Fase 0, 100% frontend) y por qué la migración a backend es de bajo riesgo: hay **una sola costura** — la interfaz `DataStore` — y todo lo demás (pantallas, reactividad, identidad, analytics) ya está cableado contra esa abstracción.

---

## 1. Stack frontend exacto

Sacado de `package.json`, `vite.config.ts` y `tsconfig`:

- **Build:** Vite 8 (`vite@^8.0.12`), `tsc -b && vite build` (type-check estricto antes de bundlear).
- **UI:** React 19 (`react@^19.2.6` + `react-dom`), TypeScript ~6.0, Tailwind v4 vía plugin `@tailwindcss/vite` (sin `tailwind.config.js`, config en CSS).
- **Routing:** `react-router-dom@^7.17.0`. El `basename` sale del entorno: en `src/App.tsx` se crea el router con `{ basename: import.meta.env.BASE_URL.replace(/\/$/, '') }` → respeta el base path `/ccm-app/`.
- **PWA:** `vite-plugin-pwa@^1.3.0` con `registerType: 'prompt'` (el SW nuevo queda en espera; un banner dispara `needRefresh` → "Actualizar" controlado, no swap silencioso). Shell offline precacheado (JS/CSS/woff2/svg/icons), fotos y video con `CacheFirst` en runtime.
- **Otras deps de peso:** `qrcode` (genera el QR de acreditación en cliente), `lucide-react` (íconos), fuentes self-hosted `@fontsource-variable/*`.
- **Tooling de assets (build-time, Node):** `sharp` + scripts en `scripts/` (`fetch-images.mjs`, `optimize-images.mjs`, `make-icons.mjs`, `make-og.mjs`).

**No hay ninguna dependencia de cliente HTTP** (`fetch`/axios/react-query) ni de servidor. El único uso de entorno en `src/` es `import.meta.env.BASE_URL` (2 ocurrencias: `App.tsx` y `lib/assets.ts`). **No existe `VITE_API_URL` todavía** — es lo primero que se agrega en Fase 1.

---

## 2. El patrón `DataStore` → `LocalDataStore` → seed + localStorage

Esta es **la** decisión arquitectónica que hace barata la migración. La regla es absoluta: **ninguna pantalla toca localStorage, seed ni identity directamente.** Todo pasa por el singleton `store`.

### 2.1 La interfaz (`src/data/store/DataStore.ts`)

`DataStore` es una interfaz TypeScript de ~50 métodos que cubre **todo el dominio** del producto, agrupados por área:

```ts
export interface DataStore {
  // Perfil / identidad
  getProfile(): DeviceProfile
  saveProfileFields(values, source): void
  saveConsents(consents): void
  // Membresía
  getMembership(): Membership; isSocio(): boolean; becomeSocio(paid): Membership
  // Eventos / bloques / inscripciones
  getEvents() / getEvent(slug) / createEvent / updateEvent / deleteEvent
  getBlocks(eventId) / blockAvailability(blockId) / register / cancelRegistration ...
  // Planes y órdenes (entradas)
  getPlans / updatePlan / createOrder / markOrderRedirected / setOrderStatus / getOrders
  // Catálogo, fotos, contenido, sponsors, campañas, convocatorias, analytics
  ...
}
```

El doc-comment de la propia interfaz ya describe el plan:

```ts
/**
 * DataStore — única puerta de acceso a datos de TODA la UI (patrón repositorio).
 * Fase 0: seed estático + localStorage. Fase 1: se enchufa un backend real
 * implementando esta misma interfaz, sin tocar pantallas.
 */
```

Detalle clave para el backend: la interfaz expone **tipos de alta** que dejan que el store genere `id`/`slug`/`ts`: `NewEvent = Omit<EventItem,'id'|'slug'> & { slug?: string }`, `NewBlock`, `NewGallery`, `NewSponsor`, `NewCatalogProfile`, `NewContent`, `NewCampaign`. O sea: **la generación de identificadores ya es responsabilidad del store, no de la UI.** El backend hereda esa responsabilidad sin cambiar firmas.

### 2.2 La implementación actual (`src/data/store/LocalDataStore.ts`)

`class LocalDataStore implements DataStore`. Combina tres fuentes:

1. **Seed estático e inmutable** — módulos en `src/data/seed/` (`events`, `blocks`, `catalog`, `galleries`, `sponsors`, `contents`, `convocatorias`, `applications`, `analytics`) + `seedPlans` en `src/config/plans.ts`. Son arrays TS importados; nunca se mutan.
2. **localStorage** — vía helpers `readJSON`/`writeJSON`/`newId` de `src/lib/storage.ts`. Todas las claves llevan prefijo `ccm:`. El set de claves está centralizado en el objeto `K` arriba del archivo (`registrations`, `orders`, `favorites`, `downloads`, `applications`, `applicationOverrides`, `planOverrides`, `*Overlay`, `campaigns`, `membership`).
3. **Overlay** — la capa de edición sobre el seed (sección 3).

Dos estrategias de persistencia conviven, y **esto importa para el modelo de datos del backend**:

- **Colecciones que solo el usuario crea** (no existen en seed) → array plano en una clave: `registrations`, `orders`, `downloads`, `favorites`, `campaigns`, y las `applications` locales. Ejemplo `register()`:
  ```ts
  writeJSON(K.registrations, [...this.getRegistrations(), registration])
  this.track('registration_created', { eventId, blockId: blockId ?? null })
  ```
- **Colecciones que vienen del seed pero el admin edita** → patrón **overlay** (eventos, bloques, galerías, sponsors, catálogo, contenido). Y dos casos de *override puntual*: `planOverrides` (precio/`mpLink` por plan) y `applicationOverrides` (status + `decidedAt` por postulación), que sobreescriben campos del seed sin duplicar el registro entero.

Particularidades de dominio ya resueltas que el backend debe respetar:
- **`blockAvailability(blockId)`** mezcla `seedTaken` (cupo ya tomado en el mundo real) + inscripciones locales confirmadas, clampeado a `capacity`. La fórmula de cupo ya está acá.
- **Campañas autogestionadas como sponsor sintético:** `campaignSponsor(c)` convierte un `AdCampaign` en un `Sponsor` efímero para ocupar un slot (`getCreative`) y poder medirlo. Una campaña comprada para un slot tiene **prioridad** sobre los sponsors fijos en `index === 0`.
- **`createOrder`** ya calcula `total = (price + serviceCharge) * qty` y rellena `buyerName`/`buyerEmail` desde el perfil del dispositivo.

---

## 3. El sistema de overlay para el CRUD del admin (`src/data/store/overlay.ts`)

El admin necesita crear/editar/borrar entidades que vienen del seed, **sin poder mutar el seed** (es código). La solución es un diff persistido por colección:

```ts
export interface Overlay<T> {
  created: T[]                       // altas nuevas
  edited: Record<string, Partial<T>> // parches por id
  deleted: string[]                  // ids tachados (seed o creados)
}
```

`mergeOverlay(seed, key)` reconstruye la colección efectiva en cada lectura:

```ts
export function mergeOverlay<T extends { id: string }>(seed, key): T[] {
  const ov = readOverlay<T>(key)
  const deleted = new Set(ov.deleted)
  const fromSeed = seed
    .filter((s) => !deleted.has(s.id))
    .map((s) => (ov.edited[s.id] ? { ...s, ...ov.edited[s.id] } : s))
  const created = ov.created
    .filter((c) => !deleted.has(c.id))
    .map((c) => (ov.edited[c.id] ? { ...c, ...ov.edited[c.id] } : c))
  return [...fromSeed, ...created]
}
```

Las tres mutaciones (`overlayCreate`, `overlayEdit`, `overlayDelete`) son lo bastante astutas como para que `overlayEdit` parchee in-place un item recién creado (en `created`) en vez de duplicarlo en `edited`, y `overlayDelete` saque de `created` o agregue a `deleted` según corresponda. `slugify()` (con normalización NFD para acentos) vive acá también.

**Lecturas con overlay** en `LocalDataStore`: `getEvents`, `getBlocks`, `getCatalog`, `getGalleries`, `getContents`, `getSponsors` — todas son `mergeOverlay(seedX, K.xOverlay)`.

**Qué significa esto para el backend:** el overlay es un *parche* para no tener servidor; con backend **desaparece** la distinción seed/overlay. El RemoteDataStore hace `GET /events` (lista canónica), `POST /events`, `PATCH /events/:id`, `DELETE /events/:id`. El seed se convierte en el **dataset inicial de la migración** (un `prisma db seed` que carga los eventos/sponsors/galerías reales de la 14ª edición). El backend hereda dos contratos del overlay: (a) borrado en cascada (`deleteEvent` ya borra sus bloques — ver `LocalDataStore.deleteEvent`), y (b) la deduplicación de slug (`createEvent`/`createGallery`/`createCatalogProfile` ya buscan colisiones y sufijan `-2`, `-3`).

---

## 4. Reactividad: bus + `useSyncExternalStore` (`src/data/store/index.ts`, `src/lib/bus.ts`)

El singleton y la reactividad viven en `src/data/store/index.ts`:

```ts
export const store: DataStore = new LocalDataStore()  // ← único punto de cambio en Fase 1

let version = 0
const subscribers = new Set<() => void>()
bus.on(() => { version++; subscribers.forEach((n) => n()) })

export function useStore<T>(selector: (s: DataStore) => T): T {
  const v = useDataVersion()                       // useSyncExternalStore(subscribe, () => version)
  return useMemo(() => selector(store), [v])       // recalcula ante cualquier escritura
}
```

El mecanismo:

1. **Toda escritura emite en el bus.** `writeJSON(key, value)` (en `lib/storage.ts`) hace `localStorage.setItem(...)` y luego `bus.emit(key)`. No hay forma de escribir sin notificar.
2. **El bus** (`lib/bus.ts`) es un `Set<Handler>` minúsculo. Cada `emit` incrementa `version` y dispara los subscribers.
3. **`useStore(selector)`** usa `useSyncExternalStore` sobre `version`; cualquier escritura re-evalúa el selector. Las pantallas se escriben como `const events = useStore((s) => s.getEvents())` y se actualizan solas.

### 4.1 "Tiempo real" entre pestañas (sin backend)

El bus también se **puentea con el evento nativo `storage`** del navegador:

```ts
// lib/bus.ts
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('ccm:')) bus.emit(e.key.slice(PREFIX.length))
})
```

El evento `storage` dispara en *otras* pestañas del mismo origen cuando una escribe en localStorage. Resultado: el **dashboard del admin abierto en una pestaña se actualiza en vivo** cuando un usuario compra una entrada / se inscribe / descarga una foto en otra pestaña. Es la ilusión de "tiempo real" que en Fase 1 reemplaza el **polling con TanStack Query** (decisión fijada), y más adelante eventualmente SSE/WebSocket.

`bus.emit` admite además un `detail` arbitrario; se usa para eventos de UI puros que no tocan storage, p. ej. `bus.emit('ui:profile-request', request)` (sección 5).

---

## 5. Identidad por `deviceId` (`src/lib/identity.ts`)

Identidad **sin contraseña**: el dispositivo *es* la cuenta. Coherente con la auth passwordless decidida para el backend.

- En la primera visita, `ensureDevice()` crea un `DeviceProfile` con `deviceId: \`dev-${uuid().slice(0,13)}\``, lo persiste en `ccm:profile` y emite `track('user_created', { deviceId })`.
- `uuid()` es **a prueba de balas**: usa `crypto.randomUUID()`, cae a `crypto.getRandomValues()` y, en último recurso, a `Math.random()` — para no romper la app servida por `http`/LAN/`file://` (donde `crypto.randomUUID` lanza por no ser contexto seguro).
- **Captura progresiva de datos** (= oro para segmentación): `saveProfileFields(values, source)` guarda cada campo con `{ value, capturedAt, source }`. El gate `requireProfile(fields, action, opts)` (`lib/profileRequest.ts`) resuelve `true` al instante si los campos ya están, o abre un sheet pidiendo **solo los faltantes** (`missingFields`). Cada captura nueva emite `profile_field_captured`. Campos: `firstName, lastName, email, profession, phone, dni, city, instagram`.
- **PII sensible**: `email`, `phone`, `dni`. El backend debe tratarlos con cuidado (cifrado en reposo / minimización / consentimiento). Los consentimientos ya se modelan: `saveConsents({ terms, news, sponsors })` guarda timestamps.
- **QR de acreditación**: `qrToken()` deriva un token estable y verificable offline del `deviceId`: `CCM26-<idMayúsc>-<hash36>`. Hoy es **puramente local y no verificable server-side** — cualquiera puede inventar un token con el formato correcto.

**Qué significa esto para el backend:**
- 🔶 **[DECISIÓN ABIERTA]** Cómo se vincula el `deviceId` (anónimo, generado en cliente) con una identidad de servidor. Opciones: el cliente envía su `deviceId` y el backend hace upsert de un `Device`; o se sube a auth passwordless por email/OTP (al estilo PIN de Norte) cuando el usuario da su email. Hay que decidir si el `deviceId` viaja como credencial (bearer) o solo como atributo.
- 🔶 **[DECISIÓN ABIERTA]** El QR de la puerta. Para que **sirva en la acreditación real** el token debe ser verificable y no falsificable (firmado por el server / consultado contra la base). El `qrToken()` actual es un placeholder de UI; el formato puede conservarse pero la verificación tiene que ser server-side.

---

## 6. Event bus de analytics y dashboard "en vivo" (`src/lib/track.ts`)

First-party analytics, taxonomía ya **final** (el código lo declara: *"the taxonomy and payloads are final — Fase 1 swaps storage for the backend"*).

- `track(event, payload?)` arma un `AnalyticsEvent { id, event, ts, deviceId, payload? }` y lo appendea a `ccm:analytics` (capado a `MAX_EVENTS = 3000`). Al escribir vía `writeJSON`, **emite en el bus** → el dashboard se actualiza al instante.
- `store.track()` delega en este `track`; `store.getAnalytics()` devuelve `[...seedAnalytics, ...getLocalAnalytics()]` ordenado por `ts` (el seed da volumen "histórico" a la demo).
- Eventos ya emitidos por `LocalDataStore` (mapean 1:1 a los flujos de negocio): `user_created`, `profile_field_captured`, `registration_created`/`_cancelled`, `ticket_order_created`/`_redirected_mp`/`_confirmed`, `membership_purchased`, `ad_campaign_purchased`, `photo_favorite`, `photo_download`, `application_submitted`/`_accepted`/`_rejected`, y la familia `admin_*_created/updated/deleted`.

**Qué significa esto para el backend:** el dashboard del organizador (panel `/admin`) ya consume `getAnalytics()`. En Fase 1 el `track()` del RemoteDataStore hace `POST /events` (o batch) y el dashboard lee `GET /analytics` con polling. El **límite de 3000 eventos** y el cap deja de existir server-side; el cliente ya no recorta. El export CSV (mencionado en el dominio) pasa a ser un endpoint.

---

## 7. Deploy gh-pages y manejo de assets / BASE_URL

- **Deploy:** dos caminos. Manual: `npm run deploy` = `build` + `gh-pages -d dist`. Automático: `.github/workflows/deploy.yml` publica `dist` en GitHub Pages en cada push a `main` (Node 22, `actions/deploy-pages@v4`).
- **Base path:** `base: '/ccm-app/'` en `vite.config.ts`. Se propaga a routing (`basename`), al `start_url`/`scope` del manifest PWA y al `navigateFallback` del Workbox.
- **Assets:** el seed guarda rutas **relativas** (`'img/gallery/g01.jpg'`). La UI **siempre** las resuelve con `asset(path)` (`lib/assets.ts`), que antepone `import.meta.env.BASE_URL`. Por eso mover el base path o el dominio es un cambio de una variable.
- **SPA fallback + previews OG:** el plugin `spaFallback()` copia `index.html` a `404.html` (deep-links funcionan en Pages) y **prerenderiza un `<ruta>.html` por sección** (`app`, `admin`, `sponsors`, `eventos`, `entradas`) con sus meta OG, para que WhatsApp/redes muestren preview sin ejecutar JS.

**Qué significa esto para el backend:**
- 🔶 **[DECISIÓN ABIERTA]** Si el frontend **se queda en GitHub Pages** (estático) y consume el API de Railway vía `VITE_API_URL` con CORS — que es lo decidido por defecto — o si se mueve a un host con SSR. Quedándose en Pages: hay que (a) crear `VITE_API_URL`, (b) configurar CORS en el API para `https://soyalantapia.github.io`, (c) decidir manejo de cookies/credenciales cross-origin (mejor `Authorization: Bearer` que cookies, por el origen distinto).
- 🔶 **[DECISIÓN ABIERTA]** Dominio propio (afecta base path, OG `SITE`, CORS y manifest).
- Las imágenes subidas por el admin (galerías de fotos, logos/portfolios) hoy **no existen** como upload real — el seed apunta a archivos en `public/`. En Fase 1 van a **object storage S3-compatible** (R2 / Spaces, decidido); el campo `src`/`photo`/`image` pasa a ser una URL absoluta de CDN, y `asset()` deja de aplicarse a esos campos.

---

## 8. Auth del admin (estado demo)

El gate del panel (`src/components/layout/AdminLayout.tsx`, `AdminGate`) acepta **cualquier clave** y guarda `sessionStorage['ccm:admin'] = '1'`:

```ts
const submit = (e: FormEvent) => {
  e.preventDefault()
  // Demo: cualquier clave habilita el panel (la auth real llega en Fase 1).
  sessionStorage.setItem('ccm:admin', '1')
  onUnlock()
}
```

**Qué significa esto para el backend:** se reemplaza por **auth de organizador con rol** (passwordless / sesión). Hoy *toda* la superficie de escritura del admin (`createEvent`, `updateSponsor`, `setOrderStatus`, `decideApplication`, etc.) corre en el cliente sin autorización: en Fase 1 esos métodos del DataStore pasan a endpoints que exigen rol `organizer`. El `sessionStorage['ccm:admin']` se convierte en un token de sesión real.

---

## 9. Qué significa todo esto para el backend: la interfaz `DataStore` es el único punto de integración

La migración a backend **no toca pantallas**. El plan completo en una línea:

```ts
// src/data/store/index.ts — HOY
export const store: DataStore = new LocalDataStore()

// FASE 1 — conmutable por env, con fallback (decisión fijada)
export const store: DataStore = import.meta.env.VITE_API_URL
  ? new RemoteDataStore(import.meta.env.VITE_API_URL)
  : new LocalDataStore()
```

Por qué el riesgo es bajo:

1. **Una sola costura.** Todas las pantallas consumen `useStore((s) => s.getX())` o `store.doX()`. No hay acceso directo a `localStorage`/seed/identity desde la UI. Implementar `RemoteDataStore implements DataStore` y cambiar el singleton es **el** cambio.
2. **Los tipos del dominio ya son el contrato.** `src/data/types.ts` (entidades) + `DataStore.ts` (métodos) + los tipos `New*` (qué genera el server) definen el shape del API. El esquema Prisma se deriva casi 1:1 de las entidades; los endpoints REST se derivan de los métodos.
3. **La reactividad sobrevive.** `RemoteDataStore` sigue emitiendo en el `bus` tras cada escritura; el "tiempo real entre pestañas" se sustituye por polling de TanStack Query, pero `useStore` no cambia de firma. (Detalle a resolver: los getters del DataStore son **síncronos** hoy; el RemoteDataStore necesita una caché local + revalidación, o se introduce una variante async — ver doc de plan de migración.)
4. **La taxonomía de analytics y los flujos de pago ya están modelados.** Los tres flujos reales (entradas / membresía socio / publicidad autogestionada) ya tienen sus métodos (`createOrder`+`setOrderStatus`, `becomeSocio`, `createCampaign`) y sus eventos. El backend les pone Mercado Pago + webhook detrás sin inventar superficie nueva.
5. **El seed es la migración inicial.** Los arrays de `src/data/seed/` y `seedPlans` se vuelven el `seed` de Prisma con los datos reales de la 14ª edición.

El único método que cambia de **forma** (no solo de implementación) es la confirmación de pagos: hoy `setOrderStatus(orderId, 'confirmada')` lo dispara el cliente; con Mercado Pago real, lo dispara un **webhook server-side**, y el cliente solo lee el estado resultante.

🔶 **[DECISIÓN ABIERTA]** Precio real de membresía Socio y de cada plan de entrada; cuenta de cobro de Mercado Pago (de Gastón/CCM); sponsors reales de la edición 2026; presupuesto y timeline del backend (debe estar listo bien antes del 19/09/2026).
