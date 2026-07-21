# Postulaciones del admin: decidir, avisar y dejar rastro

**Fecha:** 2026-07-20
**Estado:** aprobado, listo para plan de implementación

## El problema

La pantalla de Postulaciones es donde el organizador decide quién entra al evento. Hoy hace tres cosas mal.

**Promete lo que no hace.** Cada card dice *"Al aceptar, en Fase 1 se dispara el mail de invitación + WhatsApp automático"*. El backend hace exactamente esto y nada más:

```ts
await prisma.application.update({ where: { id }, data: { status, decidedAt: new Date() } })
```

El organizador acepta a alguien convencido de que le llegó la invitación. No le llegó nada, y no hay forma de darse cuenta desde la pantalla. Hay dos promesas más en el mismo estado: *"el score IA sugerido llega en Fase 1"* y un encabezado clavado a «Camino a CCM 2026» aunque la lista mezcla todas las convocatorias.

**No deja rastro.** Solo se guardan `status` y `decidedAt`. No queda quién decidió —aunque el sistema ya tiene usuarios con rol— ni por qué. Dentro de tres meses nadie puede justificar un rechazo.

**Hace perder el lugar.** "Ver ficha completa" es un acordeón (`OpsApplicationCard.tsx:83`) que expande la card y empuja las de abajo. Revisar cuarenta postulaciones es expandir, leer, colapsar y no saber dónde estabas.

A eso se suman tres cosas que aparecen con volumen: la lista mezcla convocatorias sin poder filtrar, no hay búsqueda, y las 24 postulaciones `fromSeed` conviven con las reales en la misma cola.

### Lo que encontró el análisis (41 hallazgos verificados, 0 refutados)

Cinco cambian el diseño y no estaban en la primera versión de este documento.

**El postulante YA ve la decisión, al instante.** Es lo contrario de lo que dice el panel. Apenas se guarda un rechazo, quien abre la convocatoria en su teléfono lee *«Sin cupo — Esta vez no conseguimos lugar»* (`ApplicationStatus.tsx:23-28`) y pierde el CTA de inscripción (`:56`), mientras el admin lee que hasta "Fase 1" no pasa nada. El mail no es el primer aviso: **es el segundo**.

**Y al aceptado se le promete algo que no ocurre.** Lee *«¡Tenés tu lugar confirmado!»* (`ApplicationStatus.tsx:18-22`), pero aceptar sólo escribe `status`: no crea ninguna `Registration`, así que no hay lugar reservado en ningún lado.

**Aceptar una postulación de demo mandaría mail a una dirección inventada.** El seed carga postulaciones `fromSeed: true` con emails de aspecto real (`milagros.soria.disenio@gmail.com`), varias en estado `preinscripta`. Al conectar el envío, decidirlas dispara correos a direcciones que no son de nadie —o peor, de alguien.

**Doble click son dos decisiones, y serían dos mails.** `decideApplication` hace un `update` por id sin condicionar el estado de origen, pese a que su propio docstring dice "Solo desde 'preinscripta'".

**Si el fetch falla, la pantalla muestra postulaciones falsas sin avisar.** `hydrateAdminApplications` se traga el error con `.catch(() => {})` y `getApplications()` cae en cascada al seed — el mismo patrón que ya se corrigió en el Dashboard.

Además, dos cosas de escala: el backend trae `take: 500` **ordenado por `ts: desc`**, así que a partir de la 501 se esconden las más viejas, que son justamente las que llevan más tiempo esperando respuesta.

## Decisiones tomadas

| Tema | Elegido |
|---|---|
| Cuándo sale el mail | Automático al decidir, mostrando el texto y con opción de saltearlo |
| Motivo del rechazo | Nota interna, texto libre, opcional |
| La ficha | Página propia en `/admin/postulaciones/:id` |
| Deshacer | Ventana de 8 s; el mail sale recién al cerrarse |

La ventana de gracia resuelve la tensión de raíz: como el envío ocurre **después**, deshacer no tiene que desmentir ningún correo ya leído.

**Con un matiz que descubrió el análisis:** la ventana protege del mail, no del estado. El postulante ve *«Sin cupo»* en su app desde el segundo cero. Deshacer a los 8 segundos deja todo bien salvo que la persona justo estuviera mirando la pantalla — improbable, pero honesto decirlo. Cerrar también esa ventana exigiría diferir el guardado, y eso es peor: si se cae el navegador en el medio, la decisión se pierde. Se prioriza **no perder decisiones** por sobre un caso de borde de segundos.

## Qué se apoya en lo que ya existe

No hace falta construir infraestructura nueva:

- **Email**: `server/src/mail/mailer.ts` (`getMailer()` con backends smtp/resend/console y un `devOutbox` en memoria para tests) y `server/src/mail/templates.ts` (`EmailMsg`, `otpEmail`, `accessGrantedEmail`). Lo construyó el login por OTP y está andando en producción.
- **Identidad y permisos**: la ruta ya está detrás de `requirePermission('applications:decide')` y `req.admin` trae `{ userId, role }`. Guardar quién decidió es leer un campo que ya viaja.

## Modelo de datos

Cuatro campos nuevos en `Application`. No se agrega una tabla de historial: para lo que se pide alcanza, y se puede sumar después si hace falta la traza completa.

```prisma
decidedBy    String?   // EMAIL del admin que decidió — sin FK, ver abajo
decisionNote String?   @db.Text  // nota INTERNA; nunca viaja al postulante
notifiedAt   DateTime? // cuándo salió el mail
notifyError  String?   // por qué no salió, si falló
```

`decidedBy` guarda el **email**, no el id ni el nombre. Sin FK es deliberado, siguiendo el criterio que ya usa `AdminUser.invitedBy` ("no FK: sobrevive a que esa persona se vaya"): si se da de baja a un usuario, la decisión que tomó no debe desaparecer ni bloquear el borrado. Se elige el email y no el nombre porque `AdminUser.name` es opcional y mutable, mientras que `email` es único y obligatorio — "Aceptada por gaston@…" siempre identifica a alguien, "Aceptada por —" no.

Ojo con un detalle de implementación: `req.admin` trae `{ userId, role, via, sessionId }` pero **no** el email (`middlewares/admin.ts:52`). El servicio tiene que resolverlo con un `adminUser.findUnique({ where: { id: userId }, select: { email: true } })` dentro de la misma transacción que la decisión. Es una query extra por decisión, y es el precio de que el registro sobreviva al borrado del usuario.

## La lista

**Se va:** el badge de estado cuando el tab ya filtra por ese estado (dice dos veces lo mismo), la promesa de WhatsApp, la mención al score de IA y la convocatoria hardcodeada en el lead.

**Entra:** buscador por nombre y email; filtro por convocatoria, visible sólo cuando hay más de una; y las `fromSeed` agrupadas aparte bajo un rótulo de demo, para que no compitan con postulaciones reales.

**Orden:** las pendientes más antiguas primero. Es la que más esperó, y es la que hay que responder.

## La ficha

Ruta `/admin/postulaciones/:id`, compartible con el equipo.

El punto débil de una página propia es perder la lista en cada candidato. Se compensa con tres cosas:

- **↑ / ↓** mueven al anterior y al siguiente sin volver.
- Al decidir, **avanza sola** a la siguiente pendiente.
- **"Volver"** conserva el filtro, la búsqueda y la posición del scroll.

Contenido: la historia primero, en serif grande —es lo que se lee para decidir—; después los datos en dos columnas. Email y teléfono son accionables (copiar / escribir), el portfolio es un link real. Al pie, el registro: *"Aceptada por Gastón el 20/07 · mail enviado 14:32"*.

## Decidir

Al apretar Aceptar o Rechazar se abre un panel corto con:

1. **El mail que se va a mandar**, con su texto real. No una descripción de que se manda un mail.
2. Un campo de **notas internas**, opcional.
3. Un check **"no enviar mail"** para los casos que se manejan a mano.

Al confirmar, la decisión se guarda **al instante** y arranca la ventana de 8 segundos con "Deshacer". Si nadie deshace, sale el mail.

Si la convocatoria no pidió email, el panel lo dice de entrada y no ofrece enviar: la decisión se guarda igual. **No poder avisar nunca bloquea decidir.**

## Los emails

Dos plantillas nuevas en `templates.ts`, con la estructura de las que ya están:

- **Aceptación**: confirma, dice qué convocatoria y cuáles son los próximos pasos.
- **Rechazo**: breve y cordial. **Nunca incluye `decisionNote`** — esa nota es interna.

El envío es best-effort y va **después** de persistir la decisión. Si falla, se guarda `notifyError`, la ficha lo muestra y ofrece reintentar. Que el mail falle no revierte nada: son dos hechos distintos y se muestran por separado.

## Convocatorias sin email

`OpsConvocatoriaForm` deja crear una convocatoria con los campos que el organizador quiera, así que puede publicar una sin pedir email. Cuando eso pasa no hay a quién escribirle.

Se resuelve en dos lugares: un aviso al guardar una convocatoria sin campo de email —advirtiendo que no se van a poder mandar avisos— y, en la ficha, un cartel claro en lugar del panel de envío. Nunca se bloquea la creación ni la decisión.

## Decidir es una transición, no un update

`decideApplication` pasa de escribir a ciegas a exigir el estado de origen:

```ts
const { count } = await prisma.application.updateMany({
  where: { id, status: 'preinscripta' },
  data: { status, decidedAt, decidedBy, decisionNote },
})
if (count === 0) throw conflict('APPLICATION_ALREADY_DECIDED', 'Esta postulación ya fue decidida.')
```

Con eso, el doble click deja de ser dos decisiones —y, cuando haya envío, dos mails—. El `409` se muestra tal cual gracias al `adminWrite` que ahora propaga el mensaje del backend.

Para que "Deshacer" funcione hay que ampliar tres tipos que hoy lo prohíben: `Exclude<ApplicationStatus, 'preinscripta'>` en `DataStore.ts:207`, `LocalDataStore.ts:708` y `RemoteDataStore.ts:940`, más el `z.enum` del PATCH (`routes/admin.ts:193`). Volver a revisión es la única transición que puede partir de un estado decidido.

## Postulaciones de demo

Dos capas, porque el costo de equivocarse es mandarle un mail a un desconocido:

1. **Guard en el servidor**: si `fromSeed`, la decisión se guarda pero **nunca** se envía nada, y se registra por qué.
2. **En la UI**: rótulo "demo" en la card y en la ficha, y el panel de decisión lo aclara antes de confirmar.

## Escala

El backend pasa a paginar con cursor, copiando el patrón que ya existe en `personService.ts:226-266` (`take: limit + 1` + `nextCursor`). Y el orden por defecto cambia a **`ts: asc`**: en una cola de revisión, primero va la que más esperó. Hoy es `desc` con `take: 500`, así que a partir de la 501 se ocultan justamente las más urgentes.

## Errores

| Situación | Qué pasa |
|---|---|
| Falla el guardado | La decisión no se aplica y se avisa con el mensaje del backend |
| Ya estaba decidida (doble click) | `409` y el aviso lo dice; no se manda un segundo mail |
| Falla el mail | La decisión queda firme; se guarda `notifyError` y se ofrece reintentar |
| Sin email en la convocatoria | Se decide igual; la ficha explica por qué no se avisó |
| Es una postulación de demo | Se decide igual; **nunca** se envía correo |
| Se aprieta "Deshacer" | Vuelve a `preinscripta`, se limpian nota y decisor, y **no sale ningún mail** |
| Falla el GET de la lista | Se muestra el error; **nunca** las postulaciones del seed como si fueran reales |
| Sin permiso `applications:decide` | Los botones no se muestran (el backend ya lo rechaza) |

## Testing

En el servidor, con Prisma mockeado y el `devOutbox` del mailer:

1. Aceptar guarda `status`, `decidedAt` y `decidedBy`.
2. Rechazar sin nota funciona: `decisionNote` es opcional.
3. **`decisionNote` no aparece en el cuerpo ni en el asunto del mail de rechazo.**
4. Si el mailer tira error, la decisión igual queda guardada y `notifyError` se completa.
5. Sin email en `data`, no se intenta enviar y la decisión se guarda.
6. Una postulación `fromSeed: true` se decide pero **no** dispara ningún envío.
7. Decidir dos veces la misma postulación devuelve `409` y no manda un segundo mail.
8. La lista pide `ts: asc` y respeta el cursor de paginación.

En el front: que "Deshacer" dentro de la ventana no dispare envío, y que la ficha muestre los tres estados de notificación (enviado, falló, no había email).

## Fuera de alcance

WhatsApp (otro canal, otro proveedor, su propio spec) y el score de IA — se borra la promesa en vez de arrastrarla. Tampoco entran acciones en lote ni exportación: si aparecen, son otro spec.

**Y una que el análisis destapó y merece el suyo:** aceptar le dice al postulante *«¡Tenés tu lugar confirmado!»* pero no crea ninguna `Registration`, así que no hay cupo reservado en ningún lado. Arreglarlo de verdad implica decidir a qué bloque entra el aceptado y respetar el lock de cupo de `registrationService`, que es una discusión de producto entera. Acá sólo se ajusta el texto para que no prometa una reserva que no existe; la reserva real queda para un spec propio.
