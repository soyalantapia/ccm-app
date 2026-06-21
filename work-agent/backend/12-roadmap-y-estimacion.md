# Roadmap y estimación

Cómo se ordenan en el calendario las fases del backend de CCM (doc 10 — *Fases del plan*) contra una fecha que no se mueve: el evento es el **19–20/09/2026** en el Hotel Quinto Centenario. Este doc trabaja **hacia atrás** desde una fecha de "listo para producción" con colchón, secuencia las fases con sus dependencias, estima esfuerzo asumiendo **1 dev fuerte (Alan)**, marca el **camino crítico** y los **quick wins**, y cierra con los **primeros 3 pasos para arrancar mañana**.

> Premisa de planificación: hoy es **2026-06-20**. Faltan **~13 semanas** hasta el evento. Alan es full-stack y ya corre exactamente este stack en producción (Norte: Prisma+Postgres+Railway; romi-alan / My Alquiler: Node/Express+JWT+Postgres), así que la estimación asume curva de aprendizaje cero sobre el stack y se concentra en el trabajo propio de CCM. No asume dedicación full-time: Alan tiene otros proyectos en paralelo, así que el calendario deja aire.

---

## 1. La restricción que invierte todo: la fecha

No buscamos el backend ideal, buscamos **el backend que opera el evento sin fallar** (objetivos doc 02). Eso fija dos cosas:

1. **Se planifica desde la fecha hacia atrás**, no desde hoy hacia adelante.
2. **El alcance es la variable de ajuste, no la fecha.** Si llegamos justos, se recorta del *MÁS ADELANTE* (doc 02 §3), nunca se mueve el 19/09.

### Fechas ancla (hacia atrás)

| Fecha | Hito | Por qué ahí |
|---|---|---|
| **19–20/09/2026** | EVENTO. Día cero. | No se mueve. |
| **~15/09/2026** | **Code freeze** (lun. previo) | Llegar con código estabilizado, no recién mergeado. 4–5 días de quietud antes del evento. |
| **~08/09/2026** | **Listo para producción + ensayo de carga/acreditación** | Una semana de colchón entre "todo verde" y el freeze para que el simulacro descubra problemas y haya tiempo de arreglarlos. |
| **~25/08/2026** | **Pagos + acreditación reales en producción, probados en sandbox** | Lo más riesgoso del proyecto cerrado con ~3 semanas de aire antes del listo-para-prod. |
| 🔶 **[DECISIÓN ABIERTA]** | **Cierre de convocatorias** (`Convocatoria.deadline`) | Cae **antes** del evento, posiblemente mucho antes. Si la deadline de postulaciones es, p. ej., a fines de julio, el flujo de postulaciones tiene que estar **real antes** que el de puerta y reordena el roadmap. Confirmar la fecha real con Gastón es lo primero. |

🔶 **[DECISIÓN ABIERTA]** Presupuesto/timeline real (doc 02 §6): cuántas horas/semana puede poner Alan hasta septiembre, y si hay un segundo par de manos. Toda la estimación de abajo asume **1 dev a media máquina** (~3 días efectivos de dev por semana). Si hay full-time, el calendario se comprime ~40%; si hay menos, se recorta alcance.

---

## 2. Fases (de doc 10) y estimación de esfuerzo

Las fases vienen del doc 10 (*Fases del plan*); acá se les pone número de orden, esfuerzo y dependencias. **Esfuerzo = días de dev efectivos** (no días de calendario). La conversión a calendario asume ~3 días efectivos/semana (ver §1).

| # | Fase | Habilita (objetivo doc 02) | Esfuerzo (días dev) | Depende de |
|---|---|---|---|---|
| **F0** | **Bootstrap infra** — repo backend, Express+TS+Zod, Prisma, Postgres en Railway, CORS, deploy `migrate deploy` | base de todo | **2–3 d** | cuenta Railway (existe) |
| **F1** | **Costura `RemoteDataStore`** — esqueleto del cliente HTTP contra la interfaz `DataStore`, conmutación por `VITE_API_URL` con fallback, contrato de error uniforme | migración sin regresión (criterio #7) | **2–3 d** | F0 |
| **F2** | **Identidad + perfil** — `Device` (token firmado), `DeviceProfile.fields`+`consents`, endpoints `/me`, captura progresiva server-side | O5, O6 | **3–4 d** | F0, F1 |
| **F3** | **Catálogo público read-path** — `GET` de events, blocks, plans, sponsors, catalog, galleries, contents, convocatorias (sirve el seed migrado a DB) | O1 (lecturas) | **3–4 d** | F0, F1 |
| **F4** | **Inscripciones + cupo atómico** — `register`/`cancel`/`blockAvailability` con transacción y `UNIQUE`/`CHECK` para no sobrevender | O1 (criterio #2) | **3–4 d** | F2, F3 |
| **F5** | **Auth de organizador** — OTP a allow-list, JWT con rol `admin`, gate server-side de `/admin/*`, mata `ccm2026` | O4 (criterio #6) | **3–4 d** | F0, proveedor email (🔶) |
| **F6** | **CRUD admin** — crear/editar/borrar events, blocks, sponsors, galleries, contents, plans; decidir postulaciones | O4 | **4–5 d** | F5, F3 |
| **F7** | **Postulaciones** — `submitApplication`/`getApplications`/`decideApplication` persistente | (convocatorias) | **2–3 d** | F2, F6 (decide) |
| **F8** | **Object storage + uploads** — bucket R2/Spaces, URLs pre-firmadas, subida de fotos/portfolios/logos desde admin | O1 (galerías), O4 | **3–4 d** | F5, cuenta storage (🔶) |
| **F9** | **Pagos reales (3 flujos)** — Preference MP, webhook idempotente firmado, transición de estados server-side para entradas/membresía/publicidad | O3 (criterio #3) | **6–8 d** | F2, F4 (entradas), cuenta MP (🔶), **decisión Tikealo (🔶)** |
| **F10** | **Acreditación por QR** — emisión firmada por servidor tras confirmación, endpoint de validación de puerta (un-uso, idempotente), PWA en modo puerta | O2 (criterio #4) | **4–5 d** | F9 (QR sale tras pago), **modelo de QR (🔶)** |
| **F11** | **Panel en vivo + analytics** — `track`/`getAnalytics`, dashboard con polling TanStack Query, export CSV de leads | O4, O5 (criterio #5) | **4–5 d** | F2, F4, F6, F9 |
| **F12** | **Endurecimiento + operación** — rate-limit, verificación de firma, backup de DB, cron (expirar campañas, cerrar órdenes viejas), prueba de carga, simulacro de acreditación | O7 (criterios #1, #8, #9) | **4–5 d** | todo lo de prod (F9, F10, F11) |

**Total esfuerzo: ~43–57 días de dev.** A ~3 días efectivos/semana ≈ **14–19 semanas de calendario** si fuera estrictamente secuencial. **No alcanzan las 13 semanas en secuencia pura** — por eso el plan paraleliza lo independiente y recorta el *MÁS ADELANTE* (ver §4 y §6).

> Las fases F1→F12 son, casi una a una, los grupos de endpoints del doc 05 y las entidades del doc 04. No hay trabajo "de fundación" inventado acá: cada fase entrega un pedazo del contrato `DataStore` ya escrito.

---

## 3. Dependencias y camino crítico

### Grafo de dependencias (técnicas)

```
F0 bootstrap
 ├─► F1 RemoteDataStore ──► F2 identidad ─┬─► F4 inscripciones ─┐
 │                          F3 catálogo ──┘                     │
 │                                                              ▼
 ├─► F5 auth admin ──► F6 CRUD admin ──► F7 postulaciones       F9 pagos ──► F10 acreditación
 │                 └─► F8 uploads                                 │              │
 │                                                                ▼              ▼
 └───────────────────────────────────────────────► F11 panel ◄───┴──────────────┘
                                                       │
                                                       ▼
                                                  F12 endurecimiento ──► EVENTO
```

### Camino crítico (lo que define la duración mínima)

```
F0 → F1 → F2 → F4 → F9 → F10 → F12 → EVENTO
2-3   2-3   3-4   3-4   6-8   4-5    4-5   = ~24–32 días de dev en serie
```

**El cuello de botella es F9 (pagos) → F10 (acreditación) → F12 (endurecimiento).** Es la cadena más larga *y* la más riesgosa *y* la más bloqueada por decisiones externas:

- **F9 no arranca de verdad sin la cuenta MP de Gastón** y, sobre todo, **sin la decisión Tikealo vs checkout propio** (doc 02 O3, "mayor impacto en alcance"). Si las entradas siguen en Tikealo, F9 se reduce a *registrar venta externa + acreditar* (–3/4 días); si es checkout propio MP, es el flujo completo.
- **F10 no arranca sin el modelo de QR** (por jornada vs por entrada; por persona vs por orden — doc 02 O2). Ese dato cambia el esquema de acreditación, no solo el código.
- **F12 (prueba de carga + simulacro)** no se puede comprimir: es lo que valida los criterios #2/#4/#8 en condiciones reales, y necesita que F9/F10/F11 estén terminadas para tener algo real que estresar.

**Implicación dura:** las 🔶 de MP/Tikealo, modelo de QR y proveedor de email **bloquean el camino crítico**. Resolverlas es trabajo de Gastón/Alan, no de código, y es lo que hay que destrabar **primero** (ver §7). Mientras no estén, F9/F10 se diseñan para soportar las dos ramas razonables (doc 02 §7) pero no se implementan ambas.

### Fuera del camino crítico (se paralelizan / arrancan antes)

- **F3 (catálogo público), F5 (auth admin), F6 (CRUD), F7 (postulaciones), F8 (uploads)** no dependen de pagos. Se pueden adelantar mientras las decisiones de MP/QR se destraban. **F7 sube de prioridad si la deadline de convocatorias es temprana** (🔶) — en ese caso F5→F6→F7 se hacen *antes* de tocar pagos.
- **F11 (panel)** depende de varias, pero su versión mínima (lecturas + analytics) puede crecer incrementalmente a medida que cada fase emite eventos al bus.

---

## 4. Cronograma (hacia atrás desde el evento)

Calendario realista a ~3 días efectivos/semana, con lo independiente paralelizado. Semanas etiquetadas por lunes.

| Semana | Fechas (2026) | Foco | Fases | Hito / gate |
|---|---|---|---|---|
| **S1** | 23/06 – 29/06 | Fundación + costura | F0, F1 | Backend deployado en Railway respondiendo `GET /health`; `RemoteDataStore` enchufado con `VITE_API_URL` (aunque devuelva mocks) |
| **S2** | 30/06 – 06/07 | Identidad + catálogo | F2, F3 (en paralelo) | Perfil persiste server-side; catálogo público sale de la DB; **quick win demostrable a Gastón** |
| **S3** | 07/07 – 13/07 | Inscripciones + auth admin | F4, F5 | Cupo atómico verificado (criterio #2); `ccm2026` muerto, login admin real (criterio #6) |
| **S4** | 14/07 – 20/07 | CRUD admin + postulaciones | F6, F7 | Admin opera datos reales; postulaciones persistentes **(adelantar a S2/S3 si la deadline de convocatorias es de julio 🔶)** |
| **S5** | 21/07 – 27/07 | Uploads + colchón decisiones | F8, (destrabar MP/QR) | Subida de fotos real; **gate: MP/Tikealo y modelo de QR DEBEN estar decididos al cerrar S5** |
| **S6–S7** | 28/07 – 10/08 | **Pagos (camino crítico)** | F9 | 3 flujos en sandbox MP; webhook idempotente; estados server-side (criterio #3) |
| **S8** | 11/08 – 17/08 | Acreditación QR | F10 | QR firmado emitido tras pago; validación de puerta un-uso (criterio #4) |
| **S9** | 18/08 – 24/08 | Panel en vivo + analytics | F11 | Dashboard multi-dispositivo < 10 s (criterio #1, #5); export CSV de leads |
| **S10** | 25/08 – 31/08 | **Pagos+acreditación en PROD probados** (ancla §1) | cierre F9/F10 en prod | Credenciales MP productivas cargadas; QR end-to-end en prod |
| **S11** | 01/09 – 07/09 | Endurecimiento | F12 | Rate-limit, firma webhook, backup DB, cron; PII protegida (criterio #9) |
| **S12** | 08/09 – 14/09 | **Listo para prod + ensayo** (ancla §1) | prueba de carga + simulacro | Carga al pico estimado sin caídas; simulacro de acreditación con corte de red (criterio #8) |
| **S13** | 15/09 – 18/09 | **Code freeze** | solo bugfix | Código congelado; runbook del día del evento; fallback a `LocalDataStore` verificado |
| — | **19–20/09** | **EVENTO** | operación | — |

**Lectura del calendario:** hay **~3 semanas de colchón real** (S10 prod + S11 endurecimiento + S12 ensayo) entre el grueso del desarrollo y el freeze. Ese colchón es **innegociable** — es donde aparecen los problemas que no se ven en dev (webhook que llega tarde, QR que no escanea con poca luz, Railway que duerme el dyno). Si una fase se atrasa, **come del alcance, no del colchón**.

🔶 **[DECISIÓN ABIERTA]** Volumen objetivo (doc 02 criterio #8): cuántos asistentes/órdenes esperar para CCM 2026. Dimensiona la prueba de carga de S12 y el tier de Railway. El seed simula ~1.189 registrados / 703 inscripciones / 41 órdenes — confirmar el orden de magnitud real.

---

## 5. Quick wins (alto valor, bajo esfuerzo, temprano)

Cosas que se entregan rápido y desbloquean confianza/feedback o reducen riesgo desproporcionadamente:

1. **`GET /health` + `RemoteDataStore` enchufado (S1).** Apenas el backend responde y el front conmuta por `VITE_API_URL`, la costura está **probada de punta a punta** aunque el backend devuelva datos de juguete. Es el de-risking más barato del proyecto: confirma que la arquitectura de migración funciona antes de invertir en features.
2. **Catálogo público desde DB (S2).** Migrar el seed a Postgres y servir `GET /events`, `/plans`, etc. da una demo **real y multi-dispositivo** para mostrarle a Gastón en la primera quincena — sin tocar pagos ni auth. Genera el "ahí está pasando de verdad" temprano.
3. **Matar `ccm2026` (S3).** Cerrar el agujero de seguridad más obvio (admin abierto a cualquiera) es ~1 día sobre F5 y elimina un riesgo reputacional de cara a un cliente.
4. **Export CSV de leads (parte de F11).** El activo comercial del proyecto (alianza Xnod×CCM: data de ticketing/leads). Un endpoint de export sobre `DeviceProfile` reales es esfuerzo bajo y valor comercial directo para la conversación con Gastón.
5. **Fallback intacto como plan B de evento.** No es trabajo extra: con `VITE_API_URL` vacía el front vuelve a `LocalDataStore`. Mantenerlo verde en cada fase **es** el plan de contingencia del día del evento si el API cae. Verificarlo en S13 cuesta minutos.

---

## 6. Si llegamos justos: orden de recorte

Si el calendario aprieta (decisiones tardías, menos horas de las previstas), se recorta **del *MÁS ADELANTE* del doc 02 §3 primero**, y en este orden dentro de v1:

1. **F8 uploads → recortable.** El seed editorial en `public/img/` ya se sirve estático. Si no hay tiempo, las galerías nuevas del evento se cargan post-evento; el admin no sube fotos en v1. (Ahorra 3–4 d, fuera del camino crítico.)
2. **F9 publicidad self-serve → recortable a "manual".** De los 3 flujos de pago, el de `AdCampaign` es el menos crítico para operar el evento. Se puede dejar que el admin active campañas a mano (sin cobro automático) en v1 y diferir el cobro MP de publicidad. (Ahorra ~2 d del flujo más opcional.)
3. **F9 membresía → segundo recorte.** Si Tikealo absorbe entradas, la membresía Socio podría también venderse por canal externo y el backend solo registra/activa. (Depende de la 🔶 de Tikealo.)
4. **Lo que NO se recorta:** F4 cupo atómico, F9 entradas, F10 acreditación, F12 endurecimiento. Son el núcleo de "operar el evento sin fallar". Si esto no entra, **se conversa mover alcance con Gastón**, no se va a producción a medias en pagos/puerta.

**Regla:** primero se recorta scope opcional, después se pide más manos, y solo en último caso se toca el colchón de S10–S12. El colchón es lo que separa "funcionó" de "explotó en la puerta el 19/09".

---

## 7. Primeros 3 pasos para arrancar mañana

Concretos, ejecutables el **23/06**, ordenados para destrabar el camino crítico y entregar el primer quick win en la misma semana:

### Paso 1 — Mandarle a Gastón las 5 decisiones que bloquean el camino crítico (HOY, no es código)

Las 🔶 de MP/Tikealo, modelo de QR, proveedor de email, allow-list de admins y deadline de convocatorias **bloquean F7/F9/F10** (doc 02 §7). El código de fundación (F0–F6) no las necesita, así que se arranca a codear en paralelo, pero **estas respuestas tienen lead time** (abrir cuenta MP productiva, conseguir credenciales) y son de Gastón, no de Alan. Mandar el mail/mensaje el día uno:

1. ¿Las entradas se venden por **checkout propio (MP)** o siguen en **Tikealo**? *(mayor impacto en alcance)*
2. **Cuenta de cobro de Mercado Pago** a nombre de quién + credenciales de producción.
3. **Modelo de acreditación del QR**: ¿por jornada o por entrada VIP? ¿un QR por persona o por orden?
4. **Deadline real de las convocatorias** (¿cae en julio? eso adelanta F7).
5. **Emails de los organizadores** (allow-list de admin) + ok para usar Resend/Postmark/SES para OTP.

### Paso 2 — Bootstrap del backend en Railway (F0)

Crear el repo del backend y dejarlo respondiendo en Railway hoy mismo:

```bash
# nuevo repo backend (Node + TS + Express + Prisma) — patrón Norte
mkdir ccm-api && cd ccm-api && npm init -y
npm i express zod @prisma/client
npm i -D typescript tsx prisma @types/express @types/node
npx tsc --init
npx prisma init --datasource-provider postgresql   # crea schema.prisma + .env

# en Railway: nuevo proyecto → add PostgreSQL → add service desde el repo
# build command: prisma migrate deploy && npm run build  (patrón Norte/myalquiler)
# DATABASE_URL la inyecta Railway
```

Mínimo viable de F0 = un `GET /api/v1/health` que responda `200` con CORS habilitado para `https://soyalantapia.github.io`, deployado y accesible por URL pública. Eso prueba el pipeline entero (build → migrate → deploy → CORS) antes de escribir una sola feature.

### Paso 3 — Enchufar `RemoteDataStore` vacío y verificar la conmutación (F1, el quick win #1)

En el repo del front (`/Users/alannaimtapia/dev/ccm-app`), crear el esqueleto que el doc 03 ya tiene escrito:

```ts
// src/data/store/index.ts
import { LocalDataStore } from './LocalDataStore'
import { RemoteDataStore } from './RemoteDataStore'   // nuevo, aún esqueleto

const API = import.meta.env.VITE_API_URL
export const store: DataStore = API
  ? new RemoteDataStore(API)
  : new LocalDataStore()   // sin env → demo/offline intacto
```

Con `VITE_API_URL` apuntando al Railway de Paso 2 y un solo método implementado (p. ej. `getEvents()` → `GET /events` con un dato hardcodeado en el backend), **verificar que la app levanta contra el backend y que con la env vacía vuelve a `LocalDataStore` sin romper nada** (criterio #7). Ese ida-y-vuelta confirma que la migración de las ~12 áreas restantes es mecánica, no arquitectónica — y es la prueba más barata de que el plan entero es viable.

---

## 8. Resumen ejecutivo

- **~13 semanas** hasta el evento; el trabajo es **~43–57 días de dev**, que **no entra en secuencia pura** → se paraleliza lo independiente (F3/F5/F6/F7/F8) y se reserva alcance recortable (doc 02 *MÁS ADELANTE*).
- **Camino crítico:** `F0 → F1 → F2 → F4 → F9 (pagos) → F10 (acreditación) → F12 (endurecimiento)`. Está bloqueado por **decisiones de negocio** (MP/Tikealo, modelo de QR), no por dificultad técnica.
- **Colchón innegociable de ~3 semanas** (S10–S12) entre desarrollo y freeze: prod + endurecimiento + ensayo de carga/acreditación. Si algo se atrasa, **come del alcance, no del colchón**.
- **Arrancar mañana:** (1) mandarle a Gastón las 5 decisiones bloqueantes, (2) bootstrap del backend en Railway con `/health`, (3) enchufar `RemoteDataStore` vacío y verificar la conmutación por `VITE_API_URL`.

🔶 **[DECISIÓN ABIERTA]** transversal a todo el doc: **horas/semana reales de Alan y si hay un segundo dev** (doc 02 §6). Define si el calendario de §4 es holgado, justo o inviable, y por ende cuánto alcance opcional sobrevive.
