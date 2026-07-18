# PROJECT.MD — Córdoba Corazón de Moda (CCM)

> **La biblia del proyecto.** Negocio + producto + arquitectura + datos + estado real + roadmap, todo en un lugar. Si algo de otro doc contradice a este, ganan los hechos del código; avisá y se corrige acá.
> **Última actualización:** 2026-06-27 · **Rama de trabajo:** `feat/backend-foundation` · **Estado:** en producción (Railway, un solo servicio).

Índice:
1. [Qué es CCM](#1-qué-es-ccm)
2. [El problema y la propuesta de valor](#2-el-problema-y-la-propuesta-de-valor)
3. [Stakeholders y roles](#3-stakeholders-y-roles)
4. [Modelo de negocio](#4-modelo-de-negocio)
5. [Arquitectura](#5-arquitectura)
6. [Stack tecnológico](#6-stack-tecnológico)
7. [Modelo de datos](#7-modelo-de-datos)
8. [Funcionalidades (todo lo que tenemos)](#8-funcionalidades-todo-lo-que-tenemos)
9. [Seguridad](#9-seguridad)
10. [Estado por fases (qué está en prod)](#10-estado-por-fases-qué-está-en-prod)
11. [Deploy e infraestructura](#11-deploy-e-infraestructura)
12. [Roadmap y futuro](#12-roadmap-y-futuro)
13. [Decisiones abiertas (bloqueantes)](#13-decisiones-abiertas-bloqueantes)
14. [Historia del proyecto](#14-historia-del-proyecto)
15. [Convenciones canónicas (LEY)](#15-convenciones-canónicas-ley)
16. [Mapa de la documentación](#16-mapa-de-la-documentación)

---

## 1. Qué es CCM

**CCM = Córdoba Corazón de Moda**, un evento de moda que se posiciona como *"el Ecosistema de Negocios y Tendencias más influyente del interior del país"* (deck 2026).

| Dato | Valor |
|---|---|
| Edición | 14ª consecutiva (anual) |
| Fechas | **19 y 20 de septiembre de 2026**, 9 a 21 hs |
| Lugar | Hotel Quinto Centenario, Duarte Quirós 1300, Córdoba, Argentina |
| Dirección artística | Néstor Moio |
| Productora | Agencia de Gastón ("Contenido IA Mabel" figura como *Produce* en Tikealo) |
| Partner tecnológico | **Xnod** (desarrolla la plataforma) |

**Las 7 plataformas del evento:** Moda (núcleo creativo, pasarelas), Belleza, Turismo, Arte, Gastronomía ("Sabores CCM"), Tecnología (IA e innovación) y Sustentabilidad (eje transversal).

**Cómo se vende el evento (cifras del deck):** +18.000 asistentes (70% mujeres, +30 años, ABC1/clase media-alta), 250+ unidades de negocio, +100 stands interactivos, base proyectada de 20.000 registrados, +10 charlas, masterclasses, art shows, premios internacionales (+100 premiados), Cóctel de Negocios B2B (Inner Circle).

**Modelo de acceso:** entrada general **gratuita pero con inscripción previa obligatoria** ("sin inscripción no se ingresa"), cupos limitados. Dos galas pagas: **Night VIP + Desfile de las Estrellas** (sáb 19, 19-21 hs) y **Sunset VIP + Desfile Internacional** (dom 20, 18-20 hs). Declarado de beneplácito por el Concejo Deliberante de Córdoba y de interés general/cultural/turístico por la Legislatura provincial.

---

## 2. El problema y la propuesta de valor

### El problema (situación previa)
- CCM **no tenía sitio web** (se dio de baja el año pasado).
- El contenido vivía **disperso**: capacitaciones en una plataforma externa, videos en YouTube, fotos en Google Drive, convocatorias por historia de Instagram + Google Form, entradas en Tikealo (ticketera externa).
- La operación era **manual** (convocatorias, selección de protagonistas, invitaciones, portfolios).
- La comunidad solo se activaba **un mes antes y un mes después**; el resto del año "se para hasta el año que viene".
- El deck **ya le había vendido a los sponsors tres promesas tecnológicas** que no existían: (1) lead-gen en tiempo real con tótems QR, (2) estrategia post-evento (mailing segmentado + audiencias de retargeting), (3) **Reporte Técnico de Impacto** por sponsor. *"Todo se mide."*

### La propuesta de valor
Una **PWA instalable que unifica todo el evento (antes / durante / después) en un solo link** y es, a la vez, **la landing oficial** (no hay otra web). Seis objetivos de negocio:

1. **Comunidad activa todo el año** (no solo el mes pre/post).
2. **Monetización por sponsors en cada punto de contacto** — rechazan comisiones; venden espacios medibles con **exclusividad por rubro**.
3. **Datos propios y trazabilidad total** — *"se acaba la discusión de si me cree o no me cree"*. Cada interacción se convierte en un perfil capturado.
4. **Centralizar el contenido embebido** sin sacar al usuario (videos siempre embebidos de YouTube).
5. **Automatizar lo manual** (convocatorias, selección, invitaciones, fotos, portfolios).
6. **Plataforma encapsulada y replicable** (multi-tenant desde el modelo de datos).

### Diferenciadores de producto
- **Identidad sin contraseñas:** cada dispositivo es una cuenta; los datos se piden "justo a tiempo" (*progressive profiling*).
- **Diseño editorial disruptivo** (estética revista de moda), con **theming 100% por tokens** (cambiar un valor retematiza toda la app).
- **Todo trackeado first-party** en base de datos propia.

---

## 3. Stakeholders y roles

### Stakeholders de negocio
| Quién | Rol |
|---|---|
| **Gastón** | Cliente / productor del evento. Decisor de negocio: precios, cuenta de cobro MP, sponsors reales, quiénes son admins. |
| **Agencia Mabel** ("Contenido IA Mabel") | Agencia productora (figura como *Produce* en Tikealo); crédito en el footer. |
| **Xnod** | Partner tecnológico que desarrolla y opera la plataforma. |
| **Alan Tapia** | Define el producto, toma las decisiones técnicas (stack, hosting, storage, feature flags); dueño de la cuenta de GitHub/deploy. |

### Roles dentro de la plataforma (PRD §3)
- **Visitante** — cualquiera; superficie pública. Al accionar se convierte en usuario de dispositivo.
- **Usuario (cuenta de dispositivo)** — público/asistente; cuenta automática al primer uso, perfil progresivo, sin contraseña ni logout.
- **Protagonistas verificados** (Diseñador / Influencer / Artista / Empresario) — perfil público en el catálogo; se obtiene por postulación + aceptación.
- **Expositor de stand** — "Mi stand": QR, leads, promos (fase futura).
- **Staff** — solo el scanner de check-in (acreditación en puerta).
- **Sponsor** — marca auspiciante; recibe reportes; panel de solo lectura (futuro).
- **Admin (organizador)** con sub-roles **OWNER / EDITOR / STAFF / VIEWER** y **auth real** (la regla "sin contraseñas" es solo para usuarios finales). Hoy el backend usa un único `ADMIN_TOKEN` Bearer (rol OWNER de facto); los sub-roles y el login OTP son trabajo pendiente.
- **Prensa / marketing** — operan vía el rol EDITOR del admin: cargan el **CMS de novedades/notas** y los **banners de publicidad**.

---

## 4. Modelo de negocio

Tesis comercial: **no cobrar comisiones; vender espacios medibles y datos propios.** Fuentes de ingreso:

### a) Entradas
- **Entrada General: gratis** (con inscripción obligatoria → genera el dato y el QR de acreditación).
- **Galas pagas** con precios reales (fuente Tikealo):
  - Sábado/Domingo Primera Pasada: **$0**
  - **Night VIP:** $30.000 + $3.000 de servicio
  - **Sunset VIP:** $30.000 + $3.000 de servicio
  - **Combo VIP 2 noches:** $50.000 + $5.000 de servicio
- Compra dentro de la plataforma → **Mercado Pago**. El motor de pago existe; activar entradas-por-MP en prod está **bloqueado por decisiones de Gastón** (cuenta de cobro + precios, o seguir en Tikealo). Si quedan en Tikealo, CCM solo **emite el QR de acreditación** para entradas vendidas afuera.

### b) Sponsors
- **Exclusividad por rubro** como estructura comercial central ("cada plataforma, un mercado propio").
- Niveles: **Principal / Oro / Plata**. Venden stands, activaciones, charlas, experiencias de marca y base segmentada por plataforma.
- Entregable estrella: **Reporte Técnico de Impacto por sponsor** (impresiones, clics, CTR, descargas bajo su banner, leads con consent, alcance) — exportable a PDF/CSV. **Implementado.**

### c) Publicidad / banners
- **9 slots publicitarios** (S1–S9) con tracking (interstitial de apertura, banner de feed, pre-descarga de foto, contenido patrocinado, newsletter, Mi QR, mapa patrocinado con píxel, evento/bloque patrocinado, activación).
- **Publicidad self-serve:** un anunciante compra un slot y **paga por QR vía Mercado Pago** (`AdCampaign`).
- **Banners gestionados por marketing:** imagen + destino (WhatsApp/link/formulario) + medición de clics + fijos/rotan (`Banner`). Es lo que pidió Gastón en los audios.

### d) Beneficios (para inscriptos)
- Al registrarse: sorteos, descuentos, beneficios antes/durante/después.
- Implementado: **descuentos para inscriptos** como CMS editable, con **códigos gated** (el código solo sale del backend si estás inscripto). Low-stakes: sin límite de usos ni anti-fraude (decisión de Gastón).

### e) Membresías
- **Membresía "Socio CCM"** con gate de contenido/eventos exclusivos (`socioOnly`). Segundo flujo de pago que reusa el motor de entradas. Precio y niveles: **decisión abierta de Gastón** (hoy el modelo es binario `free`/`socio`).

**Síntesis:** monetización indirecta vía sponsors/publicidad/datos (lo central) + monetización directa vía galas VIP y membresía Socio, con la entrada general gratuita como **motor de captura de datos** (cada inscripción = un perfil first-party).

---

## 5. Arquitectura

### 5.1 La idea central: el seam `DataStore`
Toda la UI consume datos a través de **una sola interfaz**, `DataStore` (`src/data/store/DataStore.ts`). Ninguna pantalla toca `localStorage`, el seed o la red directamente. Hay dos implementaciones intercambiables:

- **`LocalDataStore`** — Fase 0/demo: seed estático (`src/data/seed/*`) + `localStorage` con un sistema de **overlay** (`created/edited/deleted`) que da CRUD real sin backend. "Tiempo real" simulado por un bus interno + el evento `storage` del navegador entre pestañas.
- **`RemoteDataStore extends LocalDataStore`** — Fase 1+: caché en memoria hidratada desde el backend + **mutaciones optimistas** (provisional `tmp_`, POST, reconcile por id, revert si el server rechaza) + bus para reactividad. La interfaz sigue **síncrona**: el caché responde al instante, el backend recibe escrituras en segundo plano.

La elección es **una sola línea** (`src/data/store/index.ts`):
```ts
export const store: DataStore = API_BASE ? new RemoteDataStore(API_BASE) : new LocalDataStore()
```
`API_BASE = import.meta.env.VITE_API_URL`. **Con** `VITE_API_URL` → backend real; **sin** ella → demo offline. Si `RemoteDataStore` no se instancia, su código ni corre: el fallback nunca se rompe.

### 5.2 Reactividad: bus → TanStack Query
- Cada `writeJSON(key, …)` emite `bus.emit(key)`.
- Un bridge en `lib/queryClient.ts` hace `bus.on(key => queryClient.invalidateQueries({ queryKey: [key] }))`.
- Los hooks de `src/data/queries.ts` (`useEvents`, `useBenefits`, `useBanners`, `useNotas`, …) usan `useStoreQuery(key, read)` con `initialData: read` (valor síncrono al instante, sin flicker). Es la migración progresiva sync→async del store: cuando la interfaz pase a `Promise`, se quita `initialData` y aparecen los estados de carga sin big-bang.

### 5.3 Un solo servicio en producción
Hoy **un único servicio Railway** (`ccm-api`) sirve **el front buildeado + la API** desde el mismo origen:
- El front (Vite) se buildea con `VITE_BASE=/` y `VITE_API_URL=<el mismo dominio>` → pega al backend del mismo origen (sin CORS cross-origin, sin doble deploy).
- El server (Express) sirve `dist/` como estáticos + fallback SPA para cualquier ruta que **no** empiece con `/api/` (deep-links del router funcionan tras refresh), y la API en `/api/v1`.
- GitHub Pages sigue funcionando como demo pública estática conectada al mismo backend, pero quedó **redundante**.

```
┌─────────────────────────── Railway: servicio ccm-api ───────────────────────────┐
│  Express (Node)                                                                  │
│  ├── /api/v1/*  → routers → services → Prisma → PostgreSQL                       │
│  └── /*         → express.static(dist) + fallback SPA (index.html)               │
│                                                                                  │
│  Front (Vite/React) buildeado en dist/  ── RemoteDataStore ──► /api/v1 (mismo origen)
└──────────────────────────────────────────────────────────────────────────────────┘
        ▲ VITE_API_URL = https://ccm-api-production-91a9.up.railway.app
        ▼
  PostgreSQL (plugin Postgres de Railway)
```

### 5.4 Identidad sin contraseñas
El **dispositivo es la cuenta**. En la 1ª visita el front crea una identidad anónima; al pegar a backend, `POST /api/v1/devices` crea un `Device` (con `publicId` generado server-side) y devuelve un **device-token HMAC** que viaja en el header `X-Device-Token`. El perfil se completa por *progressive profiling*: cada acción gated (`requireProfile`) pide solo los campos faltantes, registrando **cuándo y en qué acción** se capturó cada dato (oro de segmentación).

---

## 6. Stack tecnológico

### Frontend (`/`, raíz del repo)
| Pieza | Versión / detalle |
|---|---|
| React | `^19.2.6` (+ StrictMode) |
| React Router | `react-router-dom` `^7.17.0` (`createBrowserRouter`) |
| TanStack Query | `@tanstack/react-query` `^5.101.1` |
| Vite | `^8.0.12` + `@vitejs/plugin-react` `^6.0.1` |
| TypeScript | `~6.0.2` (project references) |
| Tailwind | `tailwindcss` `^4.3.0` **v4 CSS-first** (sin `tailwind.config.js`; tokens en `src/index.css` con `@theme inline`) |
| PWA | `vite-plugin-pwa` `^1.3.0` (`registerType: 'prompt'`) |
| Iconos | `lucide-react` · QR `qrcode` |
| Fuentes | Schibsted Display (auto-hosteada, `src/fonts/`) + `@fontsource-variable/*` (archivo, fraunces, schibsted-grotesk) |
| Deploy a Pages | `gh-pages` · imágenes con `sharp` |

### Backend (`server/`)
| Pieza | Versión / detalle |
|---|---|
| Node | `>=20` (ESM puro, `"type": "module"`) |
| TypeScript | `^5.7.3` (NodeNext, strict) — corre con **`tsx`** en prod (no se compila) |
| Express | `^4.21.2` |
| Prisma | `@prisma/client` + `prisma` `^6.2.1` |
| PostgreSQL | vía plugin Postgres de Railway |
| Validación | `zod` `^3.24.1` |
| Seguridad | `helmet` `^8.2.0`, `cors`, `express-rate-limit` `^8.5.2` |
| Tests | `vitest` `^2.1.8` + `supertest` `^7.0.0` — **andamiaje listo, 0 archivos de test** (ver §9) |

**Dato de arquitectura de tipos:** el backend **no duplica** los tipos de dominio. El alias `@domain/types` (en `server/tsconfig.json`) apunta a `../src/data/types.ts` (el front); `server/src/lib/serialize.ts` traduce filas de Prisma → shapes del front.

### Infraestructura
- **Railway** — un servicio `ccm-api` (front + API) + plugin Postgres. Imagen Docker multi-stage (raíz `Dockerfile`).
- **GitHub Pages** — `soyalantapia/ccm-app`, demo estática redundante.
- Repo: **single-app** (no monorepo). Front en `src/`, backend en `server/`.

---

## 7. Modelo de datos

PostgreSQL + Prisma. **29 modelos, 15 enums, 6 migraciones.** Schema: `server/prisma/schema.prisma`. Canon detallado: `work-agent/backend/04-modelo-de-datos.md`.

### Convenciones transversales
- IDs de negocio con **PK textual semántica** (`ev-…`, `sp-…`, `cat-…`, `ben-…`, `bnr-…`, `nota-…`) reutilizada del front (contrato de deep-links — **no regenerar**). Las entidades técnicas usan `cuid()`.
- **`Device` es la única raíz de usuario** (no hay tabla de usuario tradicional). La PII vive en `ProfileField` (key/value/source/capturedAt), no en columnas planas.
- `onDelete`: `Cascade` para hijos de `Device`; `SetNull` cuando el registro debe sobrevivir al borrado del device (órdenes, pagos, analytics, applications); `Restrict` en `Gallery → Sponsor`.
- Dinero en **enteros** (centavos/pesos Int).

### Modelos por dominio
| Dominio | Modelos |
|---|---|
| Identidad | `Device`, `ProfileField` |
| Eventos / agenda | `Event`, `EventBlock`, `EventSponsor`, `Registration` |
| Entradas | `TicketPlan`, `TicketOrder`, `Ticket` |
| Catálogo / expositores | `CatalogProfile`, `PortfolioPiece` |
| Fotos | `Gallery`, `Photo`, `PhotoFavorite`, `PhotoDownload` |
| Sponsors / ads | `Sponsor`, `SponsorCreative`, `AdCampaign`, `Banner` |
| Contenido | `ContentItem` (videos), `Nota` (CMS editorial) |
| Beneficios | `Benefit` |
| Membresías / pagos | `Membership`, `Payment` (polimórfica) |
| Convocatorias | `Convocatoria`, `ConvocatoriaField`, `Application` |
| Analytics | `AnalyticsEvent` |
| Admin | `AdminUser` |

### Enums (15)
`EventType` (principal·camino·capacitacion) · `RegistrationStatus` (confirmada·cancelada) · `PlanDay` (sabado·domingo·combo) · `PlanKind` (general·vip) · `OrderStatus` (iniciada·redirigida_mp·confirmada·cancelada) · `SponsorLevel` (Principal·Oro·Plata) · `AdSlot` (S1·S2·S3·S4·S6 — S5 es hueco intencional) · `MembershipTier` (free·socio) · `ApplicationStatus` (preinscripta·aceptada·rechazada) · `CampaignStatus` (pendiente_pago·activa·expirada·rechazada) · `AdminRole` (OWNER·EDITOR·STAFF·VIEWER) · `PaymentKind` (ticket_order·membership·ad_campaign) · `PaymentStatus` (pending·approved·rejected·refunded) · `ProfileFieldKey` (firstName·lastName·email·profession·phone·dni·city·instagram) · `BannerDestination` (whatsapp·link·form).

### Reglas de negocio en los datos
- **Cupo anti-oversell:** `taken = min(capacity, seedTaken + count(confirmadas))`. La inscripción usa `SELECT … FOR UPDATE` dentro de transacción; a nivel evento (`blockId: null`) toma lock sobre `Event` porque dos `NULL` no colisionan en el índice único `@@unique(deviceId,eventId,blockId)`.
- **Total de orden congelado** al crear: `(price + serviceCharge) * qty`.
- **`Ticket`** con `@@unique(deviceId, jornada)` (una entrada por jornada) y `qrToken` = jti del JWT de acreditación.
- **`Payment` polimórfica:** un solo lugar para los 3 cobros (`ticket_order`, `membership`, `ad_campaign`), idempotencia por `mpPaymentId @unique`.
- **`AdCampaign`:** índice único **parcial** `one_active_per_slot` (SQL crudo, migración 1) → una sola campaña activa por slot.

### Migraciones (6)
`0_init` (esquema base, 26 tablas) · `1_one_active_per_slot` (índice parcial) · `2_benefit` · `3_banner` (+ enum `BannerDestination`) · `4_catalog_price_contact` (`CatalogProfile.whatsapp` + `PortfolioPiece.price`) · `5_nota`.

### Seed (`server/prisma/seed.ts`, idempotente)
4 sponsors (+11 creatives) · 5 planes · eventos de capacitación · 18 bloques · 12 perfiles de catálogo (+48 piezas) · 4 galerías (+58 fotos) · 3 videos · 1 convocatoria (+12 campos) · 24 postulaciones históricas · 4 beneficios · 3 banners (1 fijo + 2 rotan) · 2 notas. No siembra entidades de runtime (devices, registrations, orders, tickets, payments, analytics, etc.).

---

## 8. Funcionalidades (todo lo que tenemos)

### Superficie pública (bajo `SiteLayout`)
`/` Landing · `/entradas` · `/eventos` + `/eventos/:slug` · `/catalogo` + `/p/:slug` (ficha de expositor) · `/fotos` + `/fotos/:slug` · `/contenido` (videos) · `/c/:slug` (convocatoria) · `/sponsors` · `/publicidad` (self-serve) · `/membresia` · `/beneficios` · `/novedades` + `/novedades/:slug` · `/stand` + `/stand/:slug` · `/terminos` · `/privacidad`.

### App del asistente (misma PWA, sin login)
`/app` (Inicio/feed) · `/mi-qr` (credencial QR) · `/perfil`.

### Panel del organizador (`/admin`)
12 secciones navegables (orden del menú en `AdminLayout`) + la pantalla de detalle de evento (`/admin/eventos/:id`) = 13 rutas ruteadas:
Dashboard · Eventos *(+ detalle)* · Postulaciones · Personas (CRM) · Galerías (+sponsors) · Catálogo (expositores) · Contenido · **Novedades** (notas) · **Beneficios** · **Banners** · Órdenes (entradas) · Configuración (tema + planes/MP).

### Las 4 features de los audios de Gastón (todas end-to-end, en prod)
Cada una atraviesa: modelo Prisma → service → rutas (pública + `/admin` CRUD) → página pública → panel admin → seed.

1. **Beneficios** — descuentos para inscriptos; el `code` **solo sale del backend si el device tiene una inscripción confirmada** (`benefitService` + `serialize.toBenefit(withCode)`). Página `/beneficios`, admin `/admin/beneficios`. Commit `3ae803a`.
2. **Banners gestionados** — marketing sube imagen + destino (WhatsApp/link/form) + se **miden clics** (`banner_click`/`banner_impression`); principales fijos + resto rota (`ManagedBanner.tsx`). Admin `/admin/banners`. Commit `e21677c`.
3. **Participantes** — `PortfolioPiece.price` + `CatalogProfile.whatsapp`; la ficha `/p/:slug` muestra precio (hero y por obra) + botón "Contactar". Admin `/admin/catalogo`. Commit `550f0ca`.
4. **Notas / CMS editorial** — notas con texto + portada + video de YouTube; `getNotas` solo `published`; slug único. Páginas `/novedades` y `/novedades/:slug`, admin `/admin/novedades`. Commit `e780e5b`.

### Plataforma de base (lo que ya estaba)
Identidad sin contraseñas + perfil progresivo · agenda con inscripción por bloque y **cupo real** · catálogo producto↔autor · galerías con descarga gated por datos + banner de sponsor · contenido (YouTube embed) · sponsors + Reporte Técnico de Impacto · publicidad self-serve · membresía Socio · convocatorias + postulaciones · analytics first-party · PWA instalable + theming por tokens.

---

## 9. Seguridad

| Control | Estado |
|---|---|
| **Device-token HMAC-SHA256** (`server/src/lib/deviceToken.ts`) | ✅ Emisión server-only en `POST /devices`; validación constant-time (`timingSafeEqual`); header `X-Device-Token`. Cierra la suplantación previa por `X-Device-Id`. **Sin expiración/rotación** (llega con login OTP). |
| **Gating de códigos de beneficio** | ✅ El `code` se omite del JSON salvo device inscripto (server-side). |
| **Href seguro (doble capa)** | ✅ Front `safeExternalHref` (degrada) + server `cleanStoredUrl` (rechaza 400). Bloquean `javascript:`/`data:`/`vbscript:`/`file:`. |
| **`assertProd()`** | ✅ Aborta el arranque en prod si falta `ADMIN_TOKEN`/`DEVICE_TOKEN_SECRET` o `CORS_ORIGINS='*'`. |
| **Rate limiting** | ✅ Por IP, venue-aware: `writeLimiter` (mutaciones, 120/min) + `analyticsLimiter` (600/min); **GETs no limitados** (en el venue todos comparten la IP de la WiFi por NAT). |
| **helmet / cors / json limit** | ✅ helmet con CSP/COEP off (sirve la SPA); CORS allowlist; body 1 MB. |
| **XSS** | ✅ Sin `dangerouslySetInnerHTML`; el body de notas se renderiza como texto; YouTube por `youtube-nocookie.com`. |
| **IDOR / PII** | ✅ `deviceId` sale del token verificado (no spoofeable); listados de PII detrás de `requireAdmin`. |
| ⚠️ **Auth admin = shared secret de un solo rol** | El `ADMIN_TOKEN` Bearer es temporal de Fase G. **Pendiente principal:** login OTP por email (RESEND) + roles `AdminRole` (OWNER/EDITOR/STAFF/VIEWER). |
| 🔴 **Tests = CERO** | El andamiaje (`vitest` + `supertest`) está montado en `server/` pero **no hay un solo archivo de test**; el front no tiene runner. Cobertura efectiva 0%. La correctness se valida hoy por `tsc -b` + revisiones adversariales/QA manuales. Es la **deuda técnica #1**. |

---

## 10. Estado por fases (qué está en prod)

El backend se construyó migrando **dominio por dominio** (no capa por capa) contra la interfaz `DataStore`. Las letras son el plan de `work-agent/backend/10-plan-migracion-fases.md`.

| Fase | Qué cubre | Estado |
|---|---|---|
| **0** | Esqueleto Express+Prisma+Postgres, `/health`, deploy Railway | ✅ Shipped |
| **A** | Identidad + perfil + analytics (`/me`, `/analytics`) | ✅ Shipped |
| **B** | Eventos + bloques + inscripciones + **cupo atómico** | ✅ Shipped (verificado: 36 inscripciones paralelas → 28 entran / 8 → 409) |
| **C** | Entradas + pago Mercado Pago (webhook, idempotencia) | ⏳ Motor construido; **activación bloqueada por Gastón** (cuenta MP + precios, o Tikealo) |
| **D** | Membresía Socio CCM + gate `socioOnly` | ✅ Shipped (`de4d3b6`) |
| **E** | Catálogo + galerías + contenido + (uploads) | ✅ Shipped — falta decidir storage de imágenes (R2 vs Spaces) |
| **F** | Publicidad self-serve + sponsors (pago por QR) | ✅ Shipped (`980025a`) |
| **G** | Auth admin (Bearer temporal) + CRUD del organizador | ✅ Shipped — falta login OTP + roles |
| **H** | Acreditación QR en puerta (un-uso por jornada, offline) | ⏳ Planeada, no shipped — trabajo del día del evento |

**Cierre del ciclo:** `a2645ac` centralizó front+API en un solo servicio Railway. Hardening previo: `34c418d` device-token, `d56d736` helmet+rate-limit, `12504fd` migraciones versionadas.

**Pendientes que necesitan insumos externos:** checkout MP de entradas (token de Gastón), uploads de imágenes reales (decisión R2/Spaces + URLs), login OTP prensa/marketing (RESEND + emails), acreditación QR (Fase H), y la ronda de **testeo de flujos** end-to-end antes del lanzamiento.

---

## 11. Deploy e infraestructura

### Producción (Railway, un servicio)
- **Servicio:** `ccm-api` · **Dominio:** `https://ccm-api-production-91a9.up.railway.app`
- **Deploy (front + API en un comando), desde la raíz del repo:**
  ```bash
  railway up . --path-as-root -s ccm-api -c
  ```
- **Imagen:** `Dockerfile` (raíz), multi-stage:
  1. *build:* `npm ci` (front) → `npm run build` con `VITE_BASE=/`, `VITE_API_URL=<dominio>`, `VITE_OG_SITE=<dominio>` → `server/`: `npm ci --include=dev` + `npx prisma generate`.
  2. *runtime:* copia `server/`, `dist/` y `src/` (tipos). `ENV NODE_ENV=production`, `FRONT_DIST=/app/dist`. **CMD:** `sh -c "npx prisma migrate deploy && npx tsx src/index.ts"` (las migraciones se aplican en cada deploy; si fallan, el contenedor sale y Railway conserva la versión sana).
- ⚠️ Hay un `server/Dockerfile` legacy (solo-API). El activo es el de la **raíz**.

### Variables de entorno (prod)
Obligatorias (sin ellas `assertProd` aborta): **`DATABASE_URL`**, **`CORS_ORIGINS`** (≠ `*`), **`ADMIN_TOKEN`**, **`DEVICE_TOKEN_SECRET`**. Las fija el Dockerfile: `NODE_ENV`, `FRONT_DIST`. Opcionales por fase: `RATE_LIMIT_WRITES`/`RATE_LIMIT_ANALYTICS` (subirlas el día del evento), `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET`, `STORAGE_*`, `RESEND_API_KEY`, `ACCREDITATION_TOKEN_SECRET`, `OTP_PEPPER`. Contrato completo validado con zod en `server/src/lib/env.ts`.

### GitHub Pages (redundante)
CI en `.github/workflows/deploy.yml` (push a `main`) buildea con `VITE_API_URL=<Railway>` y base `/ccm-app/`. Deploy manual: `npm run deploy`. Quedó secundario tras centralizar en Railway.

### Correr local
- **Front:** `npm install && npm run dev` (Vite, default :5173). Sin `VITE_API_URL` → demo offline; con ella → backend real.
- **Server:** desde `server/`: `npm install`, `cp .env.example .env` (completar `DATABASE_URL`), `npm run prisma:generate`, `npm run prisma:migrate`, `npm run dev` (`tsx watch`, :4000).
- **DB:** no hay Postgres local en el repo; se puede apuntar a la DB de prod poniendo su `DATABASE_URL` en `server/.env` (⚠️ escribe datos reales).

### Comandos clave
| Comando | Qué hace |
|---|---|
| `npm run dev` | Front en dev (HMR) |
| `npm run build` | **`tsc -b && vite build`** — el typecheck real es `tsc -b`, **no** `tsc --noEmit` (ver gotcha en README) |
| `npm run deploy` | Build + push a `gh-pages` |
| `cd server && npm run dev` | API en watch |
| `cd server && npm run prisma:deploy` | Aplicar migraciones |
| `cd server && npm run db:seed` | Sembrar datos |
| `cd server && npm test` | Vitest (hoy 0 tests) |
| `railway up . --path-as-root -s ccm-api -c` | Deploy de todo (front + API) |

---

## 12. Roadmap y futuro

- **Mercado Pago completo** (entradas): webhook de confirmación, idempotencia, checkout nativo. Bloqueado por decisión comercial de Gastón.
- **Acreditación QR en puerta (Fase H):** JWT firmado + un-uso por jornada + modo offline (cola + sync). Camino crítico del día del evento.
- **Login OTP + RBAC** para el organizador (reemplaza el `ADMIN_TOKEN` Bearer): roles OWNER/EDITOR/STAFF/VIEWER.
- **Uploads de imágenes reales:** object storage S3-compatible (R2 vs Spaces) con presigned URLs.
- **Suite de tests** (la deuda #1): vitest+supertest sobre Postgres real — webhook MP (firma+idempotencia), concurrencia de cupo, acreditación.
- **Año-round / expansión 2027:** multi-tenant / multi-ciudad (Mendoza, Tucumán, Costa Rica, Dubái), dos temporadas, tarjeta CCM de beneficios, panel sponsor self-service, networking 1:1, revista digital, audiencias de retargeting (con marco legal), empaquetado App Store/Play Store.
- **Prerender/SSG** de rutas públicas (SEO + LCP<2,5s en frío) — única "L" del roadmap de Fase 0.

---

## 13. Decisiones abiertas (bloqueantes)

| Tema | Quién decide |
|---|---|
| Entradas por **MP** vs **Tikealo** | Gastón / Alan |
| **Precios reales** de los 5 planes + **cuenta de cobro MP** (a nombre de quién) | Gastón |
| **Precio y niveles** de la membresía Socio | Gastón |
| **R2 vs DigitalOcean Spaces** para imágenes | Alan |
| Acceso al **Drive** de fotos reales + IDs de YouTube | Gastón |
| Reglas de **exclusividad/solapamiento** de campañas | Gastón |
| **Emails de los admins** → mapeo a roles | Gastón / Alan |
| **Texto legal** real (privacidad/términos, Ley 25.326) | requiere asesoría legal |

---

## 14. Historia del proyecto

1. **Fase 0 — demo (junio 2026).** PWA 100% frontend (seed + localStorage detrás de `DataStore`) para **validar la idea** ante CCM. ~74 decisiones registradas en `DECISIONS.md`: tema editorial por tokens, identidad sin contraseñas, precios reales de Tikealo, CRUD admin por overlay, auditorías 360, performance Lighthouse (90 móvil). Desplegada en GitHub Pages.
2. **Backend real (fases A–G).** Express + Prisma + Postgres en Railway; migración dominio por dominio con `RemoteDataStore` conmutable por `VITE_API_URL`. Identidad/analytics (A), eventos/cupos (B), membresía (D), catálogo/galerías/contenido (E), publicidad self-serve (F), auth+CRUD admin (G).
3. **Hardening.** Device-token HMAC (cierra suplantación), helmet + rate-limit venue-aware, migraciones Prisma versionadas, `assertProd`.
4. **Las 4 features de los audios de Gastón** (25-27/06): beneficios, banners gestionados, participantes con precio+contacto, CMS de notas. Revisadas con workflow adversarial + fixes (`5bedb12`).
5. **Centralización (27/06).** Front+API en un solo servicio Railway (`a2645ac`) → un solo link para Gastón.

---

## 15. Convenciones canónicas (LEY)

De `work-agent/backend/00-README.md` (16 decisiones canónicas), las vigentes:
1. Prefijo único **`/api/v1`**; `VITE_API_URL` **sin** el prefijo (el cliente arma `+ '/api/v1'`).
2. Identidad raíz **única `Device`**; PII en `ProfileField` (no columnas planas); todas las FKs → `Device.id`; no existe `DeviceProfile` (se serializa).
3. Pagos: **una `Payment` polimórfica**; cada recurso conserva su máquina de estados.
4. Analytics: `POST /api/v1/analytics` (batch, fire-and-forget).
5. **QR híbrido:** JWT firmado (`ACCREDITATION_TOKEN_SECRET`) + fila `Ticket` para un-solo-uso.
6. **3 secretos JWT separados** (`DEVICE_/ADMIN_/ACCREDITATION_TOKEN_SECRET`).
7. `socioOnly` a nivel evento (el bloque lo hereda).
8. **No hard-delete** de datos reales (409 / soft-delete).
9. Tipos compartidos: el server importa `src/data/types.ts` vía `@domain/types`.
10. v1 = **1 instancia** Railway (rate-limit en memoria OK; Redis recién a ≥2).

**Reglas de oro del front (`CLAUDE.md`):** la UI consume SOLO `store`/`useStore`/hooks de `queries.ts` (nunca seed ni `localStorage` directo); todo en **español rioplatense (voseo)**, código en inglés; **theming 100% por tokens** `--t-*`; nunca sacar al usuario de la app (YouTube embebido); **trackear toda interacción**; mobile-first.

**Patrón canónico del equipo:** archivos reales en `~/dev/ccm-app` + symlink en `~/Desktop/Programacion` (Desktop está en iCloud y rompe esbuild/rollup).

---

## 16. Mapa de la documentación

| Documento | Para qué |
|---|---|
| **`PROJECT.MD`** (este) | La biblia: negocio + arquitectura + estado real. Empezá acá. |
| `README.md` | Onboarding técnico del repo: stack, cómo correr, comandos, deploy, qué hay en work-agent. |
| `CONTRIBUTING.md` | Cómo trabajamos en equipo: setup, ramas, commits, PRs, definición de "hecho", reglas de oro. |
| `API.md` | Contrato de la API: todos los endpoints (método · path · auth · qué hace), errores, rate limits. |
| `SECURITY.md` | Controles de seguridad implementados, modelo de amenazas y pendientes (RBAC, OTP, tests, PII). |
| `RUNBOOK.md` | Operación: deploy, rollback, incidentes, backups y el **día del evento** (picos ~20k). |
| `docs/PRD.md` | Biblia de producto v1.1 (visión, D1–D27, navegación, slots, fases 0–3). |
| `DESIGN.md` | Sistema de diseño (tokens, tipografía, kit de UI, voz). |
| `DECISIONS.md` | Registro cronológico de ~74 decisiones de la Fase 0 (demo). |
| `AUDITORIA.md` | Auditoría 360 de la demo Fase 0. |
| `CLAUDE.md` | Guía para agentes (convenciones del front). |
| `work-agent/ESTADO-ACTUAL.md` | **Estado real vivo** del backend/proyecto (qué fase, qué shipped, pendientes). |
| `work-agent/HANDOFF-COMPLETO.md` | Handoff autosuficiente del estado real del backend. |
| `work-agent/backend/00–13` | **PLAN** de arquitectura del backend (escrito antes de implementar; ver el ESTADO-ACTUAL para lo realmente hecho). `00` = 16 decisiones canónicas (LEY). |
| `work-agent/backend/build/*` | Prompts y plan estratégico de construcción. |

> ⚠️ **Cuidado con los docs de plan:** `work-agent/backend/00–13` y los `server/README.md`/`server/CLAUDE.md` se escribieron como plan/Fase 0 y hablan en futuro de cosas ya hechas. Para el **estado real** mandan este `PROJECT.MD` y `work-agent/ESTADO-ACTUAL.md`.
