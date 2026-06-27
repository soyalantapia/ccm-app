# SECURITY.md — Seguridad de CCM

Estado de los controles, modelo de amenazas y pendientes. Para el contrato de auth por endpoint ver [`API.md`](./API.md).

> **TL;DR:** la base está sólida (identidad HMAC server-only, gating de códigos server-side, saneo de URLs en doble capa, `assertProd`, rate-limit). Los dos pendientes reales: **auth admin = shared secret de un solo rol** (falta OTP + RBAC) y **cero tests automatizados**.

---

## 1. Controles implementados

| Control | Implementación | Estado |
|---|---|---|
| **Identidad device (HMAC-SHA256)** | `server/src/lib/deviceToken.ts`. Token `base64url(payload).base64url(hmac)`; firma con `DEVICE_TOKEN_SECRET`; validación **constant-time** (`timingSafeEqual` con chequeo de longitud previo). Emisión **server-only** en `POST /devices` (el `publicId` lo genera el server, el cliente no lo elige). Header `X-Device-Token`. | ✅ Cierra la suplantación previa (donde bastaba mandar un `X-Device-Id` ajeno). |
| **Gating de códigos de beneficio** | `benefitService.getBenefits(deviceId)` cuenta inscripciones `confirmada`; solo entonces `serialize.toBenefit(b, withCode=true)` incluye `code`. **El código nunca sale del backend** para un device no inscripto (no es ocultarlo en la UI). | ✅ |
| **Saneo de URLs (doble capa)** | Front `src/lib/href.ts` `safeExternalHref` (degrada a no-link) + server `server/src/lib/url.ts` `cleanStoredUrl` (rechaza `400 INVALID_URL`, no persiste). Bloquean `javascript:`/`data:`/`vbscript:`/`file:`; anteponen `https://` a dominios scheme-less. | ✅ Aplicado a `banner.destinationUrl` y `benefit.url`. |
| **`assertProd()`** | `server/src/lib/env.ts`. En `NODE_ENV=production` aborta el arranque (`process.exit(1)`) si falta `ADMIN_TOKEN`/`DEVICE_TOKEN_SECRET` o si `CORS_ORIGINS='*'`. | ✅ Evita bootear "sano" pero inseguro. |
| **Rate limiting** | `server/src/app.ts`, por IP, `trust proxy: 1`. `writeLimiter` (mutaciones, 120/min) + `analyticsLimiter` (600/min). GETs no limitados (NAT del venue). | ✅ |
| **helmet / CORS / body limit** | helmet (CSP/COEP off porque el mismo servicio sirve la SPA con imágenes/YouTube externos; quedan HSTS, nosniff, frameguard); CORS allowlist (`CORS_ORIGINS`, nunca `*` en prod); `express.json({ limit: '1mb' })`. | ✅ |
| **Validación de input** | `zod` en el borde; errores uniformes `{ error: { code, message } }`. | ✅ |
| **IDOR** | El `deviceId` sale **del token verificado**, nunca del body. `GET /applications` filtra `where: { deviceId }`. Listados de PII detrás de `requireAdmin`. | ✅ |
| **XSS** | Sin `dangerouslySetInnerHTML` en todo `src/`. El body de notas se renderiza como texto (`<p>` por línea). YouTube vía `youtube-nocookie.com` (facade). | ✅ |
| **Integridad de datos** | No hard-delete de entidades con valor real: eventos/bloques con inscripciones → `409 HAS_REGISTRATIONS`; sponsors con galerías → `409 HAS_GALLERIES`. Anti-oversell por `SELECT FOR UPDATE`. | ✅ |
| **Secretos** | Validados con zod; nunca en el repo. El Dockerfile no los hornea (los provee Railway). | ✅ |

---

## 2. Pendientes (riesgos conocidos)

| # | Riesgo | Impacto | Plan |
|---|---|---|---|
| **S1** | **Auth admin = shared secret de un solo rol.** `ADMIN_TOKEN` Bearer comparado con `!==` (no constant-time; es shared secret no derivado de input público → bajo). El enum `AdminRole` (OWNER/EDITOR/STAFF/VIEWER) existe pero hay **un solo rol efectivo**. | Si se filtra el token, acceso admin total. Sin separación prensa/marketing/puerta. | **Login OTP por email** (RESEND) + `adminJWT` corto con rol + `requireAdmin(...roles)`. Es el pendiente de seguridad #1. |
| **S2** | **Device-token sin expiración ni rotación.** El `iat` se firma pero no se valida; es un portador de larga vida. | Token robado = identidad usable indefinidamente (impacto acotado: no hay datos sensibles tras el device-token más allá del perfil propio). | Expiración + refresh, junto con el login OTP. |
| **S3** | 🔴 **Cero tests automatizados.** Andamiaje `vitest`+`supertest` montado, 0 archivos. | Regresiones silenciosas en lógica sensible (cupo, gating, pagos). | Suite mínima: webhook MP (firma+idempotencia), concurrencia de cupo, gating de beneficios, acreditación. |
| **S4** | **Pagos MP aún no endurecidos en prod** (Fase C inactiva). | Cuando se active: replay de webhook, doble-confirmación, montos manipulados. | Canon ya definido (`backend/07`): verificar firma `x-signature`, **consultar el pago a la API de MP** (no confiar en el body), idempotencia por `mpPaymentId @unique`, transiciones server-side. |
| **S5** | **Uploads de imágenes sin definir** (storage no elegido). | Si se permiten uploads sin validación: tipo/tamaño, path traversal, contenido malicioso. | Object storage S3-compatible con presigned PUT, validación de content-type/tamaño, la DB guarda solo la clave. |
| **S6** | **PII y Ley 25.326 (AAIP).** Se captura nombre/email/teléfono/DNI con consents (timestamp). | Cumplimiento legal argentino; derechos ARCO. | Endpoints `DELETE /me` y `GET /me/export`; minimización (no pedir DNI si la puerta no lo exige); **requiere asesoría legal** + texto de privacidad real. |
| **S7** | **`.github/workflows/` en `.gitignore`.** | El workflow de deploy podría no estar trackeado y romper el CI silenciosamente. | Confirmar que `deploy.yml` esté commiteado en el remoto. |

---

## 3. Modelo de amenazas (resumen)

- **Superficie pública (lecturas):** sin auth, solo datos pensados para ser públicos (eventos, catálogo, sponsors, planes, banners, notas publicadas). Sin fuga: los códigos de beneficio y los borradores no salen sin la auth correspondiente.
- **Asistente (device):** puede leer/escribir **solo lo suyo** (perfil, inscripciones, favoritos, postulaciones). El `deviceId` del token verificado evita IDOR.
- **Organizador (admin):** acceso total vía `ADMIN_TOKEN` → el activo más sensible es ese token (ver S1). Mitigado por `assertProd` (no arranca sin él) y `503` si falta.
- **Día del evento (~20k usuarios):** principal riesgo = disponibilidad. Rate limits venue-aware; subirlos el día del evento ([`RUNBOOK.md`](./RUNBOOK.md)). 1 instancia (canon) → si se escala a ≥2, mover el rate-limit a Redis.

---

## 4. Reportar una vulnerabilidad

Internamente: avisar a Alan Tapia / Xnod antes de explotar o publicar. Para datos de usuarios (PII), tratar como incidente: contener, evaluar alcance, documentar en `work-agent/ESTADO-ACTUAL.md`.
