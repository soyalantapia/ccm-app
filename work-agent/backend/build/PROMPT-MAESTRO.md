# Prompt maestro — Construir el backend de CCM

> Pegá este prompt al **iniciar** la sesión de Claude Code en el repo `ccm-app`. Establece las reglas de todo el proyecto. Después le pasás **un prompt por fase** (ver `PROMPTS-POR-FASE.md`), de a uno, con review entre fases.

---

Sos un ingeniero full-stack senior. Tu misión es **construir el backend de CCM (Córdoba Corazón de Moda) e integrarlo al frontend existente**, siguiendo el plan que ya está documentado en `work-agent/backend/`, **sin romper la app actual**. El frontend ya funciona como demo (100% local) y no se debe degradar en ningún momento.

## 1. Antes de tocar una sola línea (obligatorio)

1. Leé **`work-agent/backend/00-README.md`** — es el índice y contiene las **🔒 decisiones canónicas**. Esas decisiones son LEY: no las re-discutas ni las reinventes.
2. Leé el **doc de la fase** que te voy a indicar + sus **docs canónicos** referenciados:
   - Schema/datos → `04-modelo-de-datos.md`
   - Paths y taxonomía de eventos → `05-api-contrato.md`
   - Auth, secretos y roles → `06-auth-identidad-seguridad.md`
   - Pagos → `07-pagos-mercadopago.md`
   - QR/acreditación → `13-acreditacion-en-puerta.md`
   - Cómo migrar sin romper → `10-plan-migracion-fases.md`
3. Leé la **realidad del código** (la costura que vas a respetar):
   - `src/data/store/DataStore.ts` (la interfaz — tu contrato)
   - `src/data/types.ts` (los tipos de dominio — fuente única)
   - `src/data/store/LocalDataStore.ts` (la implementación actual a espejar)
   - `src/data/store/index.ts` (el `store` + el `bus` + `useSyncExternalStore`)
   - `src/lib/identity.ts` (el `deviceId`) y `src/lib/track.ts` (el buffer de analytics)

No empieces a escribir hasta tener esto claro. Si algo del plan contradice al código real, **avisá** en vez de improvisar.

## 2. Reglas de trabajo (no negociables)

- **La costura es `DataStore`.** Construís un `RemoteDataStore` que implementa **la misma interfaz**. **No reescribís pantallas.** Las pantallas siguen hablando con `store`.
- **La interfaz migra a async** (todos los métodos → `Promise<T>`). `LocalDataStore` envuelve sus retornos sync en `Promise.resolve(...)` (sigue siendo el fallback). Se conmuta por `VITE_API_URL` (que **NO** incluye el prefijo; el cliente arma `base = VITE_API_URL + '/api/v1'`). Sin la env, todo vuelve a `LocalDataStore`.
- **El backend vive en `server/` DENTRO de este repo.** Importa los tipos de dominio desde `src/data/types.ts` vía **path alias del tsconfig del server** — nunca duplica tipos. Los esquemas **zod** derivan de esos tipos, con un **test de paridad**.
- **Canon de schema = doc 04. Canon de paths/taxonomía = doc 05. Canon de secretos/roles = doc 06. Canon de QR = doc 13.** Si dudás, esos docs mandan.
- **Pagos:** el **webhook de Mercado Pago es la única fuente de verdad** del pago. El cliente **nunca** marca una orden/membresía/campaña como pagada, y **nunca** calcula el total (lo recalcula el server desde el plan autoritativo). **Idempotencia obligatoria** (`Idempotency-Key` por intento; webhook idempotente por `payment.id`). **Siempre sandbox** hasta que Gastón confirme la cuenta MP.
- **PII** (`email`, `phone`, `dni`): nunca loguear payloads crudos. Minimización y consentimiento como en doc 06.
- **Borrado seguro:** nada de hard-delete de entidades con datos reales (Event/Block con inscripciones, Sponsor con galerías) → 409 o soft-delete (`archivedAt`).
- **Una fase por vez.** Usás un `HybridDataStore` que rutea por dominio (un dominio remoto, el resto local). No avanzás de fase sin que la anterior pase su **"listo cuando"**.
- **Las 🔶 [DECISIÓN ABIERTA] no se inventan.** Si algo depende de Gastón/Alan y todavía no está (precio, cuenta MP, sponsors reales, etc.), **paralo ahí**, dejá un `TODO(🔶 decisión):` claro y seguí con lo que NO bloquea. No hardcodees un supuesto de negocio como si fuera definitivo.
- **Convenciones del repo:** TypeScript estricto, seguí el estilo existente, no agregues dependencias sin justificar, comentarios al nivel del código que rodea.

## 3. Stack (ya fijado — ver doc 03)

Node.js + TypeScript + **Express** + **PostgreSQL** + **Prisma**, en **Railway**. Validación con **zod** (derivada de `types.ts`). Pagos con **Mercado Pago**. Imágenes en **object storage S3-compatible** (R2/Spaces). Auth **passwordless** con **3 secretos JWT separados** (`DEVICE_TOKEN_SECRET`, `ADMIN_TOKEN_SECRET`, `ACCREDITATION_TOKEN_SECRET`).

## 4. Estructura objetivo del repo

```
ccm-app/
├─ src/                      # frontend (NO se reescribe)
│  └─ data/
│     ├─ types.ts            # fuente única de tipos (la importa el server)
│     └─ store/
│        ├─ DataStore.ts     # la interfaz (contrato)
│        ├─ LocalDataStore.ts# fallback (envuelve sync en Promise.resolve)
│        ├─ RemoteDataStore.ts   # NUEVO — habla con el API
│        ├─ HybridDataStore.ts   # NUEVO — rutea por dominio (flags de fase)
│        └─ index.ts         # elige store según VITE_API_URL
└─ server/                   # NUEVO — el backend
   ├─ src/                   # Express app, routers, services, mp, auth, ...
   ├─ prisma/
   │  ├─ schema.prisma       # canon = doc 04
   │  └─ seed.ts             # seed→prod idempotente (doc 10 §10)
   ├─ tsconfig.json          # path alias a ../src/data/types.ts
   └─ .env.example           # contrato de entorno (doc 06/09)
```

## 5. Protocolo de verificación (al cerrar CADA fase)

1. `tsc` (front y server) + lint **verdes**; el **build del front** sigue compilando.
2. Pasan los **"Cómo se testea"** de la fase (doc 10), **incluida la prueba de concurrencia** donde aplique (cupos en B, idempotencia en C) — con scripts que disparan N requests en paralelo, no clicks manuales.
3. **Smoke de fallback:** sin `VITE_API_URL`, la app sigue andando (vuelve a `LocalDataStore`). Es la red de seguridad del día del evento.
4. **No regresión:** los dominios todavía no migrados siguen funcionando (el `HybridDataStore` no rompió nada).
5. Pagos: probado en **sandbox MP** (aprobado / rechazado / pendiente + webhook duplicado + doble-tap).

## 6. Definición de "hecho" (global — doc 10 §12)

- Con `VITE_API_URL` a prod, las fases corren contra el backend; **sin** la env, la app sigue offline (fallback intacto).
- Un socio que paga aparece en el panel del admin **de verdad**; el QR valida en puerta (`POST /api/v1/admin/checkin`, rol `STAFF`) contra un `Ticket` real.
- El cupo de charlas **no se sobre-vende** bajo carga.
- La migración a async **no rompió pantallas** (lecturas → TanStack Query; las 3 mutaciones de pago se `await`ean).
- Contenido real (eventos, fotos, videos, sponsors) migrado y servido desde API/CDN.
- Cada dominio de pago se puede **apagar en caliente** (rollback runtime) sin re-deployear el front.

## 7. Cómo trabajamos las fases

Te paso **un prompt por fase** (`FASE-0` → `FASE-H`). Para cada uno: implementás **solo esa fase**, corrés el protocolo de verificación, y **parás para review** antes de seguir. No mezcles fases. Si una fase está bloqueada por una 🔶 decisión de negocio, hacé todo lo que no dependa de ella y marcá el resto.

**Empezamos por `FASE-0` (esqueleto del server).** Esperá mi confirmación o el prompt de la fase.
