# API.md — Contrato de la API de CCM

Referencia de la API REST. Todos los endpoints cuelgan de **`/api/v1`**. Base en producción: `https://ccm-api-production-91a9.up.railway.app/api/v1`.

> Fuente: `server/src/routes/*` + `server/src/app.ts`. Si agregás/cambiás un endpoint, **actualizá esta tabla**.

---

## Autenticación

| Tipo | Cómo | Cuándo |
|---|---|---|
| **Pública** | sin token | lecturas de contenido público |
| **Device** | header **`X-Device-Token`** (HMAC, emitido por `POST /devices`) | acciones del asistente (perfil, inscripciones, favoritos…). Falta → `401 DEVICE_REQUIRED` |
| **Device-opcional** | `X-Device-Token` si hay; si no, responde igual pero "anónimo" | rutas que enriquecen su respuesta con identidad (beneficios, analytics, postularse) |
| **Admin** | header **`Authorization: Bearer <ADMIN_TOKEN>`** | todo `/admin/*`. Sin header → `401 ADMIN_REQUIRED`; token incorrecto → `403 ADMIN_FORBIDDEN`; `ADMIN_TOKEN` no seteado en el server → `503 ADMIN_AUTH_DISABLED` |

> El `ADMIN_TOKEN` Bearer es **auth temporal** (un solo rol OWNER de facto). El plan es reemplazarlo por login OTP + roles `AdminRole`. Ver [`SECURITY.md`](./SECURITY.md).

## Formato de error (uniforme)

```json
{ "error": { "code": "BLOCK_FULL", "message": "…", "details": { } } }
```
Mapeos automáticos: `ZodError → 400 VALIDATION_ERROR`; Prisma `P2025 → 404 NOT_FOUND`, `P2002 → 409 DUPLICATE`, `P2003/P2014 → 409 FK_CONSTRAINT`; lo no controlado → `500 INTERNAL` (con stack logueado server-side, sin PII).

## Rate limiting (por IP)

- **Mutaciones** (POST/PATCH/PUT/DELETE, excepto `/analytics`): `RATE_LIMIT_WRITES`, default **120/min**. Los GET **no** se limitan (en el venue todos comparten la IP de la WiFi).
- **`POST /analytics`**: `RATE_LIMIT_ANALYTICS`, default **600/min**.
- Exceso → `429 RATE_LIMITED`. Subir los límites el día del evento ([`RUNBOOK.md`](./RUNBOOK.md)).

---

## Endpoints

### Salud e identidad
| Método | Path | Auth | Qué hace |
|---|---|---|---|
| GET | `/health` | pública | `SELECT 1`. `200 {ok,version,db:'up'}` o `503`. Healthcheck de Railway. |
| POST | `/devices` | pública | Crea `Device` (con `publicId` server-side), firma y devuelve `201 {deviceId, token}`. |

### Perfil del asistente (`/me`)
| Método | Path | Auth | Qué hace |
|---|---|---|---|
| GET | `/me` | device | Perfil del device (fields + consents). |
| PATCH | `/me/fields` | device | Captura progresiva de campos. Body `{values:{firstName,…}, source}`. |
| PATCH | `/me/consents` | device | Consentimientos `{terms?,news?,sponsors?}` (`true`→timestamp, `false`→null). |

### Membresía
| Método | Path | Auth | Qué hace |
|---|---|---|---|
| GET | `/memberships/me` | device | Membresía del device (`{tier:'free',…}` si no hay). |
| POST | `/memberships` | device | Hacerse Socio (upsert `tier:'socio'`). Cobro real = Fase D/MP. |

### Eventos, agenda e inscripciones
| Método | Path | Auth | Qué hace |
|---|---|---|---|
| GET | `/events` | pública | Todos los eventos (con `sponsorIds`), orden por fecha. |
| GET | `/events/:slug` | pública | Ficha de evento (404 `EVENT_NOT_FOUND`). |
| GET | `/events/:id/blocks` | pública | Bloques de un evento. |
| GET | `/blocks/:id/availability` | pública | Cupo en vivo `{capacity,taken,left,full}`. |
| GET | `/registrations` | device | Mis inscripciones confirmadas. |
| POST | `/registrations` | device | Inscribirse. Body `{eventId, blockId?}`. Errores: `SOCIO_ONLY` (403), `ALREADY_REGISTERED` (409), `BLOCK_FULL` (409). Lock `FOR UPDATE` anti-oversell. |
| DELETE | `/registrations/:id` | device | Cancelar (libera cupo). 404 si es ajena. |

### Catálogo, fotos, contenido, sponsors, planes, convocatorias
| Método | Path | Auth | Qué hace |
|---|---|---|---|
| GET | `/catalog` | pública | Expositores con portfolio. |
| GET | `/catalog/:slug` | pública | Un perfil (incluye `whatsapp` + `portfolio[].price`). |
| GET | `/galleries` | pública | Galerías con fotos. |
| GET | `/galleries/:slug` | pública | Una galería. |
| GET | `/contents` | pública | Videos del archivo. |
| GET | `/sponsors` | pública | Sponsors con creatives. |
| GET | `/plans` | pública | Planes de entrada (`TicketPlan`). |
| GET | `/convocatorias/:slug` | pública | Formulario de convocatoria con campos. |
| GET | `/applications` | device | Mis postulaciones. |
| POST | `/applications` | device-opcional | Postularse. Body `{convocatoriaId, data}`. Estado inicial `preinscripta`. |
| GET | `/favorites` | device | Array de `photoId` favoritos. |
| PUT | `/favorites/:photoId` | device | Marcar favorito (idempotente). |
| DELETE | `/favorites/:photoId` | device | Desmarcar. |
| POST | `/downloads` | device | Registrar descarga. Body `{photoId, galleryId}` (deriva `sponsorId`). |
| GET | `/downloads` | device | Mis descargas. |

### Beneficios (código gated)
| Método | Path | Auth | Qué hace |
|---|---|---|---|
| GET | `/benefits` | device-opcional | Beneficios activos. **El `code` solo se incluye si el device tiene una inscripción confirmada.** |
| GET | `/admin/benefits` | admin | Todos (incl. inactivos), siempre con código. |
| POST | `/admin/benefits` | admin | Crear (`url` saneada con `cleanStoredUrl`). |
| PATCH | `/admin/benefits/:id` | admin | Update parcial. |
| DELETE | `/admin/benefits/:id` | admin | Borrar. |

### Banners (publicidad gestionada)
| Método | Path | Auth | Qué hace |
|---|---|---|---|
| GET | `/banners` | pública | Banners activos (rotación la decide el front por slot). |
| GET | `/admin/banners` | admin | Todos (orden `slot,order`). |
| POST | `/admin/banners` | admin | Crear. `destinationUrl` obligatorio y saneado (400 `INVALID_URL`). |
| PATCH | `/admin/banners/:id` | admin | Update parcial. |
| DELETE | `/admin/banners/:id` | admin | Borrar. |

### Notas (CMS editorial / prensa)
| Método | Path | Auth | Qué hace |
|---|---|---|---|
| GET | `/notas` | pública | Notas publicadas (orden `order, publishedAt desc`). |
| GET | `/notas/:slug` | pública | Una nota publicada (404 si borrador). |
| GET | `/admin/notas` | admin | Todas incl. borradores. |
| POST | `/admin/notas` | admin | Crear (valida fecha, 400 `INVALID_DATE`). |
| PATCH | `/admin/notas/:id` | admin | Update parcial. |
| DELETE | `/admin/notas/:id` | admin | Borrar. |

### Analytics
| Método | Path | Auth | Qué hace |
|---|---|---|---|
| POST | `/analytics` | device-opcional | Ingesta fire-and-forget. Body: evento o array (máx 500). `202 {ok,ingested}`. |
| GET | `/admin/analytics` | admin | Eventos para el dashboard. `?limit` (máx 2000, default 500). |

### Admin — CRUD del organizador (todo bajo `requireAdmin`)
| Método | Path | Qué hace |
|---|---|---|
| POST · PATCH · DELETE | `/admin/events` · `/admin/events/:id` | Crear/editar/borrar evento (409 `HAS_REGISTRATIONS` si tiene inscripciones; cascade a bloques). |
| POST · PATCH · DELETE | `/admin/blocks` · `/admin/blocks/:id` | Crear/editar/borrar bloque (409 `HAS_REGISTRATIONS`). |
| POST · PATCH · DELETE | `/admin/contents` · `/admin/contents/:id` | CRUD de videos. |
| POST · PATCH · DELETE | `/admin/sponsors` · `/admin/sponsors/:id` | CRUD de sponsors + creatives (409 `HAS_GALLERIES`). |
| POST · PATCH · DELETE | `/admin/galleries` · `/admin/galleries/:id` | CRUD de galerías + fotos. |
| POST · PATCH · DELETE | `/admin/catalog` · `/admin/catalog/:id` | CRUD de expositores + portfolio. |
| PATCH | `/admin/plans/:id` | Editar solo `price`/`mpLink` de un plan. |
| GET · PATCH | `/admin/applications` · `/admin/applications/:id` | Listar / decidir postulaciones (`{status:'aceptada'\|'rechazada'}`). |

---

## Notas de implementación

- **Anti-oversell:** la inscripción a bloque usa `SELECT … FOR UPDATE` en transacción; a nivel evento (`blockId: null`) lockea la fila de `Event` (dos `NULL` no colisionan en el índice único).
- **Saneo de URLs:** `benefit.url` y `banner.destinationUrl` pasan por `cleanStoredUrl` (permite `http(s)/mailto/tel` y rutas internas, antepone `https://` a dominios scheme-less, rechaza `javascript:`/`data:`/`vbscript:`/`file:`).
- **Pagos (Fase C/D/F):** el webhook de Mercado Pago (`POST /webhooks/mp`) y los flujos de orden son **canon pero aún no activos en prod** (bloqueado por decisión comercial). Ver [`work-agent/backend/07-pagos-mercadopago.md`](./work-agent/backend/07-pagos-mercadopago.md).
- **Acreditación (Fase H):** `POST /admin/checkin` (rol STAFF) está planificado, **no implementado**.
