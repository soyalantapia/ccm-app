# Prompts por fase — Backend de CCM

> Pegá **uno por vez**, después del `PROMPT-MAESTRO.md`. Cada bloque es autónomo. Entre fase y fase: review + el protocolo de verificación del maestro. El orden sale del doc 10 (migración por dominio).

**Mapa de fases:** `0` esqueleto · `A` identidad/perfil/analytics · `B` eventos/inscripciones/cupos · `C` entradas+pagos · `D` membresía · `E` catálogo/galerías/contenido/uploads · `F` publicidad/sponsors · `G` auth admin + CRUD · `H` acreditación en puerta.

---

## FASE 0 — Esqueleto del server

```
Implementá la FASE 0: el esqueleto del backend. Leé docs 03 (stack), 09 (infra) y 04 (schema) antes.

Entregables:
- Carpeta server/ con Express + TypeScript, estructura modular (app, routers, middlewares, services).
- Prisma conectado a PostgreSQL. prisma/schema.prisma con el modelo INICIAL (al menos Device + ProfileField + AnalyticsEvent del doc 04, listos para crecer fase a fase). Migración inicial corriendo.
- tsconfig del server con PATH ALIAS que importa ../src/data/types.ts (probá importando un tipo y compilando).
- Endpoint GET /api/v1/health → 200 { ok, version, db: 'up' } (chequea conexión a Postgres).
- Middleware base: CORS (lee CORS_ORIGINS), JSON body, manejo de errores uniforme (formato de error del doc 05), validación con zod.
- .env.example con el CONTRATO DE ENTORNO canónico (doc 06/09): DATABASE_URL, los 3 *_TOKEN_SECRET, OTP_PEPPER, RESEND_API_KEY, ADMIN_BOOTSTRAP_EMAIL, MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, CORS_ORIGINS, credenciales de object storage. NADA de un JWT_SECRET único.
- Listo para Railway (start script, PORT por env, prisma migrate deploy en el release).
- NO toques el frontend todavía.

Verificación: GET /api/v1/health responde 200 contra una Postgres local; `prisma migrate dev` corre limpio; tsc del server verde; el import de types.ts compila.
Listo cuando: el server arranca, /health da 200 con db up, y el alias de tipos funciona.
```

---

## FASE A — Identidad, perfil y analytics

```
Implementá la FASE A (doc 10 §2). Dominio: identidad del device + perfil + analytics. Bajo riesgo (datos del propio device). Leé docs 05 (API), 06 (auth/identidad) y 04 (Device/ProfileField/AnalyticsEvent).

Backend:
- Modelos Device + ProfileField + AnalyticsEvent (canon doc 04). Identidad = Device.id; la PII vive en ProfileField (key/value/source/capturedAt), NO en columnas planas.
- Header X-Device-Id en cada request: middleware que hace UPSERT del Device en el primer contacto (el UUID viene de src/lib/identity.ts).
- Endpoints: GET /api/v1/me, PATCH /api/v1/me/fields, PATCH /api/v1/me/consents, POST /api/v1/analytics (ingesta BATCH, array de {event,payload,ts,deviceId}), GET /api/v1/admin/analytics (paginado).
- PII: nunca loguear payloads crudos. track() siempre fire-and-forget (un track perdido no rompe nada).

Frontend:
- Creá src/data/store/RemoteDataStore.ts implementando SOLO estos métodos async (getProfile, saveProfileFields, saveConsents, track, getAnalytics). El resto puede tirar 'no implementado' o delegar (ver HybridDataStore más abajo).
- Empezá la migración async de la interfaz DataStore (Promise<T>) y hacé que LocalDataStore envuelva en Promise.resolve. Adaptá los call-sites de LECTURA de perfil a TanStack Query / await según haga falta. track() sigue sin await.
- Sumá el HybridDataStore (doc 10 §9): rutea 'identity' a remote y el resto a local, por flag. index.ts elige según VITE_API_URL.

Verificación (doc 10 §2): con VITE_API_URL a staging, completá el perfil en un registro de charla; el Device y los ProfileField quedan en la DB con el source correcto. Borrá localStorage y recargá → el perfil VUELVE del server. Eventos de analytics llegan a la DB.
Listo cuando: un device aparece en la tabla Device, su perfil persiste tras limpiar localStorage, y los analytics llegan al server. Smoke de fallback OK (sin VITE_API_URL la app anda).
```

---

## FASE B — Eventos, bloques, inscripciones y cupos

```
Implementá la FASE B (doc 10 §3). Es el corazón del producto y el primer CUPO COMPARTIDO. Leé docs 05 y 04 (Event/EventBlock/Registration).

Backend:
- Modelos Event, EventBlock, Registration (canon doc 04). El 'taken' lo calcula el SERVER: count de Registration confirmadas + seedTaken migrado como base. El cliente NUNCA decide el cupo.
- Endpoints: GET /events, GET /events/:slug, GET /events/:id/blocks, GET /blocks/:id/availability, GET /registrations (del device), POST /registrations, DELETE /registrations/:id.
- register(): mutación con regla de negocio. Validá cupo DENTRO de una transacción (SELECT ... FOR UPDATE o count en la tx). Devolvé 409 BLOCK_FULL o 409 ALREADY_REGISTERED.
- socioOnly: el gate es a nivel EVENTO (Event.socioOnly); el bloque hereda. register a evento socioOnly sin membresía → 403 SOCIO_ONLY (el gate real es server-side).

Frontend:
- RemoteDataStore: implementá los métodos de eventos/bloques/inscripciones (async). El RemoteDataStore traduce 409 BLOCK_FULL al retorno null de register() (igual que hoy).
- Optimistic update permitido pero RECONCILIADO: si llega 409, revertí el caché y mostrá el error.
- Activá la flag 'events' en el HybridDataStore.

Verificación (doc 10 §3): bloque con capacity:2, disparar 5 POST /registrations en PARALELO (script, no clicks) → exactamente 2 confirmadas, resto 409. GET /blocks/:id/availability → full:true. Cancelar una → vuelve a haber lugar. Dos navegadores ven el mismo taken.
Listo cuando: el cupo no se sobre-vende bajo carga concurrente y una inscripción se ve cross-device.
```

---

## FASE C — Entradas y pagos (Mercado Pago)

```
Implementá la FASE C (doc 10 §4). DINERO REAL — máximo cuidado. Leé docs 07 (pagos), 05, 04 (TicketOrder/Payment) y 13 (acreditación, porque una orden confirmada emite QR). SIEMPRE sandbox de MP.

🔶 ANTES: confirmá con Alan si esta fase va por MP (rama principal) o por TIKEALO (doc 10 §4.bis). Si es Tikealo, implementá esa rama (POST /admin/external-tickets + emisión de QR) en vez del checkout. Si falta la decisión, hacé todo lo que no dependa de ella y marcá el resto.

Backend (rama MP):
- Modelos TicketPlan (config), TicketOrder (máquina de estados: iniciada→redirigida_mp→confirmada/cancelada) y la tabla Payment polimórfica única (canon doc 04/07). Los recursos NO duplican columnas MP.
- Endpoints: GET /plans, POST /orders (con Idempotency-Key), POST /orders/:id/redirected, GET /orders (del device), POST /webhooks/mp.
- createOrder: el SERVER recalcula el total desde el Plan autoritativo (el cliente solo manda planId + qty). Crea la orden 'iniciada', crea la preferencia en MP, devuelve orden + init_point.
- El paso a 'confirmada' lo decide EL WEBHOOK (payment.approved), nunca el cliente. Verificá la firma del webhook (MP_WEBHOOK_SECRET) e idempotencia por payment.id.
- Una orden confirmada (o un registro gratis) emite Ticket + accreditationToken (ver doc 13 / FASE H).

Frontend:
- createOrder se AWAIT-ea en TicketSelector.tsx (necesita el init_point antes de redirigir). 'Mis entradas' muestra 'Confirmando…' hasta que el webhook llega (polling/refetch).
- Activá la flag 'payments'. Idealmente la flag de pagos es runtime (GET /config) para poder apagarla en caliente.

Verificación (doc 10 §4): sandbox con tarjetas de prueba. Aprobado → webhook mueve a confirmada. Rechazado → queda iniciada/cancelada. Doble POST /orders con misma Idempotency-Key → una sola orden. Webhook duplicado (mismo payment.id) → no duplica.
🔶 [DECISIÓN ABIERTA — Gastón]: cuenta de cobro MP + precios reales de los 5 planes. Sin esto NO se activa en prod (queda en sandbox).
Listo cuando: en sandbox un pago aprobado confirma la orden vía webhook, un doble-tap no genera dos órdenes, y la entrada genera su QR contra una orden confirmada real.
```

---

## FASE D — Membresía Socio CCM

```
Implementá la FASE D (doc 10 §5). Segundo flujo de pago — reusa el motor de C. Leé docs 07, 05, 04 (Membership).

Backend:
- Modelo Membership con PK propia id + deviceId (canon doc 04, para que Payment.resourceId la referencie). Endpoints: GET /me/membership, POST /me/membership (Idempotency-Key), webhook compartido con C.
- La membresía se activa por WEBHOOK MP, no por el cliente. El gate de contenido/eventos socioOnly es SERVER-SIDE (un GET de contenido socioOnly sin membresía → 403 SOCIO_ONLY).

Frontend:
- becomeSocio se AWAIT-ea en el botón de membresía (espera la preferencia de MP). isSocio() es derivado (lee del caché de getMembership, no pega a la red).
- Activá la flag 'membership'.

Verificación (doc 10 §5): sandbox MP, comprar membresía, verificar tier:'socio' tras webhook, y que el contenido socioOnly deja de dar 403.
🔶 [DECISIÓN ABIERTA — Gastón]: precio y niveles de la membresía (si hay más de un nivel pago, cambia MembershipTier).
Listo cuando: una compra en sandbox vuelve socio al device y desbloquea socioOnly validado server-side.
```

---

## FASE E — Catálogo, galerías, contenido y uploads

```
Implementá la FASE E (doc 10 §6). Lecturas públicas pesadas + uploads a object storage. Leé docs 05, 04, 09 (object storage).

Backend:
- Modelos CatalogProfile, Gallery/Photo, ContentItem, favoritos/descargas (canon doc 04). Endpoints: GET /catalog, GET /catalog/:slug, GET /galleries, GET /galleries/:slug, GET /contents, GET /favorites, PUT/DELETE /favorites/:photoId, POST /downloads, POST /admin/uploads/sign (presigned URL a R2/Spaces).
- IMÁGENES NO van en Postgres: van al bucket S3-compatible. El server firma un PUT presigned; el cliente sube directo; se guarda solo la URL pública. Cache-Control + servir desde el CDN del bucket, no desde el dyno.
- toggleFavorite/recordDownload son del device (X-Device-Id). recordDownload alimenta photo_download (valor para el sponsor de la galería).

Frontend:
- RemoteDataStore: implementá lecturas (cacheadas agresivo) + favoritos/descargas. Activá la flag 'content'.

Verificación (doc 10 §6): medir tamaño/tiempo de GET /galleries con fotos reales; confirmar que las imágenes salen del CDN (no del API). Subir una foto por presigned URL → accesible por su URL pública. Favoritos/descargas cross-device.
🔶 [DECISIÓN ABIERTA — Alan]: R2 vs DigitalOcean Spaces. 🔶 [DECISIÓN ABIERTA — Gastón]: acceso al Drive de fotos reales + YouTube IDs para el seed→prod.
Listo cuando: las galerías reales cargan rápido desde CDN, una imagen se sube por presigned URL, y favoritos/descargas persisten por device.
```

---

## FASE F — Publicidad self-serve y sponsors

```
Implementá la FASE F (doc 10 §7). Tercer flujo de pago + selección de creatividad + vigencia temporal. Leé docs 07, 05, 04 (Sponsor/AdCampaign).

Backend:
- Modelos Sponsor, AdCampaign (vigencia: startsAt/expiresAt + status CampaignStatus { pendiente_pago, activa, expirada, rechazada }; canon doc 04 — NADA de activeFrom/activeTo ni flag 'paid'). Endpoints: GET /sponsors, GET /creatives/:slot, POST /campaigns (Idempotency-Key), GET /campaigns.
- getCreative(slot) tiene LÓGICA DE PRIORIDAD (ver LocalDataStore): una campaña activa para el slot le gana al sponsor fijo en index 0; los fijos rotan en el resto. Esa resolución vive SERVER-SIDE (GET /creatives/:slot devuelve {sponsor,creative} ya resuelto).
- createCampaign = tercer flujo de pago (motor de C). La campaña pasa a 'activa' SOLO con webhook confirmado (pendiente_pago hasta entonces). getActiveCampaign filtra status='activa' AND now entre startsAt/expiresAt. Una campaña activa por slot (constraint + transacción, mismo patrón que el cupo).

Frontend:
- createCampaign se AWAIT-ea en la compra de publicidad. Activá la flag 'ads'.

Verificación (doc 10 §7): comprar campaña en sandbox → tras webhook pasa a 'activa' y ocupa el slot desplazando al fijo; al pasar expiresAt vuelve el fijo. ad_impression/ad_click contra el sponsor sintético correcto.
🔶 [DECISIÓN ABIERTA — Gastón]: reglas de exclusividad/solapamiento de campañas (SLOT_OCCUPIED).
Listo cuando: una campaña pagada aparece en su slot durante su ventana, se mide impression/click, y libera el slot al vencer.
```

---

## FASE G — Auth admin y CRUD del organizador

```
Implementá la FASE G (doc 10 §8). Superficie de escritura privilegiada — un fallo de auth expone CRUD destructivo. Leé docs 06 (auth/roles) y 05.

Backend:
- Login passwordless de organizador (OTP por email, coherente con el resto). adminJWT firmado con ADMIN_TOKEN_SECRET (uno de los 3 secretos). AdminUser.role = enum AdminRole { OWNER, EDITOR, STAFF, VIEWER }.
- Middleware: TODO /admin/* exige rol verificado (401 sin token, 403 ADMIN_REQUIRED / rol insuficiente). STAFF = solo puerta (escanea QR; ver FASE H).
- Endpoints: POST /admin/auth/... + los POST/PATCH/DELETE /admin/* de cada recurso (events, blocks, galleries, sponsors, catalog, contents, updatePlan, getApplications/decideApplication, getAnalytics).
- Borrado seguro: 409 o soft-delete para entidades con datos reales. Las mutaciones siguen generando los track('admin_*') server-side.

Frontend:
- El admin usa el mismo RemoteDataStore con el adminJWT inyectado en el header tras login (o un thin wrapper para /admin). El dashboard estrena POLLING con TanStack Query sobre GET /admin/analytics y los listados. El resto de la app NO cambia.
- Reemplazá el gate actual (acepta cualquier clave) por el login real. Activá la flag 'admin'.

Verificación (doc 10 §8): POST /admin/events sin token → 401; con token de device (no admin) → 403; con admin → 201. Crear/editar/borrar un evento desde el panel y verlo en el front público de OTRO navegador.
🔶 [DECISIÓN ABIERTA — Gastón/Alan]: emails de los admins y a qué rol mapea cada uno (OWNER toca pagos / EDITOR carga contenido / STAFF escanea / VIEWER mira).
Listo cuando: solo un organizador autenticado puede mutar, y un cambio del admin se ve en el front real de otro dispositivo.
```

---

## FASE H — Acreditación en puerta (QR)

```
Implementá la FASE H: la acreditación real del día del evento. CAMINO CRÍTICO. Leé el doc 13 (acreditación, es el canon) + doc 06 (rol STAFF) + doc 04 (Ticket).

Backend:
- Modelo Ticket (canon doc 04): deviceId, orderId? (null si entrada gratis), jornada, qrToken (= jti del JWT), checkedIn, checkedInAt, @@unique([deviceId, jornada]).
- Emisión del accreditationToken (JWT firmado con ACCREDITATION_TOKEN_SECRET, exp = fin del evento) en sus disparadores: (a) Registration gratis confirmada; (b) webhook MP approved de TicketOrder pago; (c) [si aplica] rama Tikealo (external-tickets).
- Endpoint de scan: POST /api/v1/admin/checkin { token } (rol STAFF) → respuestas válido / ya_usado / inválido / jornada_incorrecta, con marca checkedIn/checkedInAt. Lógica de UN-USO-POR-JORNADA. Idempotencia ante doble-scan.
- Endpoint para que la app entregue su QR al asistente (GET /me/accreditation o equivalente del doc 06).

Frontend:
- El QR de Mi QR pasa a dibujar el accreditationToken real (reemplaza el qrToken de juguete de identity.ts).
- 'Modo puerta' de la PWA para STAFF: escanea, valida ONLINE (contra DB) u OFFLINE (verifica la firma del JWT localmente, encola el check-in, sincroniza después) — ver doc 13 §online/offline. Manejo de error de red en puerta y de varios escáneres simultáneos.

Verificación: emitir QR por entrada gratis y por pago confirmado; escanear válido → checkedIn; re-escanear → ya_usado; QR de otra jornada → jornada_incorrecta; token falsificado → inválido. Probar modo offline (sin red) y la sincronización posterior sin duplicar check-ins.
🔶 [DECISIÓN ABIERTA]: HS256 vs RS256 según conectividad en puerta (relevamiento del hotel); QR por orden vs por asistente; por jornada vs por entrada.
Listo cuando: un QR real valida en puerta una sola vez por jornada, online y offline, y un token falsificado se rechaza.
```

---

## Cierre

Cuando las 8 fases (0, A–H) pasen su "listo cuando" + la **definición de hecho global** del maestro, la migración está terminada (doc 10 §12). Antes del evento: **smoke de fallback** (apagar el API y confirmar que la PWA no se rompe) y **ensayo de puerta** con varios escáneres.
