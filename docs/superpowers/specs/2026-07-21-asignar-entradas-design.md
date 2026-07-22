# Asignar entradas de cortesía

**Fecha:** 2026-07-21
**Estado:** diseño aprobado, sin implementar

## El problema

Gastón necesita regalar entradas. Lo dijo así en la reunión del 21/07:

> "Lo que yo necesito es entrar a un lugar, poner el mail de Alan y decirle dos entradas, y que
> a él le lleguen dos QR bonificados."

Hoy no hay forma. `POST /orders` exige un dispositivo (`requireDevice`), así que una orden sólo
puede nacer desde el teléfono de quien compra: **no existe ninguna ruta por la que el organizador
cree una entrada para otra persona**. La ficha del CRM (`UsuarioFicha.tsx`) es cien por ciento de
lectura, sin un solo botón.

El caso real no es un capricho: los invitados de Gastón son prensa, sponsors y contactos suyos, y
casi ninguno abrió nunca la app. Regalar entradas es también la herramienta de conversión — cada
cortesía es una excusa para que alguien se registre, que es el objetivo de negocio que él declaró
("juntar por lo menos cinco mil registros con datos validados").

## Alcance

Este spec cubre **sólo la asignación**. Se decidió dividir el pedido original en tres proyectos
independientes, de lo general a lo particular:

| | Proyecto | Estado |
|---|---|---|
| **A** | Asignar entradas + email de aviso | **este spec** |
| **B** | Editor visual de emails | pendiente, se monta encima de A |
| **C** | Workshops vendibles | pendiente, se enchufa en el selector de A |

Fuera de alcance acá: el editor de emails (A usa plantillas de diseño fijo), los workshops (el
selector los va a listar cuando existan) y la acreditación verificable en puerta.

## Decisiones tomadas

Cada una responde a una pregunta que se hizo explícitamente durante el diseño.

1. **Se le puede asignar a cualquier email**, esté registrado o no. Si ya está registrado recibe
   un email; si no, recibe **otro distinto** que lo empuja a entrar a la app. La cortesía es el
   anzuelo del registro.
2. **Se asigna un plan de entrada o un evento** (y workshops cuando existan). Son dos caminos
   distintos y hay que no confundirlos: un **plan** (Combo VIP, Night VIP) tiene precio y produce
   una `TicketOrder`; un **evento** hoy es acceso gratuito con inscripción previa, así que asignarlo
   es crear la `Registration` directamente, sin orden — no hay nada que bonificar. En la interfaz se
   ven juntos, pero regalar una VIP y anotar a alguien a la Expo no son la misma operación.
3. **N entradas = un pase que vale por N personas**, no N códigos separados. Es como funcionan las
   cortesías de teatro —el mundo del que viene Gastón— y no choca con el modelo actual, que sólo
   admite una inscripción por persona y evento (`Registration.@@unique([deviceId, eventId,
   blockId])`). La cantidad vive en `TicketOrder.qty`, que ya existe.
4. **En la puerta hay lista de nombres, no escaneo.** El QR sigue siendo el de hoy. Esto es lo que
   permite que A sea barato: no hay que resucitar la acreditación verificable.
5. **El reclamo es por token en el link del email, con reconciliación por email como red.**
6. **Sólo OWNER puede asignar.**

### Sobre la decisión 5

Se eligió a sabiendas de su riesgo, y el diseño lo compensa. La reconciliación por email implica
que quien conozca el email de un invitado puede escribirlo en su perfil y quedarse con la entrada,
porque no hay login ni verificación de email en la app. No es hipotético: el email es justo el dato
más fácil de averiguar de un periodista o un sponsor.

Como no se puede cerrar el agujero sin login, se lo hace **visible y reversible**: cada reclamo
guarda cómo entró (token o email), desde qué dispositivo y cuándo, y toda asignación se puede
revocar. El riesgo queda, pero deja de ser silencioso.

## Arquitectura

### Por qué hace falta una entidad nueva

El primer diseño reusaba `TicketOrder` para todo: una cortesía sería «una orden confirmada de $0».
Funciona para los planes de entrada, pero **se rompe para los eventos y los workshops**: si se
asigna un evento a alguien que todavía no tiene la app, no hay orden donde guardar el token de
reclamo, porque el acceso a un evento no produce órdenes sino inscripciones.

La invitación es un concepto propio: existe **antes** de que exista el dispositivo de la persona, y
sobrevive sin dueño hasta que alguien la reclama. Meterla dentro de `TicketOrder` obligaría a crear
órdenes fantasma para eventos gratuitos y a repetir el mismo problema en el proyecto C.

### `TicketGrant`

Una fila por invitación:

- `kind` + `resourceId` — qué se regaló: `plan` | `event` (y `workshop` en el proyecto C). Es la
  misma forma polimórfica que ya usa `PaymentItem`, así que no introduce un patrón nuevo.
- `email`, `qty`, `message` — a quién, para cuántas personas, con qué mensaje.
- `grantedById`, `createdAt` — quién la regaló y cuándo.
- `claimToken` (único) + `claimedAt` + `claimedVia` (`token` | `email`) + `claimedByDeviceId`.
- `revokedAt` + `revokedReason`.
- `notifiedAt` + `notifyError` — el resultado del envío del email.

### Al asignar

1. Crear el `TicketGrant`.
2. Si la persona **ya tiene dispositivo**, materializarlo en el acto (ver abajo) y marcarlo
   reclamado con `claimedVia: token`.
3. Fuera de la transacción, best-effort: mandar el email y guardar `notifiedAt` / `notifyError`. Es
   el patrón que ya usa el aviso de postulaciones (`applicationService.ts:145-158`) y existe por una
   razón: **un problema de correo no puede deshacer una entrada ya regalada**.

### Materializar (al asignar con dispositivo, o al reclamar el link)

Según lo que se haya regalado:

- **Plan de entrada** → `TicketOrder` con `status: confirmada`, `total: 0`, `qty`, `buyerEmail`,
  `grantedById`, más la `Registration` del evento.
- **Evento** → sólo la `Registration`.

La `Registration` es lo que hace aparecer la acreditación: `MiQR.tsx:39` exige una `Registration`
confirmada, no una orden.

Materializar es **idempotente**: si ya existe la orden o la inscripción de ese grant, no se duplica.
Es lo que hace seguro reintentar y lo que evita que dos clicks generen dos regalos.

### Lo que se gana

El camino de lectura no se toca: una vez materializada, la cortesía **es** una `TicketOrder` normal,
así que «Tus entradas VIP» (`MiQR.tsx:118`), la ficha del CRM y el panel de órdenes la muestran sin
cambios. `TicketOrder.deviceId` ya es nullable y `buyerEmail` ya está indexado.

La única columna que se agrega a `TicketOrder` es `grantedById`, para distinguir una cortesía de una
venta (ver Métricas). Todo lo demás —token, estado del reclamo, revocación, resultado del email—
vive en `TicketGrant`, donde corresponde.

### Lo que deliberadamente no se hace

**No se crea un `Payment` de $0.** Hay un índice único parcial `(kind, resourceId) WHERE closedAt
IS NULL` que impide el doble cobro; meter ahí un pago fantasma bloquearía una compra real del mismo
recurso.

### Métricas: el problema que esto introduce

El Dashboard cuenta «Órdenes cobradas» e «Ingresos» sobre las órdenes confirmadas. Si una cortesía
es una orden confirmada, **Gastón vería sus regalos contados como ventas**.

Por eso `grantedById` no es decorativo: las métricas de dinero tienen que excluir las cortesías
(`grantedById: null`) y mostrarlas aparte como «entradas regaladas». Va con test de regresión.

### Cómo le llega a la persona

| Situación | Qué pasa |
|---|---|
| Ya registrada | El grant se materializa en el acto. La ve al instante, sin hacer nada. |
| No registrada | El grant queda sin reclamar. El link del email lo materializa en su dispositivo. |
| Perdió el mail, se registra con ese email | Lo encuentra la reconciliación. Queda `claimedVia: email`. |

La reconciliación se engancha donde ya se atan las identidades: `deviceService.ts:46` llama a
`linkPerson()` cuando alguien escribe su email. Ahí mismo se buscan los `TicketGrant` sin reclamar
con ese email y se materializan contra ese dispositivo.

## Panel del organizador

**Botón «Asignar entrada»** en la ficha de la persona (`UsuarioFicha.tsx`), junto a «Entradas y
pagos». Es donde Gastón ya está mirando a quién le quiere regalar.

**Botón «Asignar a un email»** en la lista de Usuarios, para quien no está en el CRM. Abre el mismo
formulario pidiendo el email primero.

El formulario (panel lateral, como los que ya usa el admin):

- **Qué** — selector de planes y eventos.
- **Cuántas personas** — el número del pase, por defecto 1.
- **Mensaje para esta persona** — opcional. Se inserta en el email sin tocar la plantilla.
- **Vista previa** del email con el mensaje ya puesto.

Al confirmar, resumen explícito: «Vas a regalar 3 pases al Combo VIP (valor $150.000) a
ana@ejemplo.com». Regalar $150.000 no puede ser un click distraído.

**Revocar** en cada entrada asignada, con motivo. Es la contrapartida del email mal tipeado y la red
de seguridad de la decisión 5.

**Permisos:** un permiso nuevo `orders:grant`, sólo OWNER, aplicado con `requirePermission` como
todas las rutas admin. (Nota: hoy hay una inconsistencia previa —leer órdenes pide `orders:read`
pero mutarlas pide `sponsors:write`, `admin.ts:145` vs `:155`— que este spec no arregla pero
tampoco imita.)

## El email

Dos plantillas:

- **Ya registrada** — «Te regalaron una entrada». El botón abre la app en su entrada.
- **No registrada** — «Te invitaron al CCM». El botón es el link con el token y el texto empuja a
  entrar a la app para activarla.

Se arman con las primitivas que ya existen en `server/src/mail/templates.ts` (`shell`, `h1`, `p`,
`button`, `esc`). El email de invitación al equipo (`accessGrantedEmail`, `templates.ts:113`) es el
molde: ya tiene botón con link de respaldo y versión texto paralela.

Si el envío falla, la entrada queda asignada igual: se guarda el error y la ficha muestra «no se
pudo avisar» con un botón **Reenviar**.

### Bloqueante operativo

**Hoy en producción no hay `RESEND_API_KEY` ni SMTP configurados.** El mailer cae a `ConsoleMailer`,
devuelve `{ delivered: false }` y **no falla** (`mailer.ts:82-101`). Sin eso configurado en Railway
ningún email sale — ni estos, ni el código OTP para entrar al panel. Hay que resolverlo antes de que
esta feature sirva de algo.

## Casos límite

- **Email mal tipeado** → la entrada queda sin reclamar. Se revoca y se reasigna.
- **El mismo link abierto por dos personas** → gana el primero, con bloqueo en la transacción; el
  segundo ve «esta invitación ya fue activada», no un error críptico.
- **Token de una entrada revocada** → «esta invitación ya no está disponible».
- **Doble click en Asignar** → no puede generar dos regalos.
- **Asignar algo que la persona ya tiene** → se avisa antes; no se bloquea, puede ser legítimo.
- **Token abierto en un dispositivo distinto al habitual** → la entrada se materializa en ese
  dispositivo. Es lo esperado: el que abre el link es el que la persona está usando.
- **Revocar algo que la persona ya reclamó** → hay que cancelar también la orden y la inscripción
  que se generaron. Revocar sólo el grant dejaría la entrada viva en el teléfono de la persona.

## Testing

Todo test se valida **por mutación**: se reintroduce el bug y se confirma que el test se pone en
rojo. Un test que pasa en verde con el bug puesto no prueba nada.

Irrenunciables:

1. **Una cortesía no cuenta como ingreso ni como orden cobrada** en el Dashboard. Es la regresión
   más cara: Gastón mirando plata que no existe.
2. **Sólo OWNER puede asignar**, siguiendo `adminGuards.test.ts`.

Además:

- Asignar un plan a alguien con dispositivo crea la orden confirmada con `total: 0` **y** la
  `Registration`; asignar un evento crea sólo la `Registration`.
- Asignar **no** crea ningún `Payment`.
- Asignar a alguien sin dispositivo deja el grant sin reclamar y **no** crea orden ni inscripción.
- Materializar es idempotente: llamarlo dos veces sobre el mismo grant no duplica nada.
- Canje: token válido materializa contra ese dispositivo; token ya usado falla; token revocado
  falla; dos canjes concurrentes → gana uno solo.
- Reconciliación por email: al escribir el email se materializan los grants pendientes y queda
  `claimedVia: email`.
- Si el mailer falla, el grant persiste y queda `notifyError`.
- Revocar un grant ya materializado también cancela la orden y la inscripción que produjo — si no,
  la persona conserva una entrada que se le quitó.

## Preguntas abiertas para Gastón

Ninguna bloquea la implementación, pero conviene tenerlas:

- ¿Las cortesías tienen tope? (por ejemplo, no más de N pases por persona)
- ¿Quiere ver un listado de «todo lo que regalé» aparte, o le alcanza con verlo en cada ficha?
