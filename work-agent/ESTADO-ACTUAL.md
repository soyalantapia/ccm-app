# ESTADO ACTUAL — CCM (doc vivo)

> **Fuente de verdad del estado REAL del proyecto.** Los `backend/00–13` son el *plan* (escrito antes de implementar); este archivo dice qué está realmente hecho y en prod. Si hay contradicción, gana este + el código.
> **Actualizado:** 2026-06-27 · **Rama:** `feat/backend-foundation` · **Prod:** un solo servicio Railway (front + API).

---

## TL;DR

La plataforma está **en producción en Railway como un único servicio** que sirve el frontend (PWA) **y** la API (`/api/v1`) desde el mismo origen: **https://ccm-api-production-91a9.up.railway.app**. El backend (Express + Prisma + Postgres) cubre identidad, eventos/cupos, catálogo/galerías/contenido, publicidad self-serve, membresía, auth+CRUD admin, y las 4 features que pidió Gastón en los audios. Falta: checkout MP de entradas (bloqueado por Gastón), acreditación QR (Fase H), login OTP + roles, uploads de imágenes reales, y una suite de tests.

---

## Accesos y comandos

| Qué | Valor |
|---|---|
| App + API (prod) | https://ccm-api-production-91a9.up.railway.app |
| Admin | `…/admin` → clave = `ADMIN_TOKEN` (Railway, servicio `ccm-api`) |
| Health | `…/api/v1/health` |
| Deploy (front + API) | `railway up . --path-as-root -s ccm-api -c` |
| Migrar prod | automático en cada deploy (`prisma migrate deploy` en el CMD del contenedor) |
| Sembrar | `cd server && npm run db:seed` |
| DB | plugin Postgres de Railway; inspección con `DATABASE_URL` en `server/.env` + `npx prisma studio` |

---

## Estado por fase

| Fase | Qué | Estado |
|---|---|---|
| 0 | Esqueleto Express+Prisma+Postgres + deploy Railway | ✅ en prod |
| A | Identidad + perfil + analytics | ✅ en prod |
| B | Eventos + bloques + inscripciones + **cupo atómico** | ✅ en prod (verificado: 36 paralelas → 28 entran / 8 → 409) |
| C | Entradas + pago Mercado Pago | ⏳ motor construido; **activación bloqueada por Gastón** (cuenta MP + precios, o Tikealo) |
| D | Membresía Socio + gate `socioOnly` | ✅ en prod |
| E | Catálogo + galerías + contenido | ✅ en prod (falta decidir storage de imágenes) |
| F | Publicidad self-serve + sponsors (pago QR) | ✅ en prod |
| G | Auth admin (Bearer temporal) + CRUD organizador | ✅ en prod (falta login OTP + roles) |
| H | Acreditación QR en puerta | ⏳ no shipped — trabajo del día del evento |

### Las 4 features de los audios de Gastón (todas en prod)
- **Beneficios** (`3ae803a`) — código gated a inscriptos. `/beneficios` + `/admin/beneficios`.
- **Banners gestionados** (`e21677c`) — destino + medición de clics + fijos/rotan. `/admin/banners`.
- **Participantes** (`550f0ca`) — precio por obra + contacto WhatsApp. `/p/:slug` + `/admin/catalogo`.
- **Notas / CMS** (`e780e5b`) — con video YouTube. `/novedades` + `/admin/novedades`.
- Fixes de review (`5bedb12`): href seguro, slug único de notas, re-hidratar admin.

---

## Pendientes

### Bloqueados por insumos externos
- **Checkout MP de entradas** → necesita cuenta de cobro + precios reales de Gastón (o quedarse en Tikealo).
- **Uploads de imágenes reales** → decidir R2 vs DigitalOcean Spaces (Alan) + acceso al Drive/IDs de YouTube (Gastón).
- **Login OTP prensa/marketing** → `RESEND_API_KEY` + emails de los admins (Gastón) + mapeo a roles.

### Trabajo técnico (no bloqueado)
- 🔴 **Suite de tests** (deuda #1): vitest+supertest listo en `server/`, 0 archivos escritos. Prioridad: webhook MP, concurrencia de cupo, gating de beneficios, acreditación.
- **Acreditación QR (Fase H):** JWT firmado + un-uso por jornada + modo offline.
- **RBAC admin:** reemplazar el `ADMIN_TOKEN` Bearer por OTP + roles `AdminRole`.
- **Ronda de testeo de flujos** end-to-end antes del lanzamiento (registro, beneficios, contenido, compra).
- **Texto legal real** (privacidad/términos, Ley 25.326) — requiere asesoría.

### Operativo
- Verificar que `feat/backend-foundation` esté pusheada + PR al día (histórico: hubo commits locales sin pushear).
- `.github/workflows/` está en `.gitignore` → confirmar que `deploy.yml` esté trackeado en el remoto.
- Limpieza de Postgres duplicadas en Railway (si quedaron de pruebas).

---

## Notas de arquitectura (lo esencial para retomar)

- **El seam `DataStore`** es la única puerta de datos del front. `LocalDataStore` (demo) vs `RemoteDataStore` (backend), conmutados por `VITE_API_URL`. Ver `PROJECT.MD §5`.
- **Migración async (TanStack Query):** parcial. `src/data/queries.ts` envuelve el store síncrono con `initialData` (sin estados de carga aún). Cuando la interfaz pase a `Promise`, se quitan los `initialData`.
- **Un solo servicio:** el Express sirve `dist/` + fallback SPA + `/api/v1` (vía `FRONT_DIST`). GH Pages quedó redundante.
- **Tipos compartidos:** el server importa `src/data/types.ts` vía alias `@domain/types`; `serialize.ts` mapea Prisma → dominio.
- **Decisiones canónicas (LEY):** `backend/00-README.md` (prefijo `/api/v1`, `Device` raíz, `Payment` polimórfica, 3 secretos JWT, no hard-delete, 1 instancia…).

---

> Mantené este archivo al día tras cada cambio grande (nueva fase, feature en prod, decisión de Gastón/Alan resuelta). Es lo primero que lee quien retoma el proyecto.
