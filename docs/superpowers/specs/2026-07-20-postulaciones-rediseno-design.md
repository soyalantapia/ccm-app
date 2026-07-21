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

## Decisiones tomadas

| Tema | Elegido |
|---|---|
| Cuándo sale el mail | Automático al decidir, mostrando el texto y con opción de saltearlo |
| Motivo del rechazo | Nota interna, texto libre, opcional |
| La ficha | Página propia en `/admin/postulaciones/:id` |
| Deshacer | Ventana de 8 s; el mail sale recién al cerrarse |

La ventana de gracia resuelve la tensión de raíz: como el envío ocurre **después**, deshacer no tiene que desmentir ningún correo ya leído.

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

## Errores

| Situación | Qué pasa |
|---|---|
| Falla el guardado | La decisión no se aplica y se avisa con el mensaje del backend |
| Falla el mail | La decisión queda firme; se guarda `notifyError` y se ofrece reintentar |
| Sin email en la convocatoria | Se decide igual; la ficha explica por qué no se avisó |
| Se aprieta "Deshacer" | Vuelve a `preinscripta`, se limpian nota y decisor, y **no sale ningún mail** |
| Sin permiso `applications:decide` | Los botones no se muestran (el backend ya lo rechaza) |

## Testing

En el servidor, con Prisma mockeado y el `devOutbox` del mailer:

1. Aceptar guarda `status`, `decidedAt` y `decidedBy`.
2. Rechazar sin nota funciona: `decisionNote` es opcional.
3. **`decisionNote` no aparece en el cuerpo ni en el asunto del mail de rechazo.**
4. Si el mailer tira error, la decisión igual queda guardada y `notifyError` se completa.
5. Sin email en `data`, no se intenta enviar y la decisión se guarda.
6. `fromSeed: true` no entra en la cola de pendientes.

En el front: que "Deshacer" dentro de la ventana no dispare envío, y que la ficha muestre los tres estados de notificación (enviado, falló, no había email).

## Fuera de alcance

WhatsApp (otro canal, otro proveedor, su propio spec) y el score de IA — se borra la promesa en vez de arrastrarla. Tampoco entran acciones en lote ni exportación: si aparecen, son otro spec.
