# CRM de Usuarios — diseño

**Fecha:** 20 de julio de 2026
**Reemplaza:** la página `/admin/personas`, que hoy muestra un único dispositivo (el del propio admin).

---

## 1. El problema

La página actual se llama "Personas" pero no lista personas: muestra la ficha del dispositivo desde el que se abrió el panel. No hay buscador, no hay lista, y no existe ningún endpoint que permita ver a otra persona que no sea uno mismo. Todo el backend es *device-scoped*: cada dispositivo ve lo suyo.

Lo que hace falta es un CRM: ver a toda la gente que pasó por CCM, buscarla, abrir su ficha completa y operar sobre ella.

### Lo que hay hoy en producción

| Dato | Cantidad |
|---|---|
| Dispositivos | 2 |
| Postulaciones | 25 (24 del seed de demo, **1 real**) |
| Inscripciones, órdenes, pagos, entradas, membresías | **0** |

Prácticamente no hay datos de personas todavía — el evento es el 19 y 20 de septiembre. **Esto es una ventaja para el diseño, no un obstáculo:** cualquier cambio estructural en la base cuesta hoy lo que no va a costar nunca más.

### El dato que rompe el enfoque obvio

Las postulaciones **no tienen dispositivo asociado** (0 de 25) y los datos del postulante —nombre, email, DNI, teléfono, Instagram— viven dentro de un campo JSON de la postulación, no en la ficha del dispositivo.

Si se define "contacto = dispositivo con datos", los postulantes no aparecen y la página nace vacía. La lista tiene que unir **dos fuentes desconectadas**.

---

## 2. Alcance

**Entra:**
- Lista de usuarios con buscador, filtros y orden.
- Ficha completa por persona.
- Exportación a CSV.
- Contacto directo (WhatsApp / email).
- Edición de datos y notas internas.
- Acreditación manual ("marcar presente").

**No entra:**
- Acreditación por escaneo de QR (no existe el flujo; esta spec deja el modelo listo para él).
- Cobros y órdenes reales (bloqueado por Mercado Pago).
- Campañas o envíos masivos.
- Fusión manual de personas desde la UI (la unificación es automática por email/DNI).

---

## 3. Qué es una persona

Una **Persona** es un ancla de identidad, **no una copia de los datos**.

Guarda únicamente las claves con las que se unifica (email, DNI) y sirve de punto de anclaje estable para notas y asistencia. Los datos personales siguen viviendo donde ya están:

- `ProfileField` — con su procedencia (`capturedAt`, `source`): cuándo y en qué acción se capturó cada dato. Eso es lo que la propia página llama "el oro de la base propia" y copiarlo lo destruiría.
- `Application.data` — las respuestas del postulante.

**Regla de unificación:** dos registros son la misma persona si comparten email o DNI (normalizados: minúsculas y sin espacios el email; solo dígitos el DNI). Si no hay con qué cruzar, cada uno es su propia persona.

**Por qué una tabla y no un cálculo al vuelo:** las notas, la acreditación y las correcciones necesitan algo estable de dónde colgar. Si la identidad se calcula en cada consulta, alguien que hoy es "postulación #12" y mañana entra a la app con su email cambia de identidad, y las notas quedan huérfanas.

### Datos de demostración

Las 24 postulaciones del seed **se muestran como usuarios normales** (decisión del usuario: sirven de ejemplo real con la página en uso).

**Salvaguarda única:** las exportaciones las excluyen siempre. Una planilla que llega a un sponsor no puede contener gente inventada.

---

## 4. Cambios en la base

### Tablas nuevas

```
Person
  id         cuid
  email      String? @unique   ← clave de unificación (normalizada)
  dni        String? @unique   ← clave de unificación (solo dígitos)
  createdAt  DateTime
  updatedAt  DateTime

PersonNote
  id         cuid
  personId   → Person (cascade)
  body       Text
  authorId   → AdminUser        ← quién la escribió
  createdAt  DateTime

Attendance
  id         cuid
  personId   → Person (cascade)
  jornada    'sabado' | 'domingo'
  source     'manual' | 'qr'
  by         → AdminUser?       ← quién acreditó (null si fue por QR)
  ts         DateTime
  @@unique([personId, jornada])  ← una acreditación por jornada
```

**Sobre `jornada`:** `Ticket.jornada` existe en el esquema pero es un `String` libre y **nunca se escribió** (hay 0 entradas). Esta spec fija la convención: `'sabado' | 'domingo'`, las dos jornadas del evento — los mismos valores de `PlanDay` sin `combo`, que es una forma de compra, no un día.

### Campos agregados

- `Device.personId` → `Person?`
- `Application.personId` → `Person?`

Ambos opcionales y con `onDelete: SetNull`: borrar una persona nunca borra su actividad.

### Cuándo se crea o se engancha una Persona

1. Al escribirse un `ProfileField` de tipo `email` o `dni` → buscar-o-crear Persona por esa clave y enlazar el dispositivo.
2. Al crearse una `Application` cuyo `data` traiga email o DNI → ídem, enlazar la postulación.
3. Si aparece una segunda clave que ya pertenece a otra Persona (ej.: el email es de la Persona A y el DNI de la B) → se enlaza a la más antigua y se registra el conflicto en el log. **No se fusionan automáticamente**: fusionar es destructivo y sin gente real todavía, no vale el riesgo.

### Migración y backfill

Migración `10_person`. El backfill recorre dispositivos y postulaciones existentes y crea las Personas correspondientes. Con 2 dispositivos y 25 postulaciones corre en milisegundos.

**Es idempotente:** volver a correrlo no duplica personas.

### Sobre la asistencia

`Attendance` es la **única fuente de verdad** de "estuvo presente". `Ticket.checkedIn` sigue siendo el estado de consumo de esa entrada puntual.

Cuando se construya la acreditación por QR, **debe escribir también en `Attendance`** (con `source: 'qr'`). Queda documentado acá porque es la clase de contrato que, si no se escribe, produce dos verdades distintas sobre el mismo hecho.

---

## 5. Endpoints

Todos bajo `/api/v1/admin`, cada uno declarando su permiso (patrón ya establecido en `routes/admin.ts`).

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/people` | `people:read` | Lista paginada. Filtros por texto, estado y fechas. Devuelve además el conteo de anónimos. |
| GET | `/people/puerta` | `people:checkin` | Búsqueda angosta para acreditar: 4 campos, mínimo 3 caracteres, tope 20. Ver §6. |
| GET | `/people/:id` | `people:read` | Ficha completa: datos con su procedencia, consentimientos, inscripciones, postulaciones, entradas, pagos, membresía, asistencia, notas y actividad. |
| PATCH | `/people/:id` | `people:write` | Corrige datos. Escribe en `ProfileField` con `source: 'admin'` — la corrección queda trazada como tal. |
| POST | `/people/:id/notes` | `people:write` | Agrega una nota interna. |
| DELETE | `/people/:id/notes/:noteId` | `people:write` | Borra una nota propia. |
| POST | `/people/:id/attendance` | `people:checkin` | Marca presente en una jornada. Idempotente. |
| DELETE | `/people/:id/attendance/:jornada` | `people:checkin` | Deshace una acreditación (se marcó al equivocado). |
| GET | `/people/export` | `people:export` | CSV. Excluye demo y respeta consentimiento. |

**Búsqueda y agregados se resuelven en SQL, no en memoria.** Paginación por cursor, 50 por página. La lista NO trae la actividad completa de cada persona: eso es solo de la ficha.

---

## 6. Permisos y privacidad

Esta pantalla es la que más PII expone del sistema: DNI, teléfono, email y domicilio de cada persona. Ya hubo un incidente de filtración de datos de postulantes en este proyecto, así que el acceso se define explícitamente.

### Permisos nuevos

- `people:read` — ver la lista y las fichas.
- `people:write` — editar datos y escribir notas.
- `people:checkin` — acreditar.
- `people:export` — descargar el CSV.

### Asignación

| Rol | Qué obtiene | Por qué |
|---|---|---|
| **OWNER** | Todo | Por definición. |
| **EDITOR** | `read`, `write`, `checkin`, `export` | Ya ve postulantes (`applications:read`); es quien opera el evento. |
| **CONTENT** | **Nada** | Prensa y marketing. Ya está excluido de los datos de postulantes; el mismo criterio aplica acá. |
| **STAFF** | **Solo `people:checkin`** | Personal de puerta. Ve lo mínimo para encontrar a alguien y marcarlo presente. |
| **VIEWER** | Nada por ahora | Su superficie es el reporte a sponsors, no esta pantalla. |

### Esta spec destraba a STAFF

El código de roles dice hoy:

> `STAFF: []` — *Puerta: escanear QR. Todavía sin permisos porque todavía no existe la pantalla.*

La acreditación manual **es** esa superficie. Con esta spec, STAFF se agrega a `LOGIN_ENABLED_ROLES` y recibe `people:checkin`.

**Cómo busca STAFF sin poder leer las fichas.** `people:checkin` no habilita `GET /people` ni `GET /people/:id`. Habilita una tercera ruta, angosta a propósito:

```
GET /people/puerta?q=...     permiso: people:checkin
→ [{ id, nombre, jornadasAcreditadas, tieneEntrada }]
```

Devuelve **solo esos cuatro campos**, exige un término de búsqueda de 3 caracteres o más (no se puede listar la base entera) y tope de 20 resultados. Sin DNI, sin teléfono, sin email, sin postulaciones, sin notas.

El recorte se hace **en el server, no ocultando columnas en el front**: la respuesta nunca contiene el dato que STAFF no debe ver. Es gente de puerta, muchas veces contratada por el día, y un `Authorization` filtrado no debería poder traer la base de datos personales del evento.

### Otras reglas

- **El CSV respeta el consentimiento**: solo salen las personas que aceptaron compartir sus datos con sponsors. Las demás no se exportan, y el archivo dice cuántas quedaron afuera y por qué.
- **Cada exportación queda registrada** (quién, cuándo, cuántas filas): es la acción más sensible de la pantalla.
- **El campo de notas se escapa al renderizar.** Es texto libre escrito por una persona y mostrado a otra.

---

## 7. Pantallas

### Lista

- **Buscador** arriba, filtra mientras se escribe por nombre, email, teléfono o DNI (con *debounce*; la consulta va al server).
- **Filtros**: socios, inscriptos, postulantes (y su estado), con entrada, acreditados.
- **Columnas**: nombre con contacto al lado · estados (socio / inscripto / pagó) · postulación y su estado · alta y última actividad. Ordenable por cualquiera.
- **En celular**: tarjetas apiladas, no tabla. Cuatro columnas de datos no entran en un teléfono, y el equipo va a usar esto desde el celular durante el evento.
- **Al pie**: *"además, N dispositivos anónimos visitaron la app sin dejar datos"*.

### Ficha

Se abre en un panel lateral deslizante, **no** en una página nueva: así no se pierden los filtros ni la posición en la lista al volver.

Bloques: identidad y contacto (cada dato con su procedencia) · consentimientos · entradas y pagos · inscripciones · postulaciones con sus respuestas · membresía · asistencia · notas internas · actividad.

**Acciones**: WhatsApp, email, editar, agregar nota, marcar presente.

Cada bloque se muestra solo si tiene contenido, salvo entradas y pagos, que dicen explícitamente "sin entradas todavía" — su vacío es información.

### Componentes

`AdminUsuarios` (página) · `UsuariosTabla` · `UsuarioFicha` (panel) · `UsuarioAcciones` · `useUsuarios` (búsqueda, filtros, paginación).

Ninguno pasa de ~200 líneas. Si crecen, se parten: son los archivos que más se van a tocar después.

---

## 8. Estados vacíos y errores

| Situación | Qué se ve |
|---|---|
| Sin personas todavía | Explicación honesta: la lista se llena cuando la gente se registre, se inscriba o se postule. No un error. |
| Búsqueda sin resultados | "Sin resultados para «X»" y un botón para limpiar filtros. |
| Falla la carga | Mensaje del server y botón de reintentar. Nunca una lista vacía que parezca "no hay nadie". |
| Falla al guardar | Se revierte el cambio y se avisa, usando `admin:write-failed`, el mecanismo que ya existe. |
| Sin permiso | La sección ni aparece en el menú. Los endpoints responden 403 igual (el front nunca es la única defensa). |
| Ya acreditado | El botón muestra el estado y ofrece deshacer. Reacreditar no rompe: es idempotente. |

---

## 9. Testing

**Server (vitest, suite existente):**
- Unificación: mismo email en dos fuentes → una Persona. Emails con distinta capitalización o espacios → la misma. Sin claves → personas separadas. Claves cruzadas → no fusiona y registra el conflicto.
- Backfill idempotente: correrlo dos veces no duplica.
- Permisos: cada endpoint responde 403 con un rol que no lo tiene. **Un caso explícito por rol.**
- STAFF: recibe 403 en `/people` y en `/people/:id`; en `/people/puerta` recibe 200, y se verifica **campo por campo** que la respuesta no contenga dni, email, teléfono, notas ni postulaciones. También: que rechace búsquedas de menos de 3 caracteres y que no devuelva más de 20.
- Export: excluye demo, excluye a quienes no consintieron, y escapa los campos que empiezan con `=`, `+`, `-` o `@` (inyección de fórmulas en Excel).
- Acreditación: idempotente; deshacer funciona; dos jornadas conviven.

**Front (vitest + jsdom, runner ya incorporado):**
- Búsqueda con debounce que no dispara una consulta por tecla.
- La ficha no muestra bloques vacíos, salvo entradas.
- La tabla pasa a tarjetas en viewport de celular.

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambio de esquema en producción | Migración aditiva: solo tablas y columnas opcionales nuevas. Nada existente cambia de forma. Se corre con 3 registros reales. |
| PII expuesta a más gente | Permisos explícitos por endpoint; STAFF deliberadamente limitado; export con consentimiento y registro. |
| Unificación equivocada (dos personas fusionadas) | Solo se unifica por coincidencia exacta de email o DNI normalizados. Ante claves en conflicto no se fusiona: se registra. |
| La pantalla nace casi vacía | Los datos de demo se muestran, así se ve en uso desde el día uno. |
| Colisión con otras sesiones | El archivo caliente es `routes/admin.ts`. Rebasar antes de abrir el PR y verificar `origin/main` justo antes de mergear. |

---

## 11. Fases de implementación

El diseño completo se construye en tres entregas, cada una útil por sí sola. Se parte porque un PR único sería enorme y esto toca `schema.prisma` y `routes/admin.ts`, los dos archivos con más colisiones entre sesiones paralelas.

**Fase 1 — La base y la lista** *(primera a implementar)*
Tabla `Person`, migración `10_person`, backfill, reglas de unificación, enganche en los caminos de escritura, `GET /people`, `GET /people/:id`, la lista con **buscador por texto** y la ficha en modo lectura. Permiso `people:read`.
Al terminar, la página rota queda reemplazada por un CRM funcional. **Es la única fase que cambia el esquema.**

**Fase 2 — Las acciones**
`PATCH /people/:id`, notas (`PersonNote`), export CSV con consentimiento y registro, contacto por WhatsApp/email, y **los filtros por estado** (socios, inscriptos, postulantes, con entrada). Permisos `people:write` y `people:export`. No toca el esquema salvo `PersonNote`.

Los filtros se difieren desde la Fase 1 a propósito: con ~25 personas el buscador por texto alcanza, y los filtros recién ganan sentido con volumen.

**Fase 3 — La puerta**
`Attendance`, acreditación manual e idempotente, ruta angosta `/people/puerta`, permiso `people:checkin` y habilitación del rol STAFF. Se construye cerca de septiembre para probarla en condiciones reales.

---

## 12. Decisiones tomadas

1. **Tabla de Personas, no cálculo al vuelo** — porque notas, asistencia y correcciones necesitan identidad estable, y hoy la migración es gratis.
2. **La Persona ancla identidad, no copia datos** — preservar la procedencia de cada campo es lo que hace valiosa a la base.
3. **Los datos de demo se ven como usuarios normales, pero no se exportan** — visibles para trabajar, imposibles de mandarle a un sponsor.
4. **La asistencia vive en su propia tabla** — desacoplada de las entradas, que dependen de Mercado Pago y todavía no existen.
5. **STAFF se habilita con esta pantalla** — es la superficie que el propio código de roles declaraba faltante.
