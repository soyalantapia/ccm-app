# Speakers — sección propia en la app y en el panel

**Fecha:** 2026-07-23
**Origen:** reunión Alan Tapia × Micaela Cabral (responsable de comunicación y marca de CCM).
**Estado:** diseño aprobado en brainstorming. Sin implementar.

## Problema

Hoy los oradores de CCM viven como un campo de texto separado por comas dentro de cada bloque
de agenda (`EventBlock.speakers String[]`, cargado en `OpsBlockForm.tsx:164` como un `<Input>`
de texto libre). No tienen ficha, ni foto, ni historia, ni una vidriera propia. Micaela los
llama "Corazones que inspiran" y quiere que tengan el mismo peso visual que un participante,
agrupados por edición del evento, para poder seguir promocionándolos después de que pasen.

Dos frases de la reunión fijan el alcance:

- *"los que dan un workshop no los puedo poner en participantes… alguien que puso plata o que
  tiene un estándar"* — un speaker no se mezcla con el catálogo de participantes.
- *"speaker CCM 2026, y entonces ahí aparece; vamos a tener otro evento y eso quedará abajo y
  aparecerán los speakers del próximo evento"* — se agrupan por evento/edición.

Decisiones tomadas en el brainstorming (cada una es una respuesta explícita del usuario):

1. Un expositor **puede además** ser speaker → "speaker" no puede ser un valor excluyente del
   rol; convive con él.
2. Un speaker se asocia a **eventos concretos**, no lleva la edición como simple texto.
3. La carga se hace **desde las dos puntas**: la ficha de la persona y la ficha del evento.
4. El vínculo va **al bloque cuando el evento tiene grilla, y al evento cuando no** (la
   Masterclass del 21/08 *es* la actividad; el principal del 19-20 tiene 7 bloques y ahí quien
   habla, habla en un bloque).

## Modelo de datos — dos ejes ortogonales

La clave del diseño es separar dos preguntas distintas sobre cada persona del catálogo.

### Eje 1 — qué es en el catálogo: `CatalogProfile.kind`

Hoy `kind` es `String @default("participante")` con valores `participante | expositor`
(`schema.prisma:394`). **Es un String, no un enum de Postgres**, así que sumar un valor no
requiere migración de tipo. Pasa a admitir tres valores:

- `participante` — sin cambios.
- `expositor` — sin cambios (stand, cupo de imágenes propio, campo "cuenta proyectos").
- `speaker` — **nuevo**: alguien cuyo lugar en el producto es dar una charla, no exponer.

🔴 **Bloqueante conocido a arreglar primero.** `serialize.ts:151` hace
`kind: c.kind === 'expositor' ? 'expositor' : 'participante'`. Esa ternaria colapsa cualquier
valor que no sea `expositor` a `participante`, así que sin tocarla un `kind: 'speaker'` guardado
en la base sale serializado como `participante` y **la feature falla en silencio**. Se
reemplaza por una whitelist de tres valores con fallback explícito a `participante`.

El tipo del front (`src/data/types.ts:159`, `CatalogProfile.kind?: 'participante' | 'expositor'`)
suma `'speaker'`.

### Eje 2 — dónde y cuándo habla: tabla nueva `EventSpeaker`

```prisma
model EventSpeaker {
  eventId   String
  profileId String
  blockId   String?  // presente si el evento tiene grilla; null si el evento ES la actividad
  order     Int      @default(0)

  event   Event          @relation(fields: [eventId],   references: [id], onDelete: Cascade)
  profile CatalogProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  block   EventBlock?    @relation(fields: [blockId],   references: [id], onDelete: Cascade)

  @@id([eventId, profileId, blockId])
  @@index([eventId])
  @@index([profileId])
}
```

Cada fila es "esta persona habla en este lugar". **Ser speaker = tener ≥1 fila en esta tabla.**
No hace falta ningún booleano en la persona.

Se sigue el patrón ya probado de `EventSponsor` (`schema.prisma`, tabla puente evento↔sponsor
con `@@id` compuesto), y su manejo en `adminService.ts` (crear las filas al crear el evento,
`deleteMany` + `createMany` al editar). El backend ya sabe hacer exactamente esto.

⚠️ La migración se nombra con prefijo que la ordene **al final** — el repo usa el esquema `9z…`
(`9z_payment_kind_event`, `9z2_event_capacity`, `9z3_event_parent`) justamente porque Prisma
ordena las migraciones lexicográficamente y este proyecto ya se mordió con eso. Nombre
propuesto: `9z4_event_speaker`.

### La frase — "Corazón que inspira"

Es **una por persona**, no por evento (Micaela: "le ponen su frase"). Campo nuevo en
`CatalogProfile`:

```prisma
quote String? @db.Text  // "Corazón que inspira": frase propia del speaker
```

Se serializa con el mismo patrón condicional que `instagram`/`whatsapp`
(`serialize.ts`, `...(c.quote ? { quote: c.quote } : {})`).

### Cómo caen los tres casos de Micaela

| Persona | `kind` | filas `EventSpeaker` | Cat.público | /speakers |
|---|---|---|---|---|
| Diseñador con stand que da un workshop | `expositor` | ≥1 | sí | sí |
| Carolina Curti, sólo viene a dar la charla | `speaker` | ≥1 | **no** | sí |
| Expositor común, sin charla | `expositor` | 0 | sí | no |

**Regla de visibilidad, una sola:** el catálogo público de participantes muestra
`kind ∈ {participante, expositor}` y **excluye `speaker`**. La página `/speakers` muestra a
quienes tienen ≥1 fila `EventSpeaker`, sin mirar el `kind`. Un `speaker` sin ninguna charla
cargada no aparece en ningún lado público — es un borrador, y está bien que así sea.

## Panel de administración

Tres superficies de carga; **la ficha de la persona es la puerta principal.**

### 1. Ficha de la persona — `OpsCatalogForm.tsx` (puerta principal)

- El `<Select>` de `kind` (hoy `OpsCatalogForm.tsx:208`) gana la opción **Speaker**.
- Campo nuevo **Frase** ("Corazón que inspira"), visible siempre (no sólo para speakers: un
  expositor que da charla también la usa).
- Bloque nuevo **"¿En qué eventos habla?"**: la lista de eventos con una casilla por cada uno.
  Marcarla crea la fila `EventSpeaker`. Si el evento tiene grilla, la casilla se despliega en un
  segundo nivel para elegir el/los bloque(s); si no, la fila queda con `blockId: null`.
- `IMG_CAP` (`OpsCatalogForm.tsx:48`) suma `speaker` (portafolio de imágenes; propuesto: 4, como
  el participante — un speaker no es menos que un participante).

### 2. Ficha del evento — `OpsEventForm.tsx` (vista de armado)

- Al lado del selector de sponsors que **ya existe en el modelo** (`EventSponsor`), un selector
  **"En este evento hablan…"** que elige personas del catálogo. Escribe las **mismas** filas
  `EventSpeaker` que la ficha de la persona — una sola fuente de verdad, dos formas de llegar.

  🔴 **Trampa a evitar, documentada en este repo:** `OpsEventForm.tsx:209` manda hoy
  `sponsorIds: []` **hardcodeado**, así que la relación evento↔sponsor está entera en el backend
  y nunca se puede usar desde el panel. El selector de speakers se cablea de verdad desde el día
  uno, y de paso conviene arreglar el de sponsors ya que se toca el mismo formulario.

### 3. Entrada "Speakers" en el menú del panel

- Ítem nuevo en `AdminLayout.tsx` (con su lugar en el nav del celular, no sólo el de escritorio
  — el repo ya se olvidó de eso con Convocatorias). Lista a quienes tienen ≥1 charla, para
  editarlos rápido. Permiso: `catalog:write` (mismo que el catálogo).

## Vista pública

### Pestaña `/speakers`

- Ruta nueva en `App.tsx` y su ítem en la navegación pública.
- Lista a quienes tienen ≥1 fila `EventSpeaker`, **agrupados por evento**, con el evento
  principal / edición vigente arriba y las ediciones anteriores abajo (orden por fecha del
  evento, descendente).
- Cada speaker: foto, nombre, frase ("Corazón que inspira"), y en qué habla. **Reusa las
  tarjetas del catálogo** (`ParticipanteCard` / la card de `Catalogo.tsx`), no inventa un diseño
  nuevo.

### Catálogo de participantes — filtro

- `Catalogo.tsx` (hoy `getCatalog()` → todos, agrupados por `platform`) filtra para **excluir
  `kind === 'speaker'`**, así los speakers puros no se mezclan con los participantes de su rubro.
  Un expositor que además es speaker **sí** sigue apareciendo en el catálogo (su `kind` es
  `expositor`).

## Entregas

El alcance completo es grande y el lanzamiento apunta a martes/miércoles. Se parte en dos.

### Entrega 1 — para el lanzamiento (aprobada como alcance del martes)

Que Micaela pueda **cargar speakers con foto y frase, y que tengan su pestaña propia.**

1. `serialize.ts` — arreglar la ternaria de `kind` (whitelist de 3). **Bloqueante, va primero.**
2. Migración `9z4_event_speaker`: tabla `EventSpeaker` + campo `quote` en `CatalogProfile`.
3. Backend: serializar `kind: 'speaker'` y `quote`; endpoint/servicio para leer los speakers de
   un evento y para leer "todos los speakers agrupados por evento".
4. `OpsCatalogForm.tsx`: opción Speaker en el `kind`, campo Frase, bloque "¿En qué eventos
   habla?" (carga desde la ficha de la persona), `IMG_CAP` para speaker.
5. Pestaña pública `/speakers` agrupada por evento.
6. Filtro en `Catalogo.tsx` para excluir speakers puros.

Estimación: medio a un día.

### Entrega 2 — antes del evento

1. Selector "En este evento hablan…" en `OpsEventForm.tsx` (+ arreglar el `sponsorIds: []`
   hardcodeado de paso).
2. Entrada "Speakers" en el menú del panel (con nav de celular).
3. Conectar la grilla del evento principal: `BlockRow.tsx` deja de mostrar el texto libre de
   `EventBlock.speakers` y muestra las fichas reales de las filas `EventSpeaker` con `blockId`.
   Migrar/deprecar `EventBlock.speakers String[]`.

Es lo más caro y lo que menos urge: en producción **no hay una sola grilla real cargada** (los
18 bloques y 23 perfiles publicados son los datos de prueba del seed, verificado por GET), así
que la grilla del principal no tiene todavía speakers reales que mostrar.

## No incluido (YAGNI)

- Página de detalle propia por speaker más allá de la card — se reusa la ficha del catálogo si
  hace falta, no se construye una nueva.
- Métricas de speaker (vistas, clicks) — a diferencia de la entidad `Banner`, que las trae; un
  speaker no las necesita.
- Roles de speaker (keynote vs panelista, etc.) — el `order` alcanza para priorizar.
- Reordenar bloques o speakers con drag-and-drop — el campo `order` numérico alcanza.

## Verificación

- Migración aditiva (nullable / tabla nueva), sin backfill: los datos actuales quedan válidos.
- Tests de servicio: crear un speaker, vincularlo a un evento con y sin bloque, leer los
  speakers de un evento, confirmar que un `kind: 'speaker'` **no** sale como `participante` del
  serializador (regresión del bloqueante), confirmar que el catálogo público lo excluye y
  `/speakers` lo incluye.
- Ejercicio en vivo contra el stack local: cargar a "Carolina Curti" como speaker de la
  Masterclass del 21/08, verla aparecer en `/speakers` bajo ese evento y **no** en el catálogo.
