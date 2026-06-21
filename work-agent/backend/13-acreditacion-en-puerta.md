# Acreditación en puerta (QR)

El camino crítico del backend y el objetivo central O2: **que el QR de la app sirva para entrar al evento real**. Hoy el QR es un hash de juguete (`identity.ts → qrToken()`, ver doc 06 §0) — falsificable, sin estado, sin validación en puerta. Este doc fija cómo pasa a ser una acreditación verificable el 19-20/09/2026 en el Hotel Quinto Centenario: qué viaja en el QR, cómo se emite, cómo lo valida la puerta online y offline, y cómo opera el personal de puerta.

Este doc es el **canon de la acreditación/QR**. Se apoya en: doc 04 (schema de `Ticket`), doc 05 (paths y taxonomía de eventos), doc 06 (secretos y roles), doc 07 (el webhook que dispara la emisión paga).

---

## 1. Modelo del QR: firma + estado (híbrido)

El QR **no** contiene un id opaco que la puerta busca en una tabla. Contiene un **`accreditationToken`**: un JWT firmado por el server. El **estado de uso** (¿ya entró por esta jornada?) vive aparte, en una fila `Ticket` de la DB. Es un modelo **híbrido** a propósito.

### 1.1 El token (lo que viaja en el QR)

```ts
// accreditationToken = JWT firmado con ACCREDITATION_TOKEN_SECRET (doc 06 §5, secreto SEPARADO
// del device-token y del admin-token). El string del JWT es lo que el componente dibuja como QR.
{
  deviceId: 'dev_8f...',     // Device.id (canon 6: todas las FKs apuntan a Device.id)
  ticketId: 'tkt_abc',       // Ticket.id — ata el token a la fila de estado
  jornada:  'sabado',        // 'sabado' | 'domingo' (mismos valores que TicketPlan.day / Ticket.jornada)
  jti:      'a1b2c3...',     // identificador único del token = se guarda en Ticket.qrToken
  typ:      'accred',
  exp:      1758499200       // fin del evento (20/09 ~23:59 ART) — el QR muere solo después
}
```

Firma **HS256 con `ACCREDITATION_TOKEN_SECRET`**. Falsificar un QR válido exige ese secreto del server: imposible desde el cliente (a diferencia del hash actual, que cualquiera reproduce). 🔶 [DECISIÓN ABIERTA] HS256 vs RS256: si el lector de puerta verifica **offline** sin pegarle al server, RS256 deja distribuir solo la clave pública al dispositivo de puerta sin exponer el secreto de firma. Con un lector online o un solo dispositivo de confianza, HS256 alcanza. Lo decide la conectividad en puerta (§5) — depende de Gastón/Alan + relevamiento del hotel.

### 1.2 El estado (lo que vive en la DB)

El JWT es **stateless**: una vez firmado, el server no puede "saber" si ya se usó solo mirándolo. Por eso el estado de check-in vive en `Ticket` (schema canónico en doc 04):

```prisma
model Ticket {
  id          String   @id @default(cuid())
  deviceId    String                          // FK → Device.id
  orderId     String?                         // null si es entrada GRATIS (sin pago)
  jornada     String                          // 'sabado' | 'domingo'
  qrToken     String   @unique                // = jti del JWT que viaja en el QR
  checkedIn   Boolean  @default(false)
  checkedInAt DateTime?
  createdAt   DateTime @default(now())

  device Device       @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  order  TicketOrder? @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@unique([deviceId, jornada])   // una sola entrada por (device, jornada)
  @@index([checkedIn])
}
```

### 1.3 Por qué híbrido (y no solo-firma o solo-DB)

- **Solo firma (JWT puro, sin DB):** verificable offline, pero **no hay forma de detectar reúso** — un QR pasa el control, se saca una captura y entra otra persona. Inaceptable para un evento con entradas VIP pagas.
- **Solo DB (id opaco que se busca):** detecta reúso, pero **muere si la puerta se queda sin internet**: sin red no se puede consultar y la fila se atasca.
- **Híbrido (lo nuestro):** la **firma** permite validar la autenticidad del QR aunque no haya red (offline); el **estado en `Ticket`** permite garantizar "un solo uso por jornada" cuando hay red (online). Cada mitad cubre la debilidad de la otra. El precio es la ventana de doble-uso en modo offline (§4.2), que mitigamos.

---

## 2. Emisión del token + Ticket (dos disparadores)

Ambos caminos terminan en lo mismo: una fila `Ticket` + un `accreditationToken` firmado con su `jti` guardado en `Ticket.qrToken`. Quién dispara la emisión es lo que cambia (canon 12).

```
(a) ENTRADA GRATIS — acreditación general "Primera Pasada" (sábado / domingo)
─────────────────────────────────────────────────────────────────────────────
  Asistente              Backend
     │  register(eventId)    │
     │ ─────────────────────▶│ POST /api/v1/registrations  → Registration {status:'confirmada'}
     │                       │   emite Ticket { orderId: null, jornada, qrToken=jti }
     │                       │   firma accreditationToken (JWT)
     │ ◀──── 201 ────────────│   emite analytics registration_created
     │                       │
     │  GET /me/accreditation│   (front pide el token; offline cae al cacheado)
     │ ─────────────────────▶│ devuelve { accreditationToken, jornada, ... }


(b) ENTRADA VIP PAGA — Night VIP / Sunset VIP / Combo (TicketOrder + Mercado Pago)
─────────────────────────────────────────────────────────────────────────────
  Asistente         Backend                Mercado Pago
     │ createOrder()   │                          │
     │ ───────────────▶│ POST /api/v1/orders      │  TicketOrder {status:'iniciada'}
     │ ◀── initPoint ──│                          │
     │ ──── paga ──────┼─────────────────────────▶│
     │                 │ POST /api/v1/webhooks/mp  │  status=approved
     │                 │ ◀─────────────────────────│
     │                 │  Payment.status=approved
     │                 │  TicketOrder.status='confirmada'
     │                 │  ▶ emite Ticket { orderId, jornada, qrToken=jti } + JWT
     │                 │  emite analytics ticket_order_confirmed (server, no front)
```

- **(a) Gratis:** la `Registration` confirmada (doc 05 §4) emite directo, **sin pago**. `Ticket.orderId = null`.
- **(b) Paga:** **nunca** el redirect de vuelta ni el cliente confirman. La emisión la dispara el **webhook MP `approved`** (`POST /api/v1/webhooks/mp`, canon 3) sobre el `TicketOrder`, en la misma transacción que pasa la orden a `confirmada` (doc 07 §6). `Ticket.orderId` poblado.
- El `Ticket` es **idempotente** por `@@unique([deviceId, jornada])`: un webhook reentrante o una segunda `register` a la misma jornada no crea un segundo ticket (cae en el upsert; ver doc 07 §7 idempotencia del webhook por `mpPaymentId`).

🔶 [DECISIÓN ABIERTA] **Granularidad del QR** (heredada de doc 04):
- **¿Un QR por orden (`TicketOrder.qty = N`) o N tickets individuales?** El modelo hoy es N:1 (`Ticket.orderId` → `TicketOrder`). Si una orden de `qty=3` es para 3 personas distintas, hacen falta 3 filas `Ticket` con un `holderName` cada una (campo a agregar) y 3 QR. Si es "una persona, 3 entradas que reparte", igual conviene N tickets para poder marcar 3 check-ins. **Recomendación:** N tickets individuales — es la única forma de contar quién entró.
- **¿QR por jornada o por entrada VIP?** El `@@unique([deviceId, jornada])` asume **un ticket por jornada por device**. Pero un Combo VIP habilita sábado *y* domingo: son **dos** jornadas → **dos** tickets (uno `jornada='sabado'`, otro `'domingo'`), no uno. Confirmar que la app muestre ambos QR (o uno que rote por jornada). Esto lo cierra Gastón/Alan según cómo se vende el Combo.

---

## 3. Endpoint de scan: `POST /api/v1/admin/checkin`

Canon 5 (doc 05): el control de puerta pega acá. Rol **STAFF** (doc 06 §2 — personal de puerta, solo escanea; no ve el panel ni precios). También lo pueden usar OWNER/EDITOR (superset).

### 3.1 Request

```http
POST /api/v1/admin/checkin
Authorization: Bearer <adminToken>     # rol STAFF | EDITOR | OWNER
Content-Type: application/json

{ "token": "eyJhbGc..." }              # el string crudo escaneado del QR (el JWT entero)
```

### 3.2 Respuestas (un solo shape, discriminado por `result`)

```jsonc
// 200 OK — caso feliz
{
  "result": "valido",
  "ticket": { "id": "tkt_abc", "jornada": "sabado", "checkedInAt": "2026-09-19T09:14:00-03:00" },
  "holder": { "name": "Ana Pérez", "tipo": "VIP" | "General", "socio": true }   // qué muestra la puerta
}

// 200 OK — ya fue usado (NO es error de auth; la puerta necesita distinguirlo del feliz)
{ "result": "ya_usado", "ticket": { "id": "tkt_abc", "jornada": "sabado", "checkedInAt": "2026-09-19T08:02:00-03:00" } }

// 200 OK — el token es de otra jornada (vino el sábado con el QR del domingo)
{ "result": "jornada_incorrecta", "tokenJornada": "domingo", "hoy": "sabado" }

// 200 OK — firma inválida / token expirado / jti sin Ticket en DB (QR falso o adulterado)
{ "result": "invalido", "reason": "firma" | "expirado" | "desconocido" }
```

> **Por qué 200 y no 4xx para `ya_usado`/`invalido`:** la puerta opera a alta velocidad; el operador necesita un semáforo (verde/rojo/ámbar) no un stack de errores HTTP. Reservamos los códigos de error (`401 ADMIN_REQUIRED`, `403`) para fallas de **auth del operador** (token de staff vencido), no para el resultado del scan. `result` es el `code` estable para el switch del front (mismo criterio que doc 05 §0).

### 3.3 Lógica de un-uso-por-jornada (online)

```ts
async function checkin(req) {
  const claims = verifyAccreditationToken(req.body.token)   // firma + exp con ACCREDITATION_TOKEN_SECRET
  if (!claims) return { result: 'invalido', reason: 'firma' /* o 'expirado' */ }

  const jornadaHoy = currentJornada()                       // 'sabado' el 19, 'domingo' el 20 (config del evento)
  if (claims.jornada !== jornadaHoy)
    return { result: 'jornada_incorrecta', tokenJornada: claims.jornada, hoy: jornadaHoy }

  // transacción: leer-y-marcar atómico para que dos escáneres no marquen el mismo a la vez (§4.1)
  return await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { qrToken: claims.jti } })
    if (!t) return { result: 'invalido', reason: 'desconocido' }   // jti firmado pero sin fila → revocado/raro
    if (t.checkedIn) return { result: 'ya_usado', ticket: pick(t) }
    const updated = await tx.ticket.update({
      where: { qrToken: claims.jti, checkedIn: false },            // guard: solo si seguía sin usar
      data:  { checkedIn: true, checkedInAt: new Date() },
    })
    return { result: 'valido', ticket: pick(updated), holder: await resolveHolder(tx, t) }
  })
}
```

- **El `jti` del token = `Ticket.qrToken`** (canon 11): es el puente entre el JWT y la fila de estado. Un JWT con firma válida pero `jti` que no existe en DB → `invalido/desconocido` (token revocado o emitido en otro entorno).
- `resolveHolder` arma `name` desde los `ProfileField` del device (`firstName`/`lastName`) y `tipo`/`socio` desde el `Ticket.orderId` (null = General) y la `Membership` (doc 04).
- Emite analytics: no hay evento canónico de "check-in" en la taxonomía (doc 05 §12). 🔶 [DECISIÓN ABIERTA] si se agrega un `ticket_checked_in` a la taxonomía o el check-in se mide solo desde `Ticket.checkedInAt` (sin pasar por el bus de analytics). Recomiendo lo segundo: el estado ya está en la fila, no necesita un evento que infle la tabla.

---

## 4. Modo puerta de la PWA: online vs offline

El control de puerta corre en un dispositivo del staff (celular/tablet con la PWA en modo escáner, o un lector dedicado). Hay dos modos según la red del hotel.

### 4.1 ONLINE (preferido — hay WiFi/datos confiables)

1. El escáner lee el QR → obtiene el string del JWT.
2. `POST /api/v1/admin/checkin { token }` con el `adminToken` de staff.
3. El server valida firma **y** estado, marca `checkedIn` en la **misma transacción** y responde.
4. La puerta muestra el semáforo: **verde** (`valido`), **rojo** (`ya_usado` / `invalido`), **ámbar** (`jornada_incorrecta`).

**Concurrencia / doble-scan (canon 18, mismo patrón transaccional que el cupo de bloque):** dos escáneres que leen el mismo QR en el mismo instante. El `update where qrToken AND checkedIn: false` dentro de la transacción garantiza que **solo uno** gana la carrera: el segundo encuentra `checkedIn: true` y devuelve `ya_usado`. No hace falta lock explícito — el `WHERE checkedIn=false` actúa como compare-and-swap atómico. (v1 corre 1 sola instancia en Railway, canon 19; la atomicidad la da Postgres, no la app, así que escala sin cambios cuando se vaya a ≥2 instancias.)

### 4.2 OFFLINE (sin red en la puerta)

Cuando el hotel no tiene conectividad confiable, el escáner **no puede** consultar `Ticket.checkedIn`. Cae a validación local:

1. La PWA de puerta tiene cacheado el **secreto de verificación**: la clave pública (si RS256) o, con HS256, **no se puede verificar offline sin exponer el secreto** → razón fuerte para RS256 si se necesita offline real (§1.1).
2. Lee el QR → **valida la firma del JWT localmente** (autenticidad + `exp` + `jornada` correcta). Esto detecta QR falsos/adulterados **sin red**.
3. Marca el resultado en pantalla y **encola** el check-in (`{ jti, checkedInAt, jornada }`) en IndexedDB.
4. Cuando vuelve la red, **sincroniza la cola**: envía cada check-in encolado a `POST /api/v1/admin/checkin` (o un endpoint batch `…/checkin/sync`). El server marca los `Ticket` y, si alguno ya estaba `checkedIn` por otro escáner, lo registra como **conflicto** (doble-uso detectado tarde).

**Riesgo de doble-uso en offline:** sin la DB, dos escáneres offline no se ven entre sí; el mismo QR puede pasar dos veces y recién al sincronizar se descubre. **Mitigaciones:**
- **Una sola "caja" por jornada** (un punto de control físico) → sin escáneres paralelos no hay carrera offline.
- **Cache compartido local:** si los escáneres están en la misma LAN, un mini-servicio local (o un dispositivo "maestro") mantiene el set de `jti` ya usados y los otros consultan ahí; degrada de "DB remota" a "DB local" sin perder el chequeo de reúso.
- **Aceptar el riesgo:** para la acreditación **general gratis** el costo de un doble-uso es bajo (no hay plata); para **VIP paga** conviene forzar online en esa puerta. 🔶 [DECISIÓN ABIERTA] qué puertas toleran offline.

🔶 [DECISIÓN ABIERTA] **¿el Hotel Quinto Centenario tiene WiFi/datos confiables el 19-20/09?** (heredada de doc 06 §1.6). Define cuánto se apoya la puerta en online (chequeo de reúso real) vs offline (solo firma) y si vale RS256. **Acción:** relevar la conectividad de la puerta *antes* del ensayo del ~08/09 (doc 12). Plan B siempre disponible: lista impresa de `Ticket` confirmados ordenada por nombre, como respaldo manual si todo falla.

---

## 5. Operación en puerta

Quién hace qué el día del evento, con la mira puesta en velocidad y en no trabar la fila.

- **Rol y acceso:** el personal de puerta entra con un `AdminUser` rol **STAFF** (doc 06 §2). Login por OTP a su email (no comparten una clave). El `adminToken` de STAFF **solo** habilita `POST /api/v1/admin/checkin`: no ve órdenes, precios, analytics ni datos de otros asistentes. Si se filtra su dispositivo, el daño máximo es escanear QR.
- **Varios escáneres simultáneos:** soportado en **online** (la transacción del §4.1 serializa el doble-scan). En **offline**, varios escáneres en paralelo reintroducen el riesgo de doble-uso (§4.2) → preferir un punto de control único por jornada o el cache compartido local.
- **Qué ve el operador en cada scan:**
  - **Verde** → nombre del asistente + tipo (General / VIP) + si es **Socio CCM** (para el trato preferencial VIP). "Adelante, Ana."
  - **Rojo `ya_usado`** → "Esta entrada ya ingresó a las 08:02." (con la hora, para destrabar discusiones).
  - **Rojo `invalido`** → "QR no válido." (firma falla o desconocido → derivar a mesa de soporte).
  - **Ámbar `jornada_incorrecta`** → "Este QR es para el domingo." (caso típico: vino el día equivocado).
- **Manejo de error de red en la puerta:** si `POST /checkin` **timeout/cae** estando en modo online, la PWA **no** debe trabar la fila ni rechazar al asistente. Cae automáticamente a **validación de firma local** (modo offline, §4.2), encola el check-in y muestra un indicador de "modo offline" al operador. La fila sigue moviéndose; la consistencia se reconcilia al volver la red. Nunca dejar a alguien afuera por un timeout de red.
- **Reintentos del front:** el escáner debounce-ea el mismo `jti` (no re-postear el mismo QR si el operador escanea dos veces seguidas por nervios) y reintenta con backoff ante 5xx; ante `ADMIN_REQUIRED` (token de staff vencido) fuerza re-login por OTP sin perder la cola offline.

---

## 6. Checklist de implementación

1. **`Ticket`** (tabla + migración) con `@@unique([deviceId, jornada])` y `qrToken @unique` (doc 04).
2. **Emisión:** enganchar (a) en el handler de `POST /api/v1/registrations` (entrada gratis) y (b) en `applyBusinessTransition('ticket_order','approved')` del webhook (doc 07 §6). Firmar el JWT con `ACCREDITATION_TOKEN_SECRET`, guardar `jti` en `Ticket.qrToken`.
3. **`GET /api/v1/me/accreditation`** — el front pide el/los `accreditationToken` del device (uno por jornada habilitada); offline cae al cacheado en `localStorage`. Reemplaza `qrToken()` de juguete en `AccreditationCard` y `PrimaryActionCard`.
4. **`POST /api/v1/admin/checkin`** con `requireAdmin('OWNER','EDITOR','STAFF')` (doc 06 §2.3), lógica transaccional del §3.3.
5. **Modo escáner de la PWA:** cámara/lector → online por default, fallback offline (firma local + cola IndexedDB + sync).
6. **Ensayo de acreditación** (~08/09, doc 12): simular puerta con red y sin red, doble-scan, jornada cruzada, y validar el plan B impreso.
7. **Borrar `qrToken()`** de `src/lib/identity.ts` como mecanismo real (queda, si acaso, como fallback de demo sin backend).

---

## 7. Decisiones abiertas (resumen)

- 🔶 **HS256 vs RS256** para el `accreditationToken` — RS256 si se necesita verificación offline sin exponer el secreto. (§1.1, §4.2)
- 🔶 **Granularidad del QR:** un QR por orden (`qty=N`) vs N tickets individuales (recomendado N); QR por jornada (Combo VIP = 2 tickets). (§2)
- 🔶 **¿Evento `ticket_checked_in` en la taxonomía** o medir el check-in solo desde `Ticket.checkedInAt`? (recomendado: solo la fila). (§3.3)
- 🔶 **Conectividad del Hotel Quinto Centenario** el 19-20/09 → define el peso de online vs offline y si vale RS256; relevar antes del ensayo. (§4.2)
- 🔶 **Qué puertas toleran offline** (general gratis sí, VIP paga forzar online). (§4.2)
