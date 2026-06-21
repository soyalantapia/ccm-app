# Analytics y panel en tiempo real

Cómo el backend ingiere y consulta los `AnalyticsEvent` que hoy viven en `localStorage` (clave `analytics`, capados a `MAX_EVENTS = 3000` en `src/lib/track.ts`), y cómo el dashboard del organizador deja de ser un bus entre pestañas para convertirse en un panel multi-dispositivo en vivo. Este doc profundiza la §12 del contrato de API (`05-api-contrato.md`); donde haya solapamiento, el contrato manda y acá explicamos el porqué y el a-escala.

---

## 0. Punto de partida (qué es hoy)

El analytics de CCM es un **event bus first-party** (PRD §13), no Google Analytics ni Mixpanel. Hoy:

- `track(event, payload?)` escribe en `localStorage` con `id`, `ts`, `deviceId` (de `getDeviceId()`) y `payload` opcional. La interfaz `DataStore.track()` delega en `src/lib/track.ts`.
- El dashboard (`src/pages/admin/Dashboard.tsx`) lee `store.getAnalytics()` vía `useSyncExternalStore`. Cada `track()` dispara `notify()` sobre el set de `subscribers` (`src/data/store/index.ts`) → re-render. El "tiempo real" de hoy es **un solo navegador**: si te inscribís en otra pestaña del mismo browser, la fila entra sola. Entre dos dispositivos distintos, no se ve nada.
- El seed (`src/data/seed/analytics.ts`) inyecta ~40 días de historia (`seed: true`) para que el panel no nazca vacío en el pitch.
- Hay un filtro **señal vs ruido** ya implementado (`isSignal` / `NOISE_EVENTS` en `CoreLiveFeed.tsx`), un humanizador de eventos (`describeAnalyticsEvent` en `coreAnalytics.ts`) y un **export CSV client-side** (`downloadAnalyticsCsv`).

El backend tiene que preservar exactamente esta taxonomía y estos shapes (la UI no se toca) y darle al dashboard datos **agregados de todos los dispositivos**, no del navegador del organizador.

---

## 1. Ingesta: `POST /analytics` (batch, fire-and-forget)

### Contrato

```
POST /api/v1/analytics
X-Device-Id: <uuid>
Authorization: Bearer <deviceJWT>   # opcional fase 1 (ver doc de auth)
Content-Type: application/json
→ 202 Accepted   (cuerpo vacío; nunca bloquea la UI)
```

El front **no** debe esperar la respuesta ni reintentar de forma agresiva: analytics es best-effort, perder un `ad_impression` no rompe nada. Una orden de pago **no** depende de este endpoint — el server emite `ticket_order_confirmed` desde el webhook de Mercado Pago (ver §6).

### Batch, no por-evento

Hoy `track()` escribe de a uno. En un evento real con cientos de asistentes navegando, un POST por evento es ruido de red y batería. La implementación del front en `RemoteDataStore` debe **encolar y flushear en lote**:

```ts
// Bosquejo del buffer en el front (RemoteDataStore)
const queue: TrackInput[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function track(event: string, payload?: Record<string, unknown>) {
  queue.push({ event, payload, clientTs: new Date().toISOString() })
  if (queue.length >= 20) flush()                       // por tamaño
  else if (!flushTimer) flushTimer = setTimeout(flush, 5_000)  // o por tiempo
}

function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (queue.length === 0) return
  const batch = queue.splice(0, queue.length)
  // sendBeacon sobrevive al cierre de pestaña; no bloquea navegación
  const ok = navigator.sendBeacon?.(
    `${API}/analytics`,
    new Blob([JSON.stringify({ events: batch })], { type: 'application/json' }),
  )
  if (!ok) {
    fetch(`${API}/analytics`, { method: 'POST', keepalive: true, headers, body: JSON.stringify({ events: batch }) })
      .catch(() => queue.unshift(...batch))  // re-encolar si falló la red
  }
}
// Flush forzado al ocultar la pestaña (PWA en mobile cierra rápido)
document.addEventListener('visibilitychange', () => { if (document.hidden) flush() })
```

> **Nota:** `navigator.sendBeacon` no permite headers personalizados (`X-Device-Id`). Mandamos el `deviceId` **dentro del body** del batch en ese path, y como header en el path `fetch`. El server acepta ambos. El `clientTs` lo manda el cliente para ordenar dentro del batch, pero el `ts` canónico lo pone el server al recibir (un reloj, sin skew de dispositivos).

### Body del endpoint (acepta single y batch)

```jsonc
// batch (preferido)
{ "events": [
  { "event": "ad_impression", "payload": { "sponsorId": "spn_01", "slot": "S2" }, "clientTs": "2026-09-19T18:40:01Z" },
  { "event": "photo_view",    "payload": { "galleryId": "gal_03" } }
], "deviceId": "<uuid-si-vino-por-beacon>" }

// single (compat con el track() actual)
{ "event": "registration_created", "payload": { "eventId": "evt_camino18", "blockId": "blk_07" } }
```

El server, por cada evento del batch: completa `id` (server-side), `ts` (server clock), `deviceId` (header > body), valida que `event` esté en el **enum de taxonomía conocida** (ver §3) y descarta silenciosamente los desconocidos (registrando un contador de "eventos rechazados" para detectar drift de versión del front). Inserta en lote (un solo `INSERT ... VALUES (...), (...), ...` o `createMany` de Prisma).

🔶 [DECISIÓN ABIERTA] Rate limiting de ingesta por `deviceId` (ej. máx 200 eventos/min) para que un cliente con bug no nos inunde la tabla. Recomiendo un límite generoso con `429` silencioso (el front lo ignora).

---

## 2. Esquema y modelo de datos

### Modelo Prisma

```prisma
model AnalyticsEvent {
  id        String   @id @default(cuid())
  event     String                          // taxonomía PRD §13 (ver §3)
  ts        DateTime @default(now())         // reloj del server, NO del cliente
  deviceId  String?                          // null si el evento lo emite el server
  payload   Json?                            // { eventId, blockId, sponsorId, planId, total, ... }
  seed      Boolean  @default(false)         // históricos del seed; nunca se borran en retención
  signal    Boolean  @default(true)          // precomputado: señal de negocio vs ruido (ver §3)

  @@index([ts(sort: Desc)])                  // feed en vivo + paginación cursor
  @@index([event, ts(sort: Desc)])           // KPIs filtrados por tipo (count por evento)
  @@index([deviceId, ts(sort: Desc)])        // DeviceTimeline (un dispositivo, su historia)
  @@index([signal, ts(sort: Desc)])          // feed que excluye ruido sin escanear todo
}
```

Decisiones de esquema:

- **`payload` como `Json`/`JSONB`.** El payload es heterogéneo por tipo de evento (`{sponsorId}` para ads, `{planId, total}` para órdenes, `{field, source}` para captura de perfil). No vale la pena normalizarlo en columnas: lo consultamos por `event` y agregamos campos puntuales con operadores JSON de Postgres (`payload->>'sponsorId'`). Si una métrica caliente (ej. impresiones por sponsor) se vuelve lenta, se crea un **índice de expresión**: `CREATE INDEX ON "AnalyticsEvent" ((payload->>'sponsorId')) WHERE event IN ('ad_impression','ad_click')`.
- **`signal` precomputado en la ingesta.** Hoy el front decide señal/ruido con `NOISE_EVENTS`. Replicamos esa lista en el backend y guardamos `signal` como columna booleana, así el feed en vivo (`WHERE signal = true`) no escanea ni filtra en app. La fuente de verdad de la lista de ruido pasa a ser el backend (un solo lugar); el front sigue teniendo su `isSignal` para el caso fallback `LocalDataStore`.
- **`seed`** se mantiene para que el panel arranque con historia y para que retención **nunca** borre el seed (es el respaldo del pitch).
- **No FKs a `Event`/`Sponsor`/etc.** Analytics es un log inmutable; si se borra un sponsor, sus impresiones históricas tienen que sobrevivir. Las relaciones se resuelven en lectura (igual que hace hoy `describeAnalyticsEvent` con `s.getSponsor(id)`).

### A escala

Para el volumen de CCM 2026 (un evento de 2 días, ~miles de asistentes) una sola tabla con esos índices alcanza de sobra — estamos hablando de cientos de miles de filas, no de miles de millones. **No** hace falta TimescaleDB, ni ClickHouse, ni particionado en v1. Si CCM escala a multi-evento/multi-año:

- Particionar por rango de `ts` (mensual) cuando la tabla pase el orden de los millones de filas.
- Mover agregados pesados a una tabla de **rollups** materializados (ver §5).

🔶 [DECISIÓN ABIERTA] Si analytics comparte la base Postgres del resto del dominio (simple, recomendado para v1) o va a su propia base/esquema desde el día uno por aislamiento de carga de escritura.

---

## 3. Taxonomía: señal de negocio vs ruido

La distinción ya existe en el código y hay que **respetarla en el server**. La lista de ruido viene de `CoreLiveFeed.tsx`:

```ts
// NOISE_EVENTS (ruido — NO entra al feed en vivo; sí al CSV y al DeviceTimeline)
page_view, qr_view, block_view, event_view, photo_view, profile_view,
content_view, content_locked_view, membership_view, stand_view,
ad_impression, ad_skip, pwa_prompt_shown, pwa_prompt_dismissed
```

Todo lo demás es **señal de negocio** y es lo que el organizador quiere ver entrar en vivo:

| Categoría | Eventos señal | Qué KPI alimenta |
|---|---|---|
| Identidad | `user_created`, `profile_field_captured`, `onboarding_completed` | Registrados, datos capturados |
| Inscripciones | `registration_created`, `registration_cancelled` | Inscripciones netas, ocupación de bloques |
| Entradas | `ticket_order_created`, `ticket_order_redirected_mp`, `ticket_order_confirmed` | Órdenes VIP, ingresos por entradas |
| Membresía | `membership_purchased` | Socios CCM, ingreso recurrente, conversión a Socio |
| Publicidad | `ad_click`, `ad_campaign_purchased` | Clics por sponsor, ingreso self-serve |
| Postulaciones | `application_submitted`, `application_accepted`, `application_rejected` | Postulaciones, embudo de convocatoria |
| Contenido/fotos | `photo_download`, `photo_favorite`, `video_play`, `content_view`, `calendar_export` | Descargas, engagement |
| Stand/leads | `stand_lead_captured`, `sponsor_lead` | Leads captados (oro comercial para Gastón) |

**Por qué importa la distinción en el server:**
1. El feed en vivo filtra `signal = true` en SQL (rápido, sin traer ruido por la red).
2. `ad_impression` es altísimo volumen (cada render de banner) — es ruido para el feed pero **dato clave** para el reporte de sponsors. Por eso vive en la tabla pero no en el stream.
3. Los KPIs de negocio (§5) se calculan solo sobre señal; las vistas/impresiones se agregan aparte.

> **Regla de doble conteo (del contrato §12):** los eventos disparados por una mutación del propio backend (la confirmación de pago vía webhook MP emite `ticket_order_confirmed`; `becomeSocio` confirmado emite `membership_purchased`) los emite **el server**, no el front. El front nunca trackea un `*_confirmed` de pago — solo el `created`/`redirected_mp`. Esto evita contar dos veces el mismo ingreso.

---

## 4. El dashboard EN VIVO: polling primero, SSE/WS después

Hoy el "vivo" es el set de `subscribers` local. En backend, el organizador en la puerta del Quinto Centenario abre `/admin` en su teléfono y tiene que ver entrar las inscripciones de **otros** asistentes. Hay tres caminos: polling, SSE, WebSocket.

### v1: polling con TanStack Query (recomendado)

```ts
// Hook del dashboard — reemplaza el useSyncExternalStore para el modo remoto
const { data: analytics } = useQuery({
  queryKey: ['admin', 'analytics', 'live'],
  queryFn: () => api.getAnalyticsPage({ limit: 100 }),  // primera página, ts desc
  refetchInterval: 10_000,            // 10 s: suficientemente vivo para un panel humano
  refetchIntervalInBackground: false, // no quema datos si el organizador minimiza
  staleTime: 8_000,
})
```

Por qué polling primero:

- **Cero infra extra.** Railway + Express + un `GET` cacheable. SSE/WS exigen conexiones de larga duración, manejo de reconexión, sticky sessions o un broker (Redis pub/sub) si hay más de una instancia. No lo necesitamos para CCM 2026.
- **El consumidor es 1–3 organizadores**, no diez mil clientes. El costo de polling es trivial.
- **Tolerante a red de evento.** En un hotel con WiFi saturado, un `GET` que falla y reintenta a los 10 s es robusto; una conexión WS caída necesita lógica de backoff que hay que escribir y testear.
- **TanStack Query ya es el patrón de Alan** (Norte). El cache, dedup y `refetchInterval` salen gratis.
- Los KPIs (los `<Stat>`) se piden a un endpoint **agregado** (§5) con `refetchInterval` más largo (30 s) — no se recalculan en el front sumando 3000 filas como hoy.

El intervalo de 10 s da una latencia percibida buena ("la fila entra sola en ~10 s"). Para la demo/pitch, donde se quiere el efecto inmediato de "tocá en otra pestaña y aparece", se puede bajar a 5 s sin problema.

### v2 (evolución): SSE

Cuando el organizador pida "instantáneo de verdad" o quiera un contador que titile en cada acción, **Server-Sent Events** es el siguiente paso natural — no WebSocket:

```
GET /api/v1/admin/analytics/stream   (Authorization: Bearer <adminJWT>)
→ text/event-stream
  event: analytics
  data: {"id":"...","event":"registration_created","ts":"...","payload":{...}}
```

- SSE es **unidireccional** (server→cliente), que es exactamente lo que el dashboard necesita: no manda nada de vuelta. WebSocket es bidireccional y acá no usaríamos esa mitad.
- Va sobre HTTP normal, atraviesa proxies/CORS más fácil que WS, y `EventSource` reconecta solo (con `Last-Event-ID` para no perder eventos).
- En Express: la ruta de ingesta publica a un `EventEmitter` en proceso (o Redis pub/sub si hay >1 instancia en Railway), y el handler SSE suscribe y va escribiendo `res.write(\`data: ...\n\n\`)`.
- TanStack Query convive: el `EventSource` hace `queryClient.setQueryData(['admin','analytics','live'], ...)` empujando el evento nuevo al principio del array. El feed sigue leyendo del mismo query key — **la UI no cambia**.

### WebSocket: solo si hace falta bidireccional

Reservado para si algún día el panel necesita **acciones push** (ej. el organizador "aprueba postulación" y eso se propaga a otros paneles abiertos en vivo). Hoy no hay caso. Coherente con la decisión fijada del proyecto: "empezar con polling, dejar SSE/WebSocket como opción posterior".

🔶 [DECISIÓN ABIERTA] Si Railway corre el backend en **una sola instancia** (lo más probable para CCM 2026) → SSE con `EventEmitter` en proceso alcanza. Si escala a varias instancias, SSE necesita Redis pub/sub. No comprar Redis hasta que haga falta.

---

## 5. KPIs, agregación y retención

### Endpoint agregado (el corazón del panel)

Hoy el `Dashboard.tsx` trae **todos** los eventos y los cuenta en el cliente (`analytics.filter(...).length`). A escala eso es traer 100k filas por la red para mostrar 6 números. Lo movemos al server:

```
GET /api/v1/admin/metrics?from=...&to=...
→ 200
{
  "registrados":        { "value": 1240 },
  "inscripcionesNetas": { "value": 312 },          // registration_created − registration_cancelled
  "sociosCCM":          { "value": 87 },
  "ingresoSocios":      { "value": 1305000, "currency": "ARS" },  // Σ payload.total de membership_purchased
  "ingresoEntradas":    { "value": 4820000, "currency": "ARS" },  // Σ total de órdenes confirmadas
  "descargasFotos":     { "value": 2104 },
  "ordenesVip":         { "value": 156 },
  "postulaciones":      { "value": 43 },
  "conversionSocio":    { "value": 0.0701 },        // socios / registrados
  "sponsors": [
    { "sponsorId": "spn_01", "name": "...", "level": "Principal", "impressions": 8400, "clicks": 312, "ctr": 0.0371 },
    ...
  ],
  "ocupacionBloques": [ { "blockId": "blk_07", "title": "...", "taken": 48, "capacity": 60 }, ... ]
}
```

Mapeo directo a lo que ya pinta el dashboard (los `<Stat>`, la tabla de sponsors, las barras de ocupación). Cada número es un `COUNT`/`SUM`/`GROUP BY` con los índices de §2:

```sql
-- Registrados
SELECT count(*) FROM "AnalyticsEvent" WHERE event = 'user_created';
-- Ingreso por membresías
SELECT coalesce(sum((payload->>'total')::numeric), 0)
FROM "AnalyticsEvent" WHERE event = 'membership_purchased';
-- Impresiones y clics por sponsor
SELECT payload->>'sponsorId' AS sponsor_id,
       count(*) FILTER (WHERE event = 'ad_impression') AS impressions,
       count(*) FILTER (WHERE event = 'ad_click')      AS clicks
FROM "AnalyticsEvent"
WHERE event IN ('ad_impression','ad_click')
GROUP BY 1 ORDER BY impressions DESC;
```

> **Ojo con los ingresos:** la fuente de verdad de `ingresoEntradas`/`ingresoSocios` debería ser la tabla de **órdenes confirmadas** (`TicketOrder`/`Membership`), no la suma de payloads de analytics — analytics es best-effort y puede perder eventos. Para el pitch, sumar `payload.total` es suficiente; para plata real, cruzar contra órdenes confirmadas por webhook MP. El panel puede mostrar el de analytics como "en vivo aproximado" y el contable salir del módulo de pagos.

### Rollups (cuando el `count(*)` en vivo moleste)

Mientras la tabla sea chica, contar en cada request está bien (cacheado 30 s por TanStack Query). Si crece, materializamos snapshots:

```prisma
model MetricRollup {
  id       String   @id @default(cuid())
  bucket   DateTime                 // truncado a la hora o al día
  metric   String                   // 'registrados' | 'ingreso_entradas' | 'imp_spn_01' ...
  value    Decimal
  @@unique([bucket, metric])
}
```

Un job (cron de Railway, cada 5–15 min) recalcula los buckets de la ventana reciente. El endpoint de métricas suma rollups cerrados + un `count` en vivo solo sobre la ventana abierta. **No** construir esto en v1 — es la salida si y solo si el panel se pone lento.

### Retención

- El **seed** (`seed = true`) no se toca nunca.
- Los eventos **señal de negocio** se conservan indefinidamente (son pocos en volumen y son el valor del producto: el embudo histórico, los ingresos, los leads).
- Los eventos **ruido de alto volumen** (`ad_impression`, `page_view`, `*_view`) se pueden **agregar y purgar**: tras N días, se consolidan en `MetricRollup` (impresiones por sponsor por día) y se borran las filas crudas. Así el reporte de sponsors sobrevive sin guardar millones de filas de impresión.
- PII en payloads: los payloads de analytics **no** deben llevar PII (ver §7). El `deviceId` sí está, y la retención de `deviceId` se rige por la política de datos del perfil, no por la de analytics.

🔶 [DECISIÓN ABIERTA] Ventana de retención de eventos-ruido crudos (¿30/60/90 días post-evento?) y si se agregan antes de purgar. Depende de cuánto detalle de impresiones quiera Gastón conservar para reportar a sponsors a futuro.

---

## 6. Eventos emitidos por el server (no por el front)

Para evitar doble conteo y poder confiar en los KPIs de plata, estos eventos los escribe el backend, no el cliente:

| Evento | Quién lo emite | Disparador |
|---|---|---|
| `ticket_order_created` | front | usuario inicia compra |
| `ticket_order_redirected_mp` | front | usuario va al checkout MP |
| `ticket_order_confirmed` | **server** | webhook MP `payment.approved` |
| `membership_purchased` | **server** | webhook MP de la membresía Socio |
| `ad_campaign_purchased` | **server** | webhook MP de la campaña self-serve |
| `ad_impression` / `ad_click` | front | render / clic del banner |
| `registration_created` | server (en el `POST /registrations`) | regla de negocio ya validó cupo |

Patrón: cuando una mutación con efecto de negocio ocurre en el backend, **el mismo handler que persiste el cambio inserta el `AnalyticsEvent`** dentro de la misma transacción. Así el panel y la base de verdad nunca divergen para los eventos que importan.

---

## 7. Privacidad de la telemetría

- **No meter PII en `payload`.** El payload lleva IDs (`eventId`, `blockId`, `sponsorId`, `planId`), montos y enums (`field`, `source`). **Nunca** `email`, `dni`, `phone`, nombres ni valores de campos de perfil. Cuando se captura un dato (`profile_field_captured`), el payload dice **qué campo** y **desde dónde** (`{ field: 'email', source: 'entradas' }`), nunca el valor. La PII vive solo en `DeviceProfile`, con su propio control de acceso.
- **El `deviceId` es un seudónimo**, no una identidad. Linkea eventos del mismo dispositivo (el `DeviceTimeline` del admin se apoya en eso) pero no identifica a la persona salvo que esa persona haya entregado datos en el perfil. Tratarlo como dato personal indirecto: borrarlo si se ejerce un derecho de supresión sobre el perfil asociado.
- **Consentimiento.** El `DeviceProfile.consents` (terms/news/sponsors) ya existe. La telemetría first-party de producto (medir el funcionamiento de la propia app) es base legítima; pero si se usa para targeting de sponsors o para compartir comportamiento con terceros, eso cae bajo el consent `sponsors`. 🔶 [DECISIÓN ABIERTA] Si el tracking de comportamiento por sponsor (qué stands visitó cada device) requiere opt-in explícito — definición legal/negocio de Gastón, sobre todo por los leads que se venderían.
- **Solo el admin lee el agregado.** `GET /admin/analytics` y `/admin/metrics` exigen `adminJWT` con rol (hoy el gate acepta cualquier clave; en real es login de organizador). El `POST /analytics` es público-por-device (lo escribe cualquier asistente) pero **solo escribe**: un device nunca puede leer analytics de otros.
- **First-party, sin terceros.** No hay GA ni píxeles externos: todo el dato es propio (es el argumento de venta del PRD §10.1 — "el dato es nuestro"). Esto simplifica el cumplimiento: no se comparte con Google/Meta por defecto.

---

## 8. Export CSV server-side

Hoy `downloadAnalyticsCsv` arma el CSV en el navegador a partir del array en memoria — sirve mientras son ≤3000 filas locales. A escala, el export sale del server por streaming:

```
GET /api/v1/admin/analytics/export.csv?from=...&to=...&event=...
Authorization: Bearer <adminJWT>
→ 200  Content-Type: text/csv; charset=utf-8
       Content-Disposition: attachment; filename="ccm-analytics-2026-09-20.csv"
```

- **Streaming, no buffer en memoria.** Cursor sobre la tabla ordenada por `ts` y `res.write()` fila a fila; nunca cargar 100k filas en RAM. Prisma con `cursor`/`take` en loop, o un `COPY ... TO STDOUT` de Postgres si se quiere máxima velocidad.
- **Mismas columnas que el CSV actual** para no romper lo que el organizador ya conoce: `id, event, ts, device_id, origin, payload` — donde `origin` = `seed` | `live` (hoy `demo`). Mantener el **BOM UTF-8** (`﻿`) que ya pone el front, para que Excel en español abra bien los acentos.
- **Escapado CSV** idéntico al de `coreAnalytics.ts` (`csvCell`): comillas, comas, saltos de línea y `;`.
- El payload se serializa como JSON en una celda (como hoy).

🔶 [DECISIÓN ABIERTA] (del contrato §12) Si el export es **self-service** del admin (botón → descarga directa, válido mientras sea rápido) o **on-demand asíncrono** (se genera, se sube a R2/Spaces y se manda un link de descarga) — esto último solo si el volumen hace que el request HTTP sincrónico tarde demasiado. Para CCM 2026, self-service por streaming alcanza.

---

## 9. Cómo aterriza en `RemoteDataStore` (la costura)

La UI no cambia: sigue llamando `store.track(...)` y `store.getAnalytics()`. El `RemoteDataStore` traduce:

```ts
// track → encola y flushea en batch (§1); nunca espera
track(event, payload) { enqueue({ event, payload }) }

// getAnalytics → la interfaz pide un array plano.
// Para el dashboard en vivo, el RemoteDataStore expone además getAnalyticsPage()
// que TanStack Query consume con refetchInterval (§4). getAnalytics() pagina
// internamente (loop sobre nextCursor) solo para casos que necesiten el set completo.
async getAnalyticsPage({ limit = 100, cursor } = {}) {
  const r = await fetch(`${API}/admin/analytics?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`, { headers: adminHeaders })
  return r.json()  // { data: AnalyticsEvent[], page: { nextCursor, hasMore, count } }
}
```

El filtro **señal/ruido** (`isSignal`), el humanizador (`describeAnalyticsEvent`) y el CSV client-side (`downloadAnalyticsCsv`) siguen existiendo en el front como **fallback del `LocalDataStore`** (modo demo sin backend). En modo remoto, el feed pide la página ya filtrada por `signal=true` y el CSV grande se baja del endpoint server-side de §8. Misma interfaz, dos implementaciones — conmutable por `VITE_API_URL` con fallback, igual que el resto de la migración.

---

## 10. Resumen de endpoints

| Método | Path | Auth | Para |
|---|---|---|---|
| `POST` | `/analytics` | device | ingesta batch fire-and-forget (`202`) |
| `GET` | `/admin/analytics` | admin | feed/historial paginado (cursor) |
| `GET` | `/admin/metrics` | admin | KPIs agregados (Stats + sponsors + ocupación) |
| `GET` | `/admin/analytics/export.csv` | admin | export CSV streaming |
| `GET` | `/admin/analytics/stream` | admin | SSE en vivo (**v2**, no v1) |

**Para v1 alcanza con:** ingesta batch, feed paginado por polling (TanStack Query, 10 s), endpoint de métricas agregadas, export CSV streaming, columna `signal` precomputada y la regla de "eventos de pago los emite el server". SSE, rollups y Redis son evolución que se compra solo cuando el volumen lo pida.
