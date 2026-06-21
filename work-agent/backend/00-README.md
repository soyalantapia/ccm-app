# Backend de CCM — Plan de arquitectura

Plan completo para llevar **Córdoba Corazón de Moda** de demo (Fase 0, frontend puro) a una plataforma con backend real, lista para el evento del **19–20/09/2026**. Este archivo es el índice y la **fuente de verdad de las decisiones transversales**: si dos documentos parecen contradecirse en un detalle, manda lo que dice acá.

---

## Resumen ejecutivo

- **La tesis:** toda la app accede a datos a través de una sola interfaz, `DataStore` (~60 métodos), hoy implementada por `LocalDataStore` (seed + localStorage). El backend **no obliga a reescribir pantallas**: se implementa un `RemoteDataStore` contra **esa misma interfaz**, conmutable por `VITE_API_URL`, con fallback al `LocalDataStore`. Esa costura es lo que hace la migración de bajo riesgo.
- **Stack:** Node.js + TypeScript + Express + PostgreSQL + Prisma, en **Railway**. Pagos con **Mercado Pago**. Imágenes subidas en **object storage** (R2/Spaces). Auth **passwordless**. Es el mismo stack que Alan ya corre en Norte / romi-alan / My Alquiler → menor riesgo de cara a una fecha dura.
- **Frontend:** sigue **estático en GitHub Pages**; se conecta al API de Railway por `VITE_API_URL` (CORS). Solo cambia esa variable.
- **3 flujos de pago reales** a habilitar (hoy mock): **entradas** (`TicketOrder`), **membresía Socio CCM** (`becomeSocio`), **publicidad autogestionada** (`AdCampaign`). La confirmación la dispara **un webhook de Mercado Pago**, única fuente de verdad del pago.
- **Migración por fases** (doc 10), trabajando hacia atrás desde una fecha de "listo para producción" con colchón antes del evento (doc 12).

---

## Fuentes de verdad por tema

Cuando haya dudas, estos documentos mandan sobre su tema:

| Tema | Doc canónico |
|------|--------------|
| Schema de base de datos (Prisma) | **04 — Modelo de datos** |
| Paths de API y taxonomía de eventos | **05 — Contrato de API** |
| Acreditación / QR en puerta | **13 — Acreditación en puerta** |
| Secretos y roles | **06 — Auth, identidad y seguridad** |

---

## 🔒 Decisiones canónicas (ya tomadas)

Resuelven las contradicciones que aparecen al escribir los docs por separado. **No se discuten salvo cambio explícito.**

1. **Prefijo de API:** todo cuelga de `/api/v1`. `VITE_API_URL` **no** incluye el prefijo (el cliente arma `VITE_API_URL + '/api/v1'`).
2. **Identidad (raíz):** una sola entidad `Device { id (cuid), publicId, createdAt }`. La PII vive en tabla hija `ProfileField` (key/value/source/capturedAt), **no** en columnas planas. Todas las FKs de usuario referencian `Device.id`. No existe tabla `DeviceProfile`.
3. **Pagos (storage):** una tabla **`Payment` polimórfica única** (`kind`, `resourceId`, `mpPreferenceId`, `mpPaymentId`, `status`…). Los recursos **no** duplican columnas MP; cada uno conserva su propia máquina de estados que el webhook actualiza. `Membership` tiene PK propia `id`.
4. **Webhook MP:** `POST /api/v1/webhooks/mp` (nunca `/mercadopago`).
5. **Ingesta analytics:** `POST /api/v1/analytics` (batch).
6. **Orden redirigida:** `POST /api/v1/orders/:id/redirected`. **Check-in:** `POST /api/v1/admin/checkin` (rol `STAFF`).
7. **QR/acreditación (híbrido):** el QR es un **JWT firmado** (`ACCREDITATION_TOKEN_SECRET`, exp = fin del evento) **+ fila `Ticket`** para el estado de un-solo-uso. Se emite por **entrada gratis confirmada** o por **webhook MP `approved`** de entrada paga. Detalle en doc 13.
8. **Secretos JWT:** tres separados — `DEVICE_TOKEN_SECRET`, `ADMIN_TOKEN_SECRET`, `ACCREDITATION_TOKEN_SECRET` (nunca uno único).
9. **Roles admin:** enum `AdminRole { OWNER, EDITOR, STAFF, VIEWER }` (`STAFF` = puerta).
10. **AdCampaign:** vigencia con `startsAt`/`expiresAt` + enum `CampaignStatus { pendiente_pago, activa, expirada, rechazada }`. Una campaña `activa` por slot.
11. **Interfaz `DataStore` → asíncrona:** los métodos pasan a `Promise<T>`. `LocalDataStore` envuelve en `Promise.resolve`. Call-sites a tocar: `TicketSelector` (createOrder), botón de membresía (becomeSocio), publicidad (createCampaign).
12. **`socioOnly`:** gate a nivel **evento** (y `ContentItem`); el bloque hereda el del evento.
13. **Taxonomía de analytics:** los nombres reales del código (`ticket_order_created`, `ticket_order_redirected_mp`, `membership_purchased`, …), no inventar variantes.
14. **Borrado:** entidades con datos reales no se hard-deletean (409 o soft-delete `archivedAt`).
15. **Tipos compartidos:** el backend vive en `server/` en el **mismo repo** e importa `src/data/types.ts` (path alias) + test de paridad de los zod.
16. **Instancias:** v1 corre **1 instancia** en Railway (rate-limit en memoria y SSE OK). Mover a Redis recién con ≥2 instancias.

---

## Índice de documentos

| # | Documento | Qué cubre |
|---|-----------|-----------|
| [01](01-estado-actual.md) | Estado actual | La costura `DataStore`, por qué la migración es de bajo riesgo |
| [02](02-objetivos-y-alcance.md) | Objetivos y alcance | Qué habilita el backend, v1 vs después, criterios de éxito |
| [03](03-stack-tecnologico.md) | Stack tecnológico | Node+TS+Express+Postgres+Prisma+Railway+MP, con alternativas |
| [04](04-modelo-de-datos.md) | **Modelo de datos** | Schema Prisma completo, cupos, `Payment`, `Ticket`, analytics |
| [05](05-api-contrato.md) | **Contrato de API** | REST que cubre los ~60 métodos del `DataStore` |
| [06](06-auth-identidad-seguridad.md) | **Auth / identidad / seguridad** | Device-token, auth de organizador, CORS, PII/consentimientos |
| [07](07-pagos-mercadopago.md) | Pagos Mercado Pago | Los 3 flujos + preferencias + webhook + idempotencia |
| [08](08-analytics-tiempo-real.md) | Analytics y tiempo real | Ingesta, dashboard en vivo (polling→SSE), CSV, KPIs |
| [09](09-infra-deploy-devops.md) | Infra / deploy / DevOps | Railway, env, migraciones, object storage, backups, testing |
| [10](10-plan-migracion-fases.md) | Plan de migración | `RemoteDataStore` conmutable + cutover dominio por dominio |
| [11](11-riesgos-y-decisiones-abiertas.md) | Riesgos y decisiones | 🔶 lo que depende de Gastón/Alan + riesgos con mitigación |
| [12](12-roadmap-y-estimacion.md) | Roadmap y estimación | Hitos hacia atrás desde el evento + esfuerzo |
| [13](13-acreditacion-en-puerta.md) | **Acreditación en puerta** | QR (JWT+Ticket), endpoint de scan, modo online/offline |

---

## Orden de lectura recomendado

1. **Empezar:** 01 (estado actual) → 02 (objetivos) → 03 (stack). Te dan el "por qué" y el "con qué".
2. **El diseño:** 04 (datos) → 05 (API) → 06 (auth) → 13 (acreditación). El núcleo técnico.
3. **Los flujos sensibles:** 07 (pagos) → 08 (analytics/tiempo real).
4. **Cómo se hace realidad:** 09 (infra) → 10 (migración por fases) → 12 (roadmap).
5. **Antes de comprometer fechas:** 11 (riesgos y decisiones abiertas).

---

## 🔶 Decisiones abiertas (bloquean el avance)

Detalle completo con opciones y recomendación en el **doc 11**. Las de negocio se cruzan con las preguntas del mail a Gastón:

**De negocio (Gastón):**
- Precios reales de entradas y de la membresía Socio CCM (varios `price` hoy son `null`).
- **Cuenta y credenciales de Mercado Pago** (a nombre de quién) — la de mayor impacto en el alcance.
- ¿Las entradas siguen en **Tikealo** o migran a checkout propio? (define una rama entera; ver doc 10).
- Membresía: **pago único por edición vs suscripción** que se renueva.
- Sponsors reales 2026 (niveles, exclusividad) y qué datos se exponen a sponsors (CRM/leads + acuerdo legal).
- Modelo de acreditación: ¿QR por jornada o por entrada? ¿uno por persona o por orden?

**Técnicas (Alan):**
- Dominio del API (ej. `api.ccm.com.ar`) y si el frontend se queda en GitHub Pages.
- Presupuesto/tier de Railway (servicio always-on para evitar cold start el día del evento).
- Object storage: Cloudflare R2 vs DigitalOcean Spaces.
- Recuperación de identidad passwordless: magic link por email vs código por WhatsApp.
- Cifrado de PII en reposo (Ley 25.326 de datos personales).

---

## Próximos 3 pasos (para arrancar)

1. **Destrabar las decisiones de negocio** con Gastón (cuenta de MP y precios sobre todo) — sin la cuenta de MP, los 3 flujos de pago no avanzan.
2. **Levantar el esqueleto:** carpeta `server/` en el repo, Express + Prisma + Postgres en Railway, `prisma migrate` con el schema del doc 04, y `GET /api/v1/health`. (Fase 0 del doc 10.)
3. **Primera fase vertical de bajo riesgo:** identidad + perfil + analytics (Fase A del doc 10) — implementar `RemoteDataStore` para esos métodos, conmutable por `VITE_API_URL`, y validar el patrón end-to-end antes de tocar pagos.
