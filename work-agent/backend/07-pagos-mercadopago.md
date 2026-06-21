# Pagos con Mercado Pago

Diseño de la integración **real** de Mercado Pago para los tres flujos que hoy son mock con un QR estático: **entradas** (`TicketOrder`), **membresía Socio CCM** (`becomeSocio`) y **publicidad autogestionada** (`AdCampaign`). El principio rector: el pago **nunca** lo confirma el cliente ni el redirect; lo confirma el **webhook** del lado del server, que es la única transición autoritativa de la máquina de estados.

> Contexto: hoy `LocalDataStore` marca socio/orden en el acto (`becomeSocio(paid)` escribe `tier: 'socio'` de una; `createOrder` deja `status: 'iniciada'` y `setOrderStatus('confirmada')` lo dispara la propia UI). Eso es demo. En real, el alta de socio / la confirmación de orden / la activación de campaña salen del webhook de MP, no de la pantalla.

---

## 0. Decisiones abiertas (bloquean la implementación real)

- 🔶 **[DECISIÓN ABIERTA] De quién es la cuenta de Mercado Pago.** Toda la integración cuelga de **un** `MP_ACCESS_TOKEN`. Define quién recibe la plata, quién es titular fiscal y quién administra reembolsos/contracargos. Candidatos: cuenta CCM (Gastón), cuenta personal de Alan (puente temporal, no recomendado para producción), o **una cuenta MP por flujo** (entradas vs. self-serve podrían liquidar a cuentas distintas — ver D del §7). Sin esto, `initPoint` y tokens son placeholders.
- 🔶 **[DECISIÓN ABIERTA] Membresía: pago único vs. suscripción recurrente.** `Membership = { tier, since, paid }` no tiene fecha de vencimiento. Si Socio CCM es **anual/recurrente**, hay que usar **MP Suscripciones (preapproval)**, agregar `expiresAt` y un cron de renovación, y manejar `payment.recurring`. Si es **pago único** (lo más simple, una membresía "de por vida del evento"), alcanza con Checkout Pro como entradas. Este doc cubre los dos caminos pero marca el recurrente como opt-in.
- 🔶 **[DECISIÓN ABIERTA] Precios.** Los 5 tiers de entrada (`sab-general`, `sab-night-vip`, `combo-vip`, `dom-general`, `dom-sunset-vip`), el precio de Socio CCM y la **tarifa por hora** del self-serve. Hoy `TicketPlan.price` puede ser `null` (= "a confirmar"). El server calcula `total` desde la DB; sin precios reales el `total` y el `initPoint` no son reales. El admin los fija vía `PATCH /admin/plans/:id`.

---

## 1. Checkout Pro vs. Payment Brick: qué usamos y por qué

| Criterio | **Checkout Pro** (redirect) | **Payment Brick** (embebido) |
|---|---|---|
| UX | El usuario sale a `mercadopago.com.ar`, paga, vuelve | El form de tarjeta vive **dentro** de la PWA |
| PCI / riesgo | MP maneja la tarjeta; nosotros no la tocamos | Tokenización en el cliente (SDK JS), igual no toca el server |
| Esfuerzo | Crear **preferencia** + redirigir + webhook | Montar el Brick + `POST /process_payment` + manejar estados en front |
| Encaja con… | El mock actual (QR/redirect a MP ya existe) | Una experiencia "no salir de la app" |
| Frontend en GH Pages | Funciona tal cual (solo abre una URL) | Requiere cargar el SDK y `PUBLIC_KEY` en el front estático |

**Decisión: arrancamos con Checkout Pro (preferencia + redirect).** Razones:
1. Es lo más cercano al mock actual — el QR/redirect a MP ya es parte del flujo, así que la UI casi no cambia.
2. Saca a CCM del alcance PCI: nunca vemos datos de tarjeta.
3. El front sigue siendo estático en GH Pages; solo necesita abrir una URL (`initPoint`).

**Payment Brick queda como mejora posterior** para el flujo de entradas (el de mayor volumen), si se quiere la conversión de no-salir-de-la-app. El backend casi no cambia: en vez de devolver `initPoint`, el server expone la `preferenceId` + `PUBLIC_KEY` y el Brick procesa contra MP; el **webhook sigue siendo idéntico**. Por eso el contrato (`{ checkout: { provider, initPoint } }`) ya deja lugar para agregar `preferenceId`/`publicKey` sin romper.

---

## 2. La pieza central: una sola tabla `Payment` para los 3 flujos

Los tres flujos comparten la mecánica (crear preferencia → redirigir → webhook confirma). En vez de cablear MP tres veces, hay **una** tabla `Payment` polimórfica (canon: doc 04 es la fuente de verdad del schema) que referencia el recurso de negocio vía `(kind, resourceId)`. El webhook actualiza el `Payment` y, según su `kind`, dispara la transición del recurso correspondiente.

```prisma
enum PaymentKind   { ticket_order  membership  ad_campaign }
enum PaymentStatus { pending  approved  rejected  refunded }

model Payment {
  id            String        @id @default(cuid())
  kind          PaymentKind
  // Referencia polimórfica al recurso de negocio: kind + resourceId apuntan a UN recurso.
  resourceId    String                          // id del TicketOrder / Membership / AdCampaign
  deviceId      String                          // quién paga (FK -> Device.id, X-Device-Id)

  amount        Int                             // en CENTAVOS de ARS — nunca float
  currency      String        @default("ARS")
  status        PaymentStatus @default(pending)

  // Vínculo con Mercado Pago (vive SOLO acá, no en los recursos)
  mpPreferenceId String?      @unique           // id de la preferencia (Checkout Pro)
  mpPaymentId    String?      @unique           // id del payment confirmado (llega por webhook)
  externalRef    String       @unique           // nuestro external_reference; ej "ord_abc" / "mem_xxx" / "cmp_1"
  idempotencyKey String?                        // el Idempotency-Key del POST que lo creó

  raw            Json?                           // último payload crudo de MP (auditoría/reconciliación)
  createdAt      DateTime     @default(now())
  approvedAt     DateTime?
  updatedAt      DateTime     @updatedAt

  @@unique([kind, resourceId])
  @@index([status, kind])
  @@index([deviceId])
}
```

Notas duras:
- **Las columnas de MP viven SOLO en `Payment`.** `TicketOrder`, `Membership` y `AdCampaign` **no** llevan `mpPreferenceId`/`mpPaymentId`; cada recurso conserva su **propio enum de estado** (su máquina de estados) que el webhook actualiza. `Payment` es el único lugar donde se guarda el vínculo con MP y el `status` del cobro (`pending|approved|rejected|refunded`).
- **`Membership` tiene PK propia `id`** (no `deviceId`) + FK `deviceId → Device.id`, justamente para que `Payment.resourceId` la pueda referenciar igual que a un `TicketOrder` o `AdCampaign`. El "una membresía por device" se garantiza con un `@@unique([deviceId])` en `Membership` (ver doc 04), no usando `deviceId` como PK.
- **`deviceId` referencia `Device.id`** (la única entidad raíz; la PII vive en `ProfileField`, ver doc 04). Es quien paga.
- **`amount` en centavos `Int`.** MP usa decimales en su API (`transaction_amount: 1500.00`), pero internamente guardamos centavos para no arrastrar errores de float. Conversión solo en el borde con MP.
- **`externalRef` es nuestro ancla.** Va en la preferencia como `external_reference`, vuelve en el webhook, y nos deja correlacionar sin confiar en el `mpPaymentId` (que recién conocemos al confirmar).
- **`mpPaymentId @unique`** = la idempotencia del webhook a nivel DB (ver §5).
- **`status` de `Payment` sin `cancelled`.** El enum canónico es `pending|approved|rejected|refunded`. Cuando MP reporta `cancelled`, lo mapeamos a `rejected` en `Payment`; el "cancelado" como tal vive en el enum de estado del recurso (ej. `OrderStatus = cancelada`).

---

## 3. Creación de la preferencia (Checkout Pro)

Los tres `POST` de pago (`POST /orders`, `POST /me/membership`, `POST /campaigns`) siguen el mismo esqueleto: crear el recurso de negocio en estado inicial → crear `Payment(pending)` → crear preferencia en MP → devolver `initPoint`. **El precio lo calcula el server desde la DB**, jamás el cliente.

### Payload de preferencia (ejemplo: orden de entrada)

```jsonc
// POST https://api.mercadopago.com/checkout/preferences
// Authorization: Bearer <MP_ACCESS_TOKEN>
{
  "items": [
    {
      "id": "sab-night-vip",
      "title": "CCM 2026 — Sábado Night VIP",
      "quantity": 2,
      "unit_price": 18000.00,           // ARS; el server lo arma desde TicketPlan.price + serviceCharge
      "currency_id": "ARS"
    }
  ],
  "payer": { "name": "Ana", "email": "ana@x.com" },   // de ProfileField (captura progresiva, FK -> Device.id; doc 04/06)
  "external_reference": "ord_abc",                     // == Payment.externalRef
  "metadata": { "kind": "ticket_order", "deviceId": "dev_8f...", "orderId": "ord_abc" },
  "notification_url": "https://api.ccm.com.ar/api/v1/webhooks/mp",
  "back_urls": {
    "success": "https://soyalantapia.github.io/ccm-app/#/pago/exito?ref=ord_abc",
    "pending": "https://soyalantapia.github.io/ccm-app/#/pago/pendiente?ref=ord_abc",
    "failure": "https://soyalantapia.github.io/ccm-app/#/pago/error?ref=ord_abc"
  },
  "auto_return": "approved",
  "expires": true,
  "expiration_date_to": "2026-09-18T23:59:59.000-03:00"   // entradas: cierra con el evento
}
```

- **`external_reference` y `metadata.kind`** son la columna vertebral: el webhook los usa para saber a qué recurso y a qué flujo pertenece el pago sin una segunda llamada.
- **`back_urls` apuntan a rutas hash** porque el front es PWA en GH Pages con `react-router` (`/#/...`, base `/ccm-app/`). Son **solo UX** ("gracias por tu compra"): **no** confirman nada. La confirmación real es el webhook.
- **`notification_url`** debe ser HTTPS pública (Railway lo es). En local se usa un túnel (ver §8).
- Para **membresía** el `items` es un solo ítem de precio fijo; para **self-serve** el `unit_price` = tarifa/hora × `hours`.

### Respuesta de MP → respuesta del API

MP devuelve `{ id, init_point, sandbox_init_point }`. Guardamos `id` en `Payment.mpPreferenceId` y devolvemos al front lo que ya define el contrato (`05-api-contrato.md`):

```jsonc
// 201 Created  (POST /orders)
{
  "order": { "id": "ord_abc", "planId": "sab-night-vip", "status": "iniciada", "qty": 2, "total": 36000, ... },
  "checkout": { "provider": "mercadopago", "initPoint": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=..." }
}
```

En **sandbox** devolvemos `sandbox_init_point`; en **prod**, `init_point`. La selección la hace el server según el `MP_ENV`, no el cliente (§8).

---

## 4. Máquina de estados: cómo el webhook mueve cada flujo

El estado de negocio (`OrderStatus`, `Membership.tier`, campaña activa) **deriva** del `Payment.status`, que solo cambia por webhook (salvo el override manual de admin para soporte).

### Entradas — `OrderStatus`

```
iniciada ──(POST /orders/:id/redirected)──► redirigida_mp ──(webhook approved)──► confirmada
   │                                              │
   └─────────────(webhook rejected/cancelled)─────┴──────────────────────────────► cancelada
```

- `iniciada`: lo deja el `POST /orders` (crea `Payment(pending)` + preferencia).
- `redirigida_mp`: lo deja `POST /api/v1/orders/:id/redirected` (participio, canon 4), que el front llama **justo antes** de abrir `initPoint`. Es señal de UX/analytics (`ticket_order_redirected_mp`, canon 13), no de pago.
- `confirmada`: **webhook** con `payment.status === 'approved'` → `Payment.status = approved`, `TicketOrder.status = 'confirmada'`, emite `ticket_order_confirmed` (lo emite el **server**, no el front, para no doble-contar) y **dispara la emisión del `Ticket` + `accreditationToken`** (ver §6, detalle en doc 13).
- `cancelada`: webhook con `rejected`/`cancelled`, o expiración de la preferencia.

### Membresía — `Membership.tier`

```
free ──(POST /me/membership: crea preferencia)──► free (sigue free) ──(webhook approved)──► socio
```

- El `POST /me/membership` **NO** marca socio (a diferencia del `becomeSocio` actual del `LocalDataStore`). Crea `Payment(kind: membership, pending)` + preferencia y devuelve `initPoint`.
- El alta a `socio` (`tier: 'socio'`, `since = approvedAt`, `paid = amount/100`) ocurre en el **webhook approved**, que emite `membership_purchased`.
- 🔶 **[DECISIÓN ABIERTA]** Si es **recurrente**, el "approved" inicial activa la suscripción y MP manda un webhook por cada cobro periódico; ahí se renueva `since`/`expiresAt`. Si falla un cobro recurrente (`payment.status` distinto de approved en una renovación), se degrada a `free` tras período de gracia.

### Publicidad self-serve — `AdCampaign`

```
(POST /campaigns: status=pendiente_pago) ──(webhook approved)──► activa dentro de [startsAt, expiresAt] ──(now > expiresAt)──► expirada
                       │
                       └──────────────(webhook rejected)──────────────────────────────────────────────► rechazada
```

El estado de la campaña es el enum `CampaignStatus { pendiente_pago, activa, expirada, rechazada }` (canon 8) con campos de vigencia `startsAt`/`expiresAt` (`DateTime?`). **No** existe el flag `paid` ni los campos `activeFrom`/`activeTo`.

- El `POST /campaigns` valida slot libre (`409 SLOT_OCCUPIED` si hay otra `activa` en la ventana — una sola campaña `activa` por slot, garantizado por constraint único), crea la campaña con `status = pendiente_pago` + `Payment(kind: ad_campaign, pending)` + preferencia, **pero la campaña NO sale al aire**.
- El **webhook approved** pasa la campaña a `status = activa` y le setea `startsAt = approvedAt`, `expiresAt = approvedAt + hours`. Recién ahí `GET /creatives/:slot` la sirve por encima del sponsor seed (lógica del §9 del contrato).
- `getActiveCampaign(slot)` filtra `status = 'activa' AND now() entre startsAt y expiresAt`. El vencimiento es lógico: no hace falta cron para "apagarla" (la query la deja de servir al pasar `expiresAt`); sí conviene un cron que pase a `expirada`/limpie preferencias `pending` viejas.
- Webhook `rejected`/`cancelled` → `status = rechazada`.

---

## 5. Webhook: verificación de firma + idempotencia

MP notifica a `notification_url` con un `POST` que trae `{ type, data: { id } }` (el `data.id` es el **payment id**, no el de la preferencia). **El webhook nunca confía en el payload**: toma el `id`, **consulta el payment a la API de MP** y actúa sobre el dato verificado.

### 5.1 Verificación de firma (`x-signature`)

MP firma cada webhook con HMAC-SHA256 usando un **secret** del panel del developer. El header `x-signature` trae `ts=<unix>,v1=<hmac>`. Se reconstruye el `manifest` con `id` (del query `data.id`), `request-id` (header `x-request-id`) y `ts`, y se compara en tiempo constante.

```ts
import crypto from 'node:crypto'

function verifyMpSignature(req): boolean {
  const sig = req.header('x-signature')            // "ts=1700000000,v1=abc123..."
  const requestId = req.header('x-request-id') ?? ''
  if (!sig) return false
  const parts = Object.fromEntries(sig.split(',').map(kv => kv.trim().split('=')))
  const ts = parts.ts, hash = parts.v1
  if (!ts || !hash) return false

  // dataId viene del query string ?data.id=...  (lowercased según doc de MP)
  const dataId = String(req.query['data.id'] ?? '').toLowerCase()
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = crypto
    .createHmac('sha256', process.env.MP_WEBHOOK_SECRET!)
    .update(manifest)
    .digest('hex')

  // timing-safe + rechazar webhooks viejos (> 5 min) para evitar replay
  const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300
  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))
}
```

### 5.2 Idempotencia del webhook

MP **reintenta** el webhook (mismo evento varias veces) y puede mandar varios eventos para un mismo pago (`created`, luego `updated`). La idempotencia se ancla en `Payment.mpPaymentId @unique` + una transición de estado que solo avanza:

- Si ya procesamos ese `mpPaymentId` con `status: approved`, salir con `200` sin re-ejecutar (no re-emitir `membership_purchased`, no re-generar QR).
- Las transiciones son **monótonas**: una vez `approved`, un webhook tardío `pending` no la baja. Solo `refunded`/contracargo (manejo manual, §7) revierte.

### 5.3 Handler del webhook (ejemplo)

```ts
// POST /api/v1/webhooks/mp
router.post('/webhooks/mp', express.json(), async (req, res) => {
  // 1) Verificar firma SIEMPRE. Si falla -> 401 y log de seguridad.
  if (!verifyMpSignature(req)) return res.status(401).end()

  // 2) Solo nos importan notificaciones de payment.
  if (req.body?.type !== 'payment') return res.status(200).end()  // ack y seguir
  const paymentId = String(req.body.data.id)

  // 3) Fuente de verdad = la API de MP, NO el body del webhook.
  const mp = await mpClient.payment.get(paymentId)   // { status, external_reference, transaction_amount, metadata, ... }

  // 4) Correlacionar por external_reference (nuestro ancla).
  const payment = await db.payment.findUnique({ where: { externalRef: mp.external_reference } })
  if (!payment) return res.status(200).end()  // ack para que MP no reintente; loguear huérfano para reconciliación

  // 5) Idempotencia + transición monótona, todo en UNA transacción.
  await db.$transaction(async (tx) => {
    if (payment.status === 'approved') return        // ya procesado -> no-op
    if (mp.status !== 'approved') {                  // rejected / cancelled -> Payment.status = rejected
      await tx.payment.update({ where: { id: payment.id },
        data: { status: mapMpStatus(mp.status), mpPaymentId: paymentId, raw: mp } })   // 'cancelled' -> 'rejected'
      await applyBusinessTransition(tx, payment, 'rejected')   // ej: order -> cancelada
      return
    }
    // approved
    await tx.payment.update({ where: { id: payment.id },
      data: { status: 'approved', mpPaymentId: paymentId, approvedAt: new Date(), raw: mp } })
    await applyBusinessTransition(tx, payment, 'approved')     // dispara el efecto según kind
  })

  // 6) ACK rápido. MP marca entregado por el 200; tardar = reintentos.
  res.status(200).end()
})

// El efecto de negocio depende del kind — un solo lugar.
// resourceId apunta al recurso correcto según kind; cada recurso mueve SU propio enum de estado.
async function applyBusinessTransition(tx, payment, outcome) {
  if (payment.kind === 'ticket_order') {
    const status = outcome === 'approved' ? 'confirmada' : 'cancelada'   // OrderStatus
    await tx.ticketOrder.update({ where: { id: payment.resourceId }, data: { status } })
    if (outcome === 'approved') {
      await issueTicketAndQr(tx, payment.resourceId)          // emite Ticket + accreditationToken (§6, doc 13)
      await emitAnalytics(tx, 'ticket_order_confirmed', { orderId: payment.resourceId, deviceId: payment.deviceId })
    }
  }
  if (payment.kind === 'membership' && outcome === 'approved') {
    // resourceId = Membership.id (PK propia); el device sale del payment
    await tx.membership.update({ where: { id: payment.resourceId },
      data: { tier: 'socio', since: new Date(), paid: payment.amount / 100 } })
    await emitAnalytics(tx, 'membership_purchased', { deviceId: payment.deviceId, total: payment.amount / 100 })
  }
  if (payment.kind === 'ad_campaign' && outcome === 'approved') {
    const c = await tx.adCampaign.findUnique({ where: { id: payment.resourceId } })
    const now = new Date()
    await tx.adCampaign.update({ where: { id: c!.id },
      // CampaignStatus = activa + ventana de vigencia (canon 8)
      data: { status: 'activa', startsAt: now, expiresAt: new Date(now.getTime() + c!.hours * 3600_000) } })
  }
}
```

> **Por qué consultar a MP en vez de creer el body:** el body del webhook es solo un "ping" con un id. El `status` real, el monto y el `external_reference` se leen de `GET /v1/payments/:id`. Esto cierra el vector de webhook falsificado aun si la firma se filtrara, y es lo que recomienda MP.

---

## 6. Qué pasa con el QR actual

Hoy el "QR de Mercado Pago" del mock es estático y decorativo. Hay que separar **dos QR distintos** que la demo confunde:

1. **QR de pago.** Lo provee MP dentro de Checkout Pro (o el Brick). **No lo generamos nosotros.** Con Checkout Pro el usuario ni ve un QR salvo que elija pagar con dinero en cuenta MP; el flujo normal es el `init_point`. El QR estático del mock se elimina.

2. **QR de acreditación (entrada/puerta).** Este sí es nuestro y es el entregable de valor. El QR encapsula un `accreditationToken` = **JWT firmado con `ACCREDITATION_TOKEN_SECRET`** (payload: `deviceId`, `ticketId`, `jornada`; `exp` = fin del evento), y el **estado de uso** vive en una fila `Ticket { id, deviceId, orderId? (null si entrada gratis), jornada, qrToken (jti del JWT), checkedIn, checkedInAt }` para poder validar "un solo uso por jornada" server-side. La PWA muestra el QR; la puerta lo escanea con `POST /api/v1/admin/checkin` (rol `STAFF`). El detalle de validación en puerta (online vs. offline) y del modelo `Ticket`/JWT es **canon del doc 13 (acreditación-en-puerta)** — acá solo importa **quién emite el `Ticket` + token**.

   **Dos disparadores de emisión (canon 12):**
   - **(a) Entrada GRATIS** — una `Registration` **confirmada** emite `Ticket` + `accreditationToken` **sin pago** (`orderId = null`). Este camino no pasa por MP ni por este doc; lo dispara la confirmación de la registración.
   - **(b) Entrada VIP PAGA** — el **webhook MP `approved`** sobre el `TicketOrder` emite `Ticket` + `accreditationToken` (`issueTicketAndQr`, §5.3). Antes de que el webhook confirme el pago **no hay QR de entrada válido**.

   Ambos caminos terminan en `Ticket` + JWT idénticos en forma; solo cambia el disparador y si `orderId` está seteado.

---

## 7. Reconciliación y casos de borde

El webhook es confiable pero no infalible (caídas, timeouts, eventos perdidos). Sin un segundo carril, una orden puede quedar `redirigida_mp` para siempre aunque el usuario pagó. Tres mecanismos:

- **A. Polling de respaldo (back_urls + reconsulta).** Cuando el front vuelve por `back_urls.success?ref=ord_abc`, llama a `GET /orders` / `GET /orders/:id`. Si el server todavía lo ve `redirigida_mp`, hace una **reconsulta on-demand** a MP por `external_reference` (`GET /v1/payments/search?external_reference=ord_abc`) y, si está `approved`, aplica la misma transición que el webhook (reusa `applyBusinessTransition`). Así la confirmación no depende 100% de que el webhook haya llegado.
- **B. Cron de reconciliación (Railway cron).** Cada N minutos, barre `Payment(status: pending)` con más de X minutos de antigüedad y consulta su estado en MP. Aplica transiciones pendientes y marca como `cancelled` los que MP reporta vencidos/rechazados. También expira preferencias `pending` viejas (limpieza). 🔶 **[DECISIÓN ABIERTA]** Frecuencia y ventana del cron.
- **C. Refunds / contracargos.** MP manda webhook `payment.status: refunded` o `charged_back` → `Payment.status = refunded`. Para **entradas**: invalidar el `Ticket` / `accreditationToken` (anular el QR de acreditación, detalle en doc 13) y pasar la orden a `cancelada`. Para **membresía**: degradar a `free`. Para **self-serve**: bajar la campaña (`status = rechazada`/expirada según corresponda). Esto es **reversión manual-asistida**: el server aplica el estado pero conviene alertar al admin (es plata que vuelve).

### Observabilidad / alertas

Dos señales que conviene alertar (Slack/email al admin) porque suelen indicar que el webhook no llegó o quedó algo colgado:

- **Órdenes/pagos estancados.** `TicketOrder` en `redirigida_mp` o `Payment` en `pending` con más de **X minutos** de antigüedad (mismo barrido del cron B). Es el síntoma clásico de "el usuario pagó pero el webhook no llegó / no correlacionó". El cron resuelve la mayoría reconsultando MP; alertar sobre los que siguen sin cerrar tras la reconsulta. 🔶 **[DECISIÓN ABIERTA]** umbral X de minutos.
- **Pagos huérfanos.** `Payment` aprobado (o webhook recibido) cuyo `external_reference` no matchea ningún recurso (`(kind, resourceId)` sin fila destino), o `Payment` sin `resourceId` resoluble. Hoy se loguea y se `ack`-ea (§5.3 paso 4); además hay que **alertar** porque es plata cobrada sin recurso asociado y requiere reconciliación manual.

- 🔶 **[DECISIÓN ABIERTA] Una cuenta MP o varias.** Si entradas y self-serve liquidan a cuentas distintas, hay **dos `MP_ACCESS_TOKEN` / dos `MP_WEBHOOK_SECRET`**, y el `notification_url` (o el `metadata.kind`) tiene que rutear a la verificación correcta. El diseño de `Payment.kind` ya lo soporta; solo cambia de qué secret se valida la firma.

---

## 8. Sandbox vs. producción

- **Credenciales por entorno.** MP da credenciales de **test** y de **prod** separadas. Nada de mezclarlas.
  ```bash
  # Railway env vars
  MP_ENV=sandbox                      # sandbox | prod  -> elige init_point vs sandbox_init_point
  MP_ACCESS_TOKEN=APP_USR-...         # token del entorno activo (test o prod)
  MP_PUBLIC_KEY=APP_USR-...           # solo si se usa Payment Brick (front)
  MP_WEBHOOK_SECRET=...               # secret de firma del webhook (por entorno)
  ```
- **Usuarios de prueba.** En sandbox se prueba con **usuarios de test** (comprador y vendedor) creados en el panel de MP y **tarjetas de prueba** (APRO = aprueba, OTHE = rechaza, etc.). El comprador debe ser un usuario de test distinto del vendedor de test, o MP rechaza con "no podés pagarte a vos mismo".
- **Webhook en local.** `notification_url` necesita ser HTTPS pública. En desarrollo se expone el puerto local con un túnel (ngrok / cloudflared) y se carga esa URL en el panel de MP, o se simula el webhook con un `POST` manual + firma de prueba.
- **Checklist de pasaje a prod.** (1) `MP_ENV=prod` y tokens de prod, (2) `notification_url` apuntando al host real de Railway (no al túnel), (3) `back_urls` al GH Pages real con base `/ccm-app/`, (4) `MP_WEBHOOK_SECRET` de prod cargado y firma validada con un pago real chico de control, (5) precios reales fijados por admin (`PATCH /admin/plans/:id`), (6) un pago de punta a punta en prod por cada uno de los 3 flujos antes de abrir ventas.

🔶 **[DECISIÓN ABIERTA]** Cuenta MP de prod (titularidad/fiscal — ver §0) habilitada y verificada por Gastón/Alan, con la cuenta bancaria de liquidación cargada. Es prerrequisito para el paso (1) del checklist.

---

## 9. Resumen de qué cambia respecto del mock

| Hoy (`LocalDataStore`) | Real (MP + webhook) |
|---|---|
| `becomeSocio(paid)` marca `tier: 'socio'` en el acto | `POST /me/membership` crea preferencia; socio se activa en webhook approved |
| `createOrder` → `iniciada`, UI llama `setOrderStatus('confirmada')` | `POST /orders` crea `Payment(pending)`; webhook approved confirma |
| `createCampaign` deja la campaña lista | `POST /campaigns` la deja `status: pendiente_pago`; pasa a `activa` (con `startsAt`/`expiresAt`) solo tras webhook approved |
| QR de MP estático/decorativo | QR de pago lo da MP (Checkout); QR de acreditación = `Ticket` + `accreditationToken` (JWT), emitido por Registration gratis confirmada **o** por webhook approved del `TicketOrder` (doc 13) |
| Sin idempotencia | `Idempotency-Key` en el POST + `mpPaymentId @unique` en el webhook |
| Sin reconciliación | back_urls reconsultan + cron de barrido de `pending` |
