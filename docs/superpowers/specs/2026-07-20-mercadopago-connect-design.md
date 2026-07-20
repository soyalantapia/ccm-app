# Cobrar con Mercado Pago: conectar la cuenta y cobrar de verdad

**Fecha:** 2026-07-20
**Estado:** aprobado, listo para plan de implementación

## El problema

CCM no cobra. Simula cobrar.

Hoy el organizador pega **a mano un link de pago de Mercado Pago** en cada plan de entrada (`TicketPlan.mpLink`). Cuando alguien compra, `TicketSelector` crea la orden en la base y abre ese link en una pestaña nueva:

```ts
const mpLink = selected.find((p) => p.mpLink)?.mpLink ?? 'https://www.mercadopago.com.ar'
window.open(pending.mpLink, '_blank', 'noopener')
```

Eso rompe de cuatro maneras.

**El link no sabe cuánto cobrar.** Es una URL fija por plan. Si alguien compra 3 entradas, el link cobra lo que sea que el organizador haya configurado ese día en su panel de MP — no el total de esa compra. Y si el carrito mezcla dos planes, se usa **el link del primero que tenga uno**; el segundo plan no se cobra nunca.

**Nada vuelve.** Después de pagar, MP no le avisa a CCM. La orden queda en `iniciada` o `redirigida_mp` para siempre hasta que el organizador la marca a mano mirando su cuenta de MP. Es conciliación manual, con los errores que eso implica.

**El fallback silencioso es peor que el error.** Si ningún plan tiene link, se abre `https://www.mercadopago.com.ar` — la home. El comprador aterriza en Mercado Pago sin nada que pagar, y desde CCM la compra figura como iniciada.

**Dos de los tres cobros toman el precio del navegador.** `becomeSocio(deviceId, paid)` recibe cuánto pagó el cliente como parámetro del request, y el total de publicidad se calcula en el front con `priceFor(slot, hours)` (`src/features/publicidad/adPricing.ts`). El precio de Socio es una constante del front (`SOCIO_PRICE = 9900` en `src/features/membresia/plans.ts`) que el server nunca ve. Es el mismo agujero que ya se cerró en las órdenes de entrada, donde el server calcula el total con el precio vigente: alguien podía hacerse Socio declarando `paid: 0`.

## Lo que ya está construido

No se parte de cero. El esquema tiene la plomería:

- **`Payment`** con `kind` (`ticket_order` | `membership` | `ad_campaign`), `mpPreferenceId`, `mpPaymentId` **con `@unique`** (idempotencia del webhook), `status`, `amount` y `raw` para la respuesta cruda. La tabla existe y está vacía: nunca tuvo servicio ni rutas.
- **`TicketOrder`** y **`AdCampaign`** ya persisten en la base, con sus endpoints (`/orders`, `/campaigns`, `/admin/orders`).
- **`MP_ACCESS_TOKEN`** y **`MP_WEBHOOK_SECRET`** ya declaradas en `env.ts`, sin consumir.

Falta: la conexión con la cuenta, la creación del cobro y el aviso de pago.

## Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| ¿Quién cobra? | **Una sola cuenta: la de CCM** | No es un marketplace. Sin comisión de plataforma, sin credenciales por organizador, una sola fila de conexión. |
| ¿Qué se cobra? | **Entradas, membresía Socio y publicidad** | Los tres `kind` que la tabla `Payment` ya contempla. |
| ¿Cómo se conecta? | **OAuth (Mercado Pago Connect)** | El organizador vincula su cuenta desde una pantalla de permisos, sin pasar claves secretas por mensajería. Da conectar y desconectar reales. |
| ¿Cómo paga el usuario? | **Checkout Pro** | MP hospeda el pago: todos los medios (tarjeta, dinero en cuenta, efectivo por Rapipago) sin trabajo extra y sin que CCM toque datos de tarjeta. |
| ¿Si no hay conexión? | **Vuelve al link manual** | La venta nunca se corta y el mecanismo actual queda como red de seguridad documentada, no como código muerto. |

### Sobre usar OAuth para una cuenta propia

El flujo OAuth de Mercado Pago está diseñado para **marketplaces** que cobran en cuentas de terceros. Para una única cuenta propia, la recomendación estándar de MP es usar directamente el Access Token de la aplicación.

Se eligió OAuth igual, a conciencia: da la experiencia de conectar/desconectar que se pidió, evita que el organizador manipule un secreto de larga vida, y deja el camino abierto si CCM se vuelve multi-ciudad. El costo es el trabajo extra del intercambio de código y la renovación de tokens. Si en la implementación aparece un bloqueo (por ejemplo, que MP no habilite la app para OAuth), el plan B es la pantalla de configuración con Access Token pegado; el resto del diseño (cobro, webhook, activación) **no cambia**.

## Prerrequisito: crear la aplicación en Mercado Pago

Sin esto no hay pantalla de permisos. Lo hace el dueño de la cuenta de CCM, una vez:

1. Entrar a <https://www.mercadopago.com.ar/developers> con la cuenta de CCM y crear una aplicación.
2. Elegir el modelo de integración **Checkout Pro** y marcar que se usará **OAuth**.
3. Cargar la **URL de redirección** (redirect URI). Debe coincidir exactamente con la que use el servidor:
   - producción: `https://ccm-api-production-91a9.up.railway.app/api/v1/mp/callback`
   - pruebas: la misma URL del entorno donde se pruebe (ver "Probar sin plata real").
4. Copiar **Client ID** y **Client Secret** → van a Railway como `MP_CLIENT_ID` y `MP_CLIENT_SECRET`.
5. En la sección de webhooks, configurar la notificación de `payment` apuntando a `/api/v1/mp/webhook`, y copiar la **clave secreta** → `MP_WEBHOOK_SECRET`.

## Arquitectura

Cuatro piezas nuevas, cada una con una responsabilidad y testeable por separado.

### `mpOAuthService` — la conexión

Lo único que sabe de tokens. Todos los demás le piden un token válido y no se enteran de si hubo que renovarlo.

- `buildAuthUrl()` — arma la URL de autorización con un `state` aleatorio de un solo uso, guardado con vencimiento corto para verificar la vuelta (anti-CSRF).
- `exchangeCode(code, state)` — valida el `state`, canjea el código por tokens contra MP y guarda la conexión.
- `getValidToken()` — devuelve un access token utilizable; si está por vencer, lo renueva con el refresh token antes de devolverlo. **Es la única puerta**: ningún otro módulo lee la tabla de conexión.
- `disconnect()` — borra la fila.
- `getStatus()` — `{ conectado, cuenta, desde, vence }`. **Nunca devuelve tokens.**

### `mpCheckoutService` — el cobro

- `createPreference(kind, resourceId, deviceId)` — busca el recurso, **calcula el monto desde la base**, crea el `Payment` en `pending`, pide la preferencia a MP y devuelve el link de pago.
- Cada preferencia lleva `external_reference = payment.id`, que es lo que después permite reconciliar sin ambigüedad.
- Incluye `back_urls` (vuelta a CCM) y `notification_url` (el webhook).

### `mpWebhookService` — el aviso

- Verifica la firma del aviso (`x-signature` + `x-request-id` + `MP_WEBHOOK_SECRET`). Sin esto, cualquiera podría avisar "esto se pagó" y llevarse entradas gratis.
- **No le cree al cuerpo del mensaje**: consulta a MP el estado real de ese pago.
- Es idempotente por `Payment.mpPaymentId` (`@unique`): MP reintenta, y el mismo pago no se procesa dos veces.
- Con el pago aprobado, activa el recurso según su `kind`.

### `MpConnection` — la tabla

Una sola fila (id fijo `default`), migración aditiva:

```prisma
model MpConnection {
  id           String   @id @default("default")
  mpUserId     String   // la cuenta de MP a la que se cobra
  accessToken  String
  refreshToken String
  publicKey    String?
  expiresAt    DateTime // vencimiento del access token
  scope        String?
  connectedAt  DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Los tokens no se exponen por ninguna ruta. Quedan en texto plano en la base: es el mismo nivel de protección que ya tienen `ADMIN_TOKEN` y las credenciales de Postgres en el entorno de Railway, y cifrarlos exigiría gestionar una clave maestra que viviría en el mismo lugar. Se documenta como decisión consciente, no como olvido.

## Endpoints

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| GET | `/admin/mp/status` | admin | Estado de la conexión, sin tokens |
| POST | `/admin/mp/connect` | admin | Devuelve la URL de autorización de MP |
| GET | `/mp/callback` | pública | Vuelta de MP con el código; canjea y redirige al panel |
| POST | `/admin/mp/disconnect` | admin | Borra la conexión |
| POST | `/admin/mp/test-charge` | admin | Cobro de prueba de $1 para verificar la conexión |
| POST | `/payments/preference` | device | `{ kind, resourceId }` → link de pago |
| POST | `/mp/webhook` | firma MP | Recibe el aviso de pago |

`/mp/callback` es pública porque la invoca el navegador volviendo de MP, no el panel: la seguridad la da el `state` de un solo uso, no un token de admin.

## Flujos

### Conectar

El organizador toca "Conectar con Mercado Pago" → el servidor arma la URL con un `state` de un solo uso → MP muestra la pantalla de permisos → al aceptar, MP redirige a `/mp/callback` → el servidor valida el `state`, canjea el código por tokens, guarda la conexión y redirige al panel con el estado conectado.

### Renovar

El access token de MP dura unos meses. `getValidToken()` lo renueva solo cuando está por vencer. Si la renovación falla, la conexión se marca como caída: el panel avisa que hay que reconectar y las compras vuelven al link manual.

### Desconectar

Borra la fila; CCM deja de poder cobrar al instante.

**Honestidad obligatoria en la UI:** MP no expone una forma de que la aplicación revoque su propia autorización. El diálogo debe decir que la autorización sigue figurando en la cuenta del organizador hasta que la quite desde las aplicaciones autorizadas de MP, con el link a esa pantalla. No decir "revocado".

### Cobrar

El navegador **no manda el precio**: pide `POST /payments/preference { kind, resourceId }`. El servidor calcula el monto desde la base según el tipo:

| Tipo | De dónde sale el monto | Qué hay que arreglar antes |
|---|---|---|
| `ticket_order` | `TicketOrder.total`, ya congelado por el server al crear la orden | Nada |
| `membership` | `SOCIO_PRICE` | Hoy es una constante del front que el server no ve. Sacar `paid` del request de `becomeSocio` y tomarlo del módulo compartido |
| `ad_campaign` | `priceFor(slot, hours)` | Hoy corre en el navegador. El server debe recalcularlo e **ignorar el `total` que mande el cliente** |

**Cómo se comparte el precio.** No hacen falta tablas nuevas: el repo ya tiene el patrón de un módulo compartido que el server importa por ruta relativa (`src/lib/htmlPolicy.ts`, con el Dockerfile copiando `/app/src`). `SOCIO_PRICE` y `adPricing.ts` se mueven a esa misma forma, de modo que front y server lean **la misma constante** y no haya dos fuentes de verdad que puedan divergir. Es más liviano que una tabla de configuración y mantiene el precio versionado en git.

### Recibir el pago

MP avisa → se verifica la firma → se consulta el pago real → si está aprobado, se activa:

| Tipo | Activación |
|---|---|
| `ticket_order` | La orden pasa a `confirmada` |
| `membership` | El device pasa a `tier: socio` con el monto real pagado |
| `ad_campaign` | La campaña pasa a `activa`, con `startsAt = ahora` y `expiresAt = ahora + hours` |

El webhook responde 200 rápido siempre (MP reintenta si no). **La confirmación manual desde el panel se mantiene** como red para casos raros (transferencia, efectivo en puerta, un aviso que nunca llegó).

### Pago pendiente en efectivo

Importa en Argentina: si pagan por Rapipago o PagoFácil, MP devuelve `pending` hasta que la persona va al local. La orden muestra "esperando pago", **no** confirmada, y se confirma sola cuando MP avisa la acreditación. Este es el caso que más se rompe si se asume que "volvió del checkout" equivale a "pagó".

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| Sin conexión MP | `POST /payments/preference` responde 503; el front cae al link manual, sin cortar la venta |
| Falla la creación de la preferencia | Se avisa al comprador y **no queda una orden fantasma** figurando como iniciada |
| Firma del webhook inválida | 401 y no se procesa. Se registra: es señal de que alguien está probando |
| Webhook repetido | Idempotente por `mpPaymentId`; el segundo aviso no cambia nada |
| Pago rechazado | El `Payment` queda `rejected`; la orden sigue sin confirmar y el usuario puede reintentar |
| Renovación de token fallida | La conexión se marca caída, el panel avisa y se cae al link manual |
| El recurso ya estaba activado | No se re-activa ni se duplica nada |

## Probar sin plata real

MP permite crear **usuarios de prueba**: un vendedor y un comprador ficticios, con tarjetas de prueba. Se conecta el vendedor de prueba y se compra con el comprador de prueba: el circuito completo, sin mover un peso.

Una restricción concreta: **el webhook necesita una URL pública**, así que en `localhost` no llega solo. Dos caminos, ambos válidos:
- probar contra el deploy de Railway con credenciales de prueba, o
- levantar un túnel público hacia el puerto local y usar esa URL como `notification_url`.

Lo que **sí** se puede probar enteramente en local, sin MP: la creación de la preferencia (con la llamada a MP simulada), el cálculo de montos desde la base, la verificación de firma del webhook, la idempotencia y la activación de cada tipo de recurso.

## Testing

La suite del repo es `npm test` (vitest, 40 tests). Se suma:

- **Montos desde la base**: para cada tipo, el monto de la preferencia sale del server y **ignora cualquier precio que mande el cliente**. Es el test que blinda el agujero de `becomeSocio(paid)`.
- **Firma del webhook**: un aviso con firma inválida no activa nada.
- **Idempotencia**: el mismo `mpPaymentId` procesado dos veces deja un solo efecto.
- **Activación por tipo**: aprobado → orden confirmada / socio / campaña al aire con su ventana.
- **Pendiente ≠ aprobado**: un pago `pending` no confirma la orden.
- **Degradación**: sin conexión, `preference` responde 503 y el front usa el link manual.
- **`getStatus()` no filtra tokens**: la respuesta no contiene el access ni el refresh token.

## Alcance

**Incluye:** conexión OAuth (conectar, renovar, desconectar, estado), cobro de los tres tipos con monto calculado en el server, webhook verificado e idempotente, activación automática, pantalla de Cobros en el panel, degradación al link manual, y el traslado al server de los precios de membresía y publicidad.

**No incluye:** Checkout Bricks (formulario embebido) — queda como mejora posterior sobre esta misma base, cambiando solo la capa de checkout. Tampoco incluye reembolsos ni pagos parciales.
