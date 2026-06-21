# Riesgos y decisiones abiertas

El mapa de lo que puede salir mal en el backend de CCM (Córdoba Corazón de Moda) de cara al evento 19–20/09/2026, y el registro consolidado de todo lo que falta definir — negocio (Gastón/Alan) y técnico — antes de poder cerrar el alcance v1. Este doc es la fuente única para "qué nos puede frenar" y "qué estamos esperando que alguien decida"; los detalles de cada tema viven en los docs 02–06.

---

## 0. Cómo leer este documento

- **Riesgos** (§1): cosas que pueden materializarse aunque nadie decida nada. Cada uno con impacto, probabilidad, disparador y mitigación concreta. Ordenados por exposición (impacto × probabilidad).
- **Decisiones abiertas 🔶** (§2 negocio, §3 técnicas): bifurcaciones que **alguien tiene que resolver**. Mientras no se resuelven, el backend se diseña para soportar las dos ramas razonables, pero no se implementan ambas. Cada una: opciones, recomendación, **quién decide** y para cuándo se necesita.
- **§4** cruza ambas cosas: qué decisiones, si se demoran, se vuelven riesgo de timeline.

Convención de impacto/probabilidad: **Alto / Medio / Bajo**. "Exposición" = combinación cualitativa de ambos, no un número.

La restricción que tiñe todo: **el evento no se mueve** (19–20/09/2026, Hotel Quinto Centenario). No buscamos el backend ideal; buscamos el backend que opera el evento sin fallar. Eso convierte la mayoría de los riesgos de "técnicos" en "de calendario".

---

## 1. Riesgos

### 1.1 Tabla maestra

| # | Riesgo | Impacto | Prob. | Exposición | Mitigación (resumen) |
|---|---|---|---|---|---|
| R1 | **Timeline vs fecha dura del evento** — no llegar con pagos+acreditación probados al 19/09 | Alto | Media | 🔴 Alta | Recortar a alcance v1 estricto (doc 02 §3); code freeze con holgura; priorizar acreditación y convocatorias (deadline previo) sobre lo demás |
| R2 | **Dependencia de las definiciones de Gastón** — precios, cuenta MP, canal de venta, política de sponsors sin resolver | Alto | Media-Alta | 🔴 Alta | Listar decisiones bloqueantes (§4) y empujarlas YA; diseñar para soportar ambas ramas sin implementar las dos |
| R3 | **Canal de venta: Tikealo vs checkout propio** — define si el backend hace checkout o solo acredita | Alto | Media | 🔴 Alta | Abstraer "confirmación de pago" detrás de una interfaz; no codear checkout propio hasta que Gastón decida (D-N1) |
| R4 | **Integración Mercado Pago** — webhooks no idempotentes, firma mal verificada, confirmar por redirect del cliente | Alto | Media | 🟠 Media-Alta | Webhook server-to-server como única fuente de verdad; `mpPaymentId @unique`; verificar firma; probar en sandbox con reintentos |
| R5 | **PII / legal (Ley 25.326)** — capturar DNI/email/teléfono y cederlos a sponsors sin base legal | Alto | Media | 🟠 Media-Alta | Consents con timestamp+versión; endpoints ARCO (export/baja); no ceder a sponsors sin `consents.sponsors`; texto de privacidad real; asesoría legal |
| R6 | **Cupos / concurrencia en inscripciones** — sobreventa de un bloque con `capacity` finito | Medio | Media | 🟠 Media | Cupo atómico en DB (`UPDATE ... WHERE confirmedCount < capacity` o `SELECT FOR UPDATE`); test de carga concurrente como criterio de éxito |
| R7 | **Pico de tráfico el día del evento** — registros + escaneos en puerta + compras de última hora concentrados | Medio | Media | 🟠 Media | Railway always-on (sin cold start) + índices correctos; ensayo de carga al pico estimado; QR validation < 2 s como SLA |
| R8 | **Conectividad en el venue** — WiFi/datos caídos en el Hotel Quinto Centenario el día de la acreditación | Alto | Media | 🟠 Media | Decidir validación offline (firma local / lista pre-descargada) vs online; `RemoteDataStore` con fallback de lecturas; tolerar reconexión |
| R9 | **Auth de organizador débil** — hoy el gate acepta cualquier clave (`ccm2026`) | Alto | Baja (si se hace) | 🟡 Media-Baja | Reemplazar por OTP a allow-list + JWT con rol; gate server-side de endpoints admin; criterio de éxito #6 (doc 02) |
| R10 | **QR falsificable** — `qrToken()` actual es checksum local, no sirve como acceso real | Alto | Baja (si se hace) | 🟡 Media-Baja | Token firmado por server + validación server-side de un solo uso por jornada; `qrToken()` actual NO se usa como acceso real |
| R11 | **Costo de infra** — Railway/Postgres/R2/email transaccional sin presupuesto dimensionado | Bajo | Media | 🟡 Baja | Estimar volumen objetivo (D-N6); R2 sin egress fees; tier de Railway según pico; alertas de gasto |
| R12 | **Migración del DataStore con regresión** — el `RemoteDataStore` no respeta el contrato y rompe pantallas | Medio | Baja | 🟡 Baja | `RemoteDataStore` contra la misma interfaz `DataStore`; fallback a `LocalDataStore` por env; test de paridad pantalla por pantalla |
| R13 | **Pérdida de datos** — sin backup, una caída de DB en pleno evento es catastrófica | Alto | Baja | 🟡 Media-Baja | Backups automáticos de Railway + backup manual antes y durante el evento; probar restore antes del freeze |
| R14 | **Lock-in / bus factor** — un solo dev (Alan) conoce el stack; vacaciones/imprevisto bloquea todo | Medio | Baja | 🟡 Baja | Stack estándar y documentado (estos docs); Node+Postgres portable; código en repo con migraciones versionadas |
| R15 | **Self-serve publicitario abusable** — campaña entra "en vivo" sin cobrar; slots solapados | Medio | Media | 🟡 Media | La campaña entra al slot **solo** tras webhook confirmado; definir política de slot solapado (D-N4); rate limit de creación |

### 1.2 Detalle de los riesgos críticos

**R1 — Timeline vs evento.** Es el riesgo raíz: invierte la prioridad normal de ingeniería. El hito más temprano **no** es el día del evento sino el **cierre de convocatorias** (`Convocatoria.deadline` cae antes del 19/09), así que el flujo de postulaciones tiene que estar real antes que el de puerta. Mitigación: alcance v1 estricto (doc 02 §3), no gold-platear, y un orden de implementación que ponga primero lo que tiene deadline propio.
> Disparador temprano: si a mitad de camino las decisiones de §4 siguen abiertas, recortar más alcance en vez de comprimir QA.

**R2 + R3 — Dependencia de Gastón / canal de venta.** El backend puede quedar listo y aún así no operar si no hay credenciales MP de producción, precios reales y definición de canal de venta. R3 es la de **mayor impacto en alcance**: si las entradas siguen vendiéndose por **Tikealo**, el backend NO hace checkout de entradas — hace registro de la venta externa + acreditación + panel. Si migra a checkout propio, hay que implementar los tres flujos MP completos. Mitigación: abstraer "confirmación de pago" para que valga tanto webhook MP propio como reconciliación con Tikealo, y **no** codear el checkout propio hasta que se decida.

**R4 — Mercado Pago.** El error clásico es confiar en el redirect del browser (`back_urls`) para confirmar el pago — es falsificable. La única fuente de verdad es el **webhook server-to-server**, con verificación de firma e idempotencia (`mpPaymentId @unique` evita doble confirmación ante reintento de MP). Se prueba en sandbox disparando el mismo webhook dos veces (criterio de éxito #3, doc 02).

**R5 — PII / legal.** El activo comercial del evento (leads para sponsors) es también el mayor riesgo legal. Ceder datos a sponsors sin el consentimiento `sponsors: true` explícito es el problema más concreto del modelo de negocio. El backend ya queda preparado (consents con timestamp + versión, export, borrado ARCO) pero **no resuelve** la parte legal: hace falta texto de privacidad real y asesoría sobre Ley 25.326 / AAIP. Reducir superficie: no capturar DNI si la puerta no lo exige (ver D-N9).

**R6 — Cupos.** Para el volumen de un evento de 2 días, un cupo atómico simple alcanza. Solo si un bloque tipo masterclass se vuelve "hot" hace falta subir a `SELECT ... FOR UPDATE` o contador atómico (doc 04). El test: carga concurrente sobre `capacity = N` → exactamente N confirmadas, 0 sobreventas.

**R7 + R8 — Pico + conectividad.** El pico real de CCM no es QPS sostenido sino la **acreditación en puerta**: cientos de scans concentrados. Manejable con un dyno chico always-on + índices, **siempre que** la red del venue aguante (R8). Si el hotel no garantiza conectividad, la acreditación necesita modo offline (firma local o lista pre-descargada de tokens válidos) — eso es una decisión de arquitectura, no un parche (ver D-T5).

---

## 2. Decisiones abiertas de NEGOCIO 🔶

Las define **Gastón** (producto/comercial) o **Alan**. Bloquean datos reales, no el diseño.

### D-N1 — Canal de venta de entradas (la decisión madre) 🔶
- **Opciones.** (a) Migrar a **checkout propio con Mercado Pago**; (b) seguir vendiendo por **Tikealo** y que el backend solo registre la venta + acredite.
- **Recomendación.** Depende de a) si Tikealo ya tiene la audiencia/confianza para 2026 y b) cuánta data de comprador querés capturar de primera mano. Si el objetivo Xnod×CCM es **poseer la data de ticketing**, inclina hacia checkout propio. Diseñar el backend para soportar ambas (interfaz "confirmación de pago" abstracta) hasta decidir.
- **Quién decide.** Gastón (con Alan). **Es la de mayor impacto en alcance.**
- **Para cuándo.** ASAP — condiciona cuánto del módulo de pagos se construye.

### D-N2 — Precios reales (entradas + membresía) 🔶
- **Opciones.** Definir monto de cada `TicketPlan` (hoy varios `price = null`, "a confirmar") y de la membresía Socio CCM.
- **Recomendación.** El schema soporta `price = null` sin romper, pero los flujos quedan en sandbox hasta tener números. Fijar precios antes del seed de producción.
- **Quién decide.** Gastón/Alan.
- **Para cuándo.** Antes de salir de sandbox MP.

### D-N3 — Cuenta de cobro de Mercado Pago 🔶
- **Opciones.** ¿A nombre de quién factura — Gastón, CCM, una sociedad? Una sola cuenta para los 3 flujos (entradas/membresía/publicidad) o cuentas separadas.
- **Recomendación.** Una cuenta única simplifica reconciliación; separar publicidad solo si la contabilidad lo exige. Define `MP_ACCESS_TOKEN` y a dónde cae la plata. **Bloqueante para los tres flujos de pago.**
- **Quién decide.** Gastón.
- **Para cuándo.** Antes de pagos en producción.

### D-N4 — Membresía: vigencia, niveles y modelo (suscripción vs pago único) 🔶
- **Opciones.** Vigencia: (a) perpetua, (b) por edición (caduca post-evento), (c) anual. Modelo: pago único vs suscripción recurrente. ¿"Niveles de suscripción" (la memoria del proyecto los menciona) = más de un tier pago?
- **Recomendación.** Para CCM 2026 arrancar con **un tier pago** y vigencia **por edición o anual** (más simple, `expiresAt` + `isSocio()` chequea fecha). Si hay niveles, `MembershipTier` crece y conviene una tabla `MembershipPlan` (doc 04).
- **Quién decide.** Gastón.
- **Para cuándo.** Antes de modelar `Membership` final.

### D-N5 — Política de datos para sponsors 🔶
- **Opciones.** (a) Solo agregados anónimos; (b) leads individuales con `consents.sponsors = true`; (c) nada hasta acuerdo firmado.
- **Recomendación.** Nunca ceder datos sin el consentimiento explícito; lo más seguro legalmente es empezar por agregados y habilitar leads solo bajo acuerdo + base legal declarada en la política de privacidad. **Implicancia legal directa** (ver R5).
- **Quién decide.** Gastón (comercial) + validación legal.
- **Para cuándo.** Antes de exponer cualquier dato a un sponsor.

### D-N6 — Volumen objetivo del evento 🔶
- **Opciones.** Confirmar orden de magnitud de asistentes/registros/órdenes para 2026 (el seed simula ~1.189 registrados / 703 inscripciones / 41 órdenes).
- **Recomendación.** Necesario para dimensionar Railway/DB y el criterio de carga. Pedir un número aunque sea aproximado.
- **Quién decide.** Gastón.
- **Para cuándo.** Antes del ensayo de carga.

### D-N7 — Sponsors reales de la edición 2026 🔶
- **Opciones.** Qué sponsors reales se cargan, niveles (Principal/Oro/Plata) y exclusividad de rubro.
- **Recomendación.** No afecta el schema, sí el seed de producción. Cargar cuando estén confirmados.
- **Quién decide.** Gastón.
- **Para cuándo.** Antes del seed de producción.

### D-N8 — Contenido exclusivo (`socioOnly`) 🔶
- **Opciones.** Qué eventos/capacitaciones/videos son socio-only para 2026, y si el contenido bloqueado se **oculta** del listado o se muestra "bloqueado" (gancho de conversión a socio).
- **Recomendación.** Mostrar "bloqueado" suele convertir mejor que ocultar. El server debe rechazar inscripción de no-socios a `socioOnly` (`403 SOCIO_ONLY`).
- **Quién decide.** Gastón (producto).
- **Para cuándo.** Antes del seed + lógica de gate.

### D-N9 — ¿La puerta exige DNI? 🔶
- **Opciones.** (a) Sí → se captura y almacena `dni`; (b) no → se saca del flujo y no se almacena el dato más sensible.
- **Recomendación.** Si la acreditación física del hotel no lo exige, **sacar `dni`**: evitar de raíz el dato más sensible reduce la exposición legal (R5).
- **Quién decide.** Gastón / operación de puerta.
- **Para cuándo.** Antes de fijar los campos del perfil.

### D-N10 — ¿El evento admite menores que se registren? 🔶
- **Opciones.** Si puede haber asistentes menores de edad, aplican reglas adicionales de consentimiento.
- **Recomendación.** Confirmar para no quedar offside con la normativa de menores.
- **Quién decide.** Gastón + legal.
- **Para cuándo.** Antes del texto de consentimiento.

### D-N11 — Tarifa del self-serve publicitario 🔶
- **Opciones.** Tarifa por hora del `AdCampaign` y si cobra contra la misma cuenta MP que entradas/membresía.
- **Recomendación.** Misma cuenta salvo necesidad contable; precio por hora definido antes de cobrar de verdad.
- **Quién decide.** Gastón.
- **Para cuándo.** Antes de activar cobro de publicidad.

### D-N12 — Texto de privacidad + términos y ventana de retención 🔶
- **Opciones.** Quién redacta la política de privacidad de CCM; cuánto se guarda la PII post-evento.
- **Recomendación.** Texto real visible y aceptado antes de capturar PII (el consent `terms` ya existe en el modelo, falta el texto). Retención propuesta: operativos se conservan, PII de contacto se purga/anonimiza pasado X tiempo salvo membresía activa. **Requiere validación legal** (Ley 25.326 / AAIP).
- **Quién decide.** Gastón/Alan + asesor legal.
- **Para cuándo.** Antes de capturar PII real en producción.

---

## 3. Decisiones abiertas TÉCNICAS 🔶

Las define **Alan** (con input operativo de Gastón donde se indica). Algunas tienen recomendación fuerte y solo esperan confirmación.

### D-T1 — Dominio del API y del frontend 🔶
- **Opciones.** (a) Dominio propio (`api.ccm.com.ar` + `app.cordobacorazondemoda.com`); (b) subdominio Railway crudo para el API + `soyalantapia.github.io/ccm-app/` para el front.
- **Recomendación.** Dominio propio para producción (mejor para confianza, magic links y webhook de MP), pero el código ya lee orígenes de env: arrancar con el crudo y migrar es solo cambiar `VITE_API_URL` + `CORS_ORIGINS`. Define también el `base` de Vite y los `back_urls` de MP.
- **Quién decide.** Gastón (dominio) / Alan (config).
- **Para cuándo.** Antes de configurar webhook MP de producción.

### D-T2 — ¿El frontend se queda en GitHub Pages o se mueve? 🔶
- **Opciones.** (a) **Queda en GH Pages** (estático), consume el API por `VITE_API_URL` con CORS — es la decisión por defecto; (b) mover a un host con SSR (Vercel/Railway) para mejorar LCP y prerender.
- **Recomendación.** **Quedarse en GH Pages para v1.** Mover es _MÁS ADELANTE_; solo cambia el deploy del front, no el stack del backend. Usar `Authorization: Bearer` (no cookies) por el origen cross-domain.
- **Quién decide.** Gastón/Alan.
- **Para cuándo.** No bloquea v1; confirmar para cerrar alcance.

### D-T3 — Polling vs realtime en el dashboard 🔶
- **Opciones.** (a) **Polling con TanStack Query** (`refetchInterval` 5–15 s); (b) SSE; (c) WebSocket.
- **Recomendación.** **Polling en v1** (fijado): simple, sin estado de conexión, patrón de Norte. SSE queda como mejora posterior si el organizador pide live real durante la acreditación; WebSocket solo si SSE no alcanzara.
- **Quién decide.** Alan.
- **Para cuándo.** Decidido; reabrir solo post-evento.

### D-T4 — Object storage: R2 vs Spaces 🔶
- **Opciones.** (a) **Cloudflare R2** (sin egress fees + CDN integrada); (b) DigitalOcean Spaces.
- **Recomendación.** **R2**, por el modelo sin egress — las galerías se ven/descargan mucho (la UI ya trackea `photo_download`). Spaces solo si hay una razón de cuenta/operación. Subida con URLs pre-firmadas (el browser sube directo al bucket).
- **Quién decide.** Alan/Gastón (según qué cuenta se abra).
- **Para cuándo.** Antes de habilitar subida de imágenes desde admin.

### D-T5 — Validación de QR: online vs offline en puerta 🔶
- **Opciones.** (a) **Online** — el lector consulta el API en cada scan; (b) **offline** — verificación de firma local (RS256, el lector lleva la clave pública) o lista pre-descargada de tokens válidos.
- **Recomendación.** Depende de R8: si el Hotel Quinto Centenario **no** garantiza WiFi/datos confiables el 19–20/09, hace falta offline. Esto define también HS256 vs RS256. **Confirmar conectividad del venue con Gastón/operación** antes de elegir.
- **Quién decide.** Alan (arquitectura) con input de Gastón (venue).
- **Para cuándo.** Antes de implementar el flujo de acreditación.

### D-T6 — Modelo de acreditación: granularidad del QR 🔶
- **Opciones.** ¿El QR acredita por **jornada** (sábado/domingo) o por **entrada VIP comprada**? ¿**Un QR por persona** o **uno por orden** de varias entradas (`TicketOrder.qty`)? Si es N personas por orden, `Ticket` pasa a N:1 con `holderName`.
- **Recomendación.** Modelar `Ticket` dejando la puerta abierta a N por orden. Definir con operación de puerta antes de cerrar el flujo.
- **Quién decide.** Gastón / operación de puerta.
- **Para cuándo.** Antes de implementar acreditación.

### D-T7 — OTP por email: sí/no y proveedor 🔶
- **Opciones.** Auth passwordless por **OTP por email** (recomendado, coherente con la identidad sin contraseña de la app) vs password+JWT clásico. Proveedor: Resend / Postmark / SES.
- **Recomendación.** **OTP por email** para admins y para verificar email en compras. Proveedor: **Resend** (Alan ya lo usa en Mi San Pedro), depende de tener dominio CCM verificado. Reglas: máx ~5 intentos, TTL 10 min, un solo uso, rate limit por email/IP.
- **Quién decide.** Alan; allow-list de emails admin la define Gastón/Alan.
- **Para cuándo.** Antes de auth de admin y OTP de compra (sin esto no hay login de organizador).

### D-T8 — `deviceId` como credencial: header crudo vs JWT por device 🔶
- **Opciones.** (a) El cliente envía `deviceId` en `X-Device-Id` y el backend hace upsert (más simple); (b) firmar el `deviceId` con un secreto del server y emitir un device-token (JWT).
- **Recomendación.** Device-token firmado para que el `deviceId` no sea suplantable; el header crudo solo si se prioriza simplicidad en una primera iteración. Define cómo se ata identidad cliente↔servidor.
- **Quién decide.** Alan.
- **Para cuándo.** Antes de cablear `RemoteDataStore` a endpoints autenticados.

### D-T9 — Trazabilidad de PII: tabla `ProfileField` vs columnas planas 🔶
- **Opciones.** (a) Tabla `ProfileField` (`deviceId, key, value, capturedAt, source`); (b) columnas planas en `DeviceProfile`.
- **Recomendación.** **Tabla aparte** — conserva `source`/`capturedAt` por campo, que es justo el dato de marketing que diferencia esta app, y permite borrar/exportar/cifrar por persona. Cuesta algo más de query; vale la pena si Gastón valora la trazabilidad (oro para segmentación, doc 06).
- **Quién decide.** Alan (con señal de Gastón sobre cuánto importa la segmentación).
- **Para cuándo.** Antes del schema final de perfil.

### D-T10 — Cifrado de PII en reposo 🔶
- **Opciones.** (a) Sin cifrado de columna (solo HTTPS en tránsito + acceso por auth); (b) pgcrypto; (c) cifrado app-side de `value`.
- **Recomendación.** Depende de cuánto DNI/teléfono real se capture (ver D-N9) y del marco legal. Si se elimina el DNI, el riesgo baja y puede no hacer falta cifrado de columna. Decidir junto con la política de retención (D-N12).
- **Quién decide.** Alan + validación legal.
- **Para cuándo.** Antes de capturar PII real, si se decide capturarla.

### D-T11 — Política de merge de dispositivos al recuperar identidad 🔶
- **Opciones.** Al verificar un email que ya tiene un `Device`: (a) **descartar** el device anónimo nuevo y adoptar el verificado; (b) **fusionar** la actividad del anónimo (mover registrations/orders) al viejo.
- **Recomendación.** **Descartar el anónimo y adoptar el verificado** — más simple, sin colisiones de membresía.
- **Quién decide.** Alan.
- **Para cuándo.** Antes de implementar recuperación de identidad.

### D-T12 — Política de slot publicitario solapado 🔶
- **Opciones.** Si dos marcas compran el mismo slot solapado: (a) un slot = un anunciante a la vez, rechazar compra solapada; (b) rotación entre activas; (c) cola FIFO por ventana.
- **Recomendación.** Empezar por (a) rechazar solapado (más simple y predecible para el anunciante). El índice `@@index([slot, status, expiresAt])` soporta cualquiera de las tres. Definir antes de cobrar de verdad.
- **Quién decide.** Gastón/Alan.
- **Para cuándo.** Antes de activar cobro de publicidad (junto a D-N11).

### D-T13 — Unidad monetaria en la DB 🔶
- **Opciones.** (a) **Enteros en unidad mínima** (centavos de ARS); (b) `Decimal @db.Money`.
- **Recomendación.** **Enteros en centavos** para evitar floats. Decidir **antes del seed** para no migrar la columna dos veces.
- **Quién decide.** Alan.
- **Para cuándo.** Antes del seed de producción.

### D-T14 — Plan/tier de Railway y always-on 🔶
- **Opciones.** Servicio always-on (sin cold start el día del evento) y tier de Postgres según volumen (D-N6).
- **Recomendación.** Always-on para evitar cold start en el pico de acreditación (R7). Dimensionar Postgres con el volumen objetivo. Configurar alertas de gasto.
- **Quién decide.** Alan (con presupuesto de Gastón).
- **Para cuándo.** Antes del ensayo de carga.

### D-T15 — Retención y particionado de analytics 🔶
- **Opciones.** Tabla `AnalyticsEvent` append-only sin particionar (suficiente para 2 días) vs particionada por rango de `ts` (mensual). Export CSV self-service del admin vs on-demand.
- **Recomendación.** Para el volumen de un evento de 2 días no es urgente particionar; dejar la migración SQL lista por si escala. Export CSV self-service desde el panel.
- **Quién decide.** Alan.
- **Para cuándo.** No bloquea v1.

---

## 4. Decisiones que, si se demoran, se vuelven riesgo de timeline

No todas las decisiones pesan igual contra la fecha. Estas son las que, sin resolverse a tiempo, frenan implementación (conecta R1 + R2):

| Decisión | Bloquea | Riesgo si se demora |
|---|---|---|
| **D-N1** Canal de venta (Tikealo vs propio) | Todo el módulo de pagos de entradas | 🔴 Define cuánto código de checkout se construye — recortar tarde es caro |
| **D-N3** Cuenta MP de producción | Los 3 flujos de pago en prod | 🔴 Sin esto, todo queda en sandbox; no se puede vender |
| **D-T5** QR online vs offline | Arquitectura de acreditación | 🔴 Es decisión de diseño, no parche; tarde obliga a rehacer el lector |
| **D-T6** Granularidad del QR | Modelo de `Ticket` y acreditación | 🟠 Cambia el schema de tickets |
| **D-T7** OTP/email + allow-list admin | Auth de organizador y OTP de compra | 🟠 Sin esto no hay login de admin real (R9) |
| **D-N2** Precios reales | Salir de sandbox + seed de prod | 🟠 Los flujos no son reales sin números |
| **D-N12** Texto privacidad + retención | Captura legal de PII | 🟠 Capturar PII sin base legal es exposición (R5) |
| **D-N6** Volumen objetivo | Dimensionar Railway/DB + ensayo de carga | 🟡 Sin esto, el ensayo de carga es a ciegas |

**Regla operativa:** las cuatro 🔴 (D-N1, D-N3, D-T5, D-T6) son las que hay que cerrar **primero**. Mientras estén abiertas, el backend se diseña para soportar ambas ramas, pero cada semana que pasan abiertas reduce el margen del code freeze (R1).

---

## 5. Resumen para Gastón/Alan (qué necesito de cada uno)

**De Gastón (negocio):**
1. ¿Tikealo o checkout propio? (D-N1) — **lo primero**
2. Cuenta de Mercado Pago de producción (D-N3)
3. Precios de entradas y membresía (D-N2); modelo y vigencia de membresía (D-N4)
4. Qué se le da a los sponsors y bajo qué acuerdo (D-N5); sponsors reales 2026 (D-N7)
5. Volumen esperado de asistentes (D-N6); contenido socio-only (D-N8)
6. ¿La puerta pide DNI? (D-N9) ¿hay menores? (D-N10) — para reducir riesgo legal
7. Quién redacta privacidad/términos + asesoría legal (D-N12)
8. Conectividad confiable en el venue el 19–20/09 (input para D-T5)
9. Dominio propio (D-T1); tarifa de publicidad self-serve (D-N11)

**De Alan (técnico):**
1. Confirmar GH Pages se queda (D-T2), polling en v1 (D-T3), R2 (D-T4)
2. Cerrar arquitectura de QR online/offline (D-T5) y granularidad (D-T6)
3. OTP/Resend + allow-list (D-T7); device-token firmado (D-T8)
4. `ProfileField` aparte (D-T9); cifrado PII (D-T10); merge de devices (D-T11)
5. Unidad monetaria en centavos (D-T13); plan Railway always-on (D-T14)

Todo lo demás está fijado o no bloquea v1.
