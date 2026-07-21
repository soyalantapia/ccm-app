# CRM de Usuarios · Fase 1 — Tareas 6, 7 y 8

**Rama:** `feat/crm-usuarios` · **Fecha:** 20-21/07/2026
**Alcance:** el permiso `people:read`, el endpoint de lista y el endpoint de ficha.

---

## Qué se hizo

### Tarea 6 — Permiso `people:read` (`f2fd8e4`)

Se agregó `'people:read'` al tipo `Permission` y a los grants de `EDITOR` (OWNER ya lo hereda por
tener todo). CONTENT, STAFF y VIEWER quedan afuera, con el mismo criterio que ya los deja afuera de
las postulaciones: prensa, marketing y puerta no ven datos personales.

### Tarea 7 — `GET /admin/people` (`f7686d5`)

Lista paginada por cursor, con buscador por nombre, email y DNI resuelto **en SQL** (no sobre la
página ya armada — eso estaba mal en el plan original y se corrigió en `666d11a`). Devuelve además
el conteo de dispositivos anónimos.

### Tarea 8 — `GET /admin/people/:id` (`ab7dfcf`)

La ficha completa: datos con su procedencia, consentimientos, entradas, postulaciones y actividad.

---

## Lo que apareció al verificar contra datos reales

Nada de esto estaba en el plan. Salió de probar el circuito de verdad contra `ccm_local` y de una
revisión adversarial del cambio. Las seis cosas estaban listas para llegar a producción.

### 1. La ficha salía vacía para todo el mundo (`57a9b62`)

`ccm_local` tiene **24 personas, 24 postulaciones y 0 ProfileFields**. La ficha solo leía
ProfileField —que se llena desde el sitio—, así que "Datos, y de dónde salió cada uno" aparecía
vacío para las 24. El dato estaba en la base, en el JSON de la postulación, y no se mostraba.

Ahora las claves de identidad y contacto (nombre, email, dni, telefono→phone, instagram) se
completan desde la postulación más reciente cuando no llegaron por ProfileField, con procedencia
`postulacion` y su fecha verdadera.

Dos decisiones que conviene no perder:

- **ProfileField siempre le gana a la postulación** para la misma clave: trae procedencia real (qué
  dispositivo capturó el dato y cuándo). Pisarlo sería peor información, no mejor.
- **El mapeo es corto a propósito.** `historia`, `extra`, `desfile`, `portfolio` y `acompanante` son
  respuestas de esa convocatoria puntual y ya se ven en el bloque de Postulaciones.

### 2. La etiqueta del nombre se mostraba cruda (`128ba13`)

El campo que viene de la postulación se imprimía como `nombre`, en minúscula. El cast
`c.key as ProfileFieldKey` le decía al compilador que no existía ninguna otra clave, así que nadie
se enteró en tiempo de compilación. La etiqueta quedó **"Nombre completo"** y no "Nombre": la
postulación pide el nombre entero, mientras que `firstName` (ya etiquetado "Nombre") es el nombre de
pila. Mapear uno al otro era más corto y decía algo falso del dato.

### 3. El menú de celular no respetaba el permiso (`6713087`)

El filtro se aplicaba al sidebar de escritorio y a la hoja "Más", pero **no** a la barra inferior de
celular: un CONTENT veía ahí "Usuarios" y al tocarla se comía un 403. No era un agujero de datos —el
backend nunca los entregó—, pero es lo que el checklist de la fase pide que no pase.

El centrado del botón central se rehízo de paso, porque el arreglo obvio lo rompía: con dos grupos
fijos y `grid-cols-5` hardcodeado, filtrar dejaba a CONTENT con 3 columnas y el FAB pegado al borde
izquierdo.

### 4. El payload se contradecía a sí mismo (`de903ab`)

`campos` mezclaba ProfileField con postulación, pero los atributos sueltos (`telefono`) seguían
leyendo solo ProfileField. Como la lista pinta `telefono` y la ficha pinta `campos`, **las 24
personas figuraban "Sin contacto" en la lista y con teléfono al abrirlas.** La precedencia ahora vive
en una sola función, `camposDe()`, que usan los dos endpoints.

### 5. La lista se bajaba todo el historial de analytics (`de903ab`) — el más caro

`ultimaActividad` salía de `include: { analytics: { take: 1 } }`, y **Prisma solo empuja el `take` de
una relación anidada al SQL cuando hay UN padre.** Con dos o más emite la consulta sin `LIMIT` y
recorta en memoria. Capturado contra la base:

```
1 padre  → ... WHERE "deviceId" IN ($1)     ORDER BY "ts" DESC LIMIT $2 OFFSET $3
2 padres → ... WHERE "deviceId" IN ($1,$2)  ORDER BY "ts" DESC          OFFSET $3   ← sin LIMIT
```

La lista trae hasta 51 personas, o sea decenas de dispositivos: caía **siempre** en el caso malo.
Para mostrar una fecha por persona descargaba el historial completo de `AnalyticsEvent` —marcada
«ALTO VOLUMEN» en el schema, con su `payload` jsonb— de todos esos dispositivos. Andaba impecable con
24 personas y se caía al arrancar el evento.

Ahora sale de un `groupBy` con `_max`, una fila por dispositivo resuelta por el motor. La ficha tenía
la misma trampa con `take: 100`, y encima el recorte quedaba mal: traía 100 **por dispositivo** y
ordenaba después, así que con varios dispositivos las "últimas 100" no eran las últimas 100 de la
persona.

### 6. El test que no probaba nada (`de903ab`)

El test de "ProfileField le gana" —la única decisión que el commit se molesta en documentar— afirmaba
con `.find()` sobre `[...ProfileField, ...postulación]`, que devuelve siempre el primero. **Borrando
entera la protección anti-duplicado, los 21 tests pasaban igual.** Ahora afirma sobre la cantidad, y
está verificado al revés: con la protección borrada falla con `length of 1 but got 2`. El
`capturedAt` también pasó de `toBeTruthy()` (una fecha inventada pasaba) a la fecha exacta.

---

## Verificación

**Gate automático**

| Chequeo | Resultado |
|---|---|
| `server` typecheck | ✅ limpio |
| `server` tests | ✅ **210/210**, en dos pasadas seguidas |
| front `tsc -b` | ✅ limpio |
| front tests | ✅ **68/68** |
| `npm run build` | ✅ verde |
| lint | 33 problemas **preexistentes**; los archivos que toca la rama tienen el mismo conteo en `main` — la rama no sumó ninguno |

**Contra `ccm_local`, con sesión real**

- Sin token → **401**. Token CONTENT → **403** (`ADMIN_FORBIDDEN`). Token EDITOR → **200**, 24 personas.
- Buscador: nombre parcial, nombre en minúscula, apellido, email parcial, DNI exacto y DNI parcial →
  1 resultado correcto cada uno; texto inexistente → 0.
- Ficha: los 5 campos con `source: "postulacion"` y `capturedAt` = fecha real de la postulación
  (11/06/2026). El ruido de la convocatoria **no** subió a "Datos". Una sola entrada por clave.
- `telefono` (atributo) == `campos[phone]`, y las 24 muestran teléfono en la lista.
- SQL medido tras el fix: `listPeople` emite un único `SELECT MAX(ts), deviceId ... WHERE deviceId
  IN (...)`; `getPerson` emite una consulta con `LIMIT` real.
- UI a 375×812 con sesión real: CONTENT ve `Sponsors · [Panel] · Más`, sin "Usuarios"; EDITOR ve las
  5 pestañas con el FAB centrado.

**Una trampa que casi pasa desapercibida**

Los dos tests nuevos de la ficha rompieron un test viejo de `backfillPersonas` (esperaba 1 persona
creada y obtenía 3). `Application.personId` es `onDelete: SetNull`, así que el `person.deleteMany()`
de su `beforeEach` no se llevaba las postulaciones: las dejaba huérfanas con `personId` en null, que
es exactamente lo que el backfill sale a buscar. La limpieza ahora borra también las postulaciones.

**Un falso positivo, para que nadie más lo persiga**

`GET /admin/people?limit=3` devuelve las 24 igual. **No es un bug:** el plan define `limit` como
opción del *servicio* (default 50, tope 100), no como query param del endpoint, y el front nunca lo
manda. La ruta lee `q` y `cursor` a propósito.

---

## Backlog de la revisión (no tocado en este PR)

La revisión adversarial propuso 21 hallazgos; se atacaron los 5 que afectaban esta feature. El resto
queda anotado, por severidad:

**P2**
- El buscador **no encuentra por teléfono**, aunque la ficha ya lo muestra.
- DNI y email en texto plano van a los logs de la app (canal sin RBAC).
- `_count.registrations` agrega sobre la tabla `Registration` entera en cada request.
- Falta el índice compuesto `(deviceId, ts)` en `AnalyticsEvent` (necesita migración).
- La búsqueda no puede usar índice: `ILIKE '%q%'` sobre `ProfileField.value` y `LIKE` sobre el JSON.
- Solo se lee la postulación **más reciente**: los datos de las anteriores no se muestran.
- Ningún test prueba que sea la más reciente (los tests crean una sola postulación).

**P3**
- El mapeo de claves está hardcodeado contra el seed, pero el form builder permite claves libres.
- La ficha manda el JSON crudo entero de cada postulación (y el payload de analytics) que la UI no usa.
- `listPeople` trae el JSON completo de todas las postulaciones para usar solo la más reciente.
- El contador de anónimos se recalcula en cada página.
- `backfillPersonas` hace 2-3 consultas secuenciales por dispositivo.
- El endpoint de la ficha no tiene test de ruta con éxito (solo el de permiso).
- Los tests nuevos no limpian lo que crean.
- El valor se guarda sin `trim()` aunque el guard sí trimea.

---

## Pendiente para cerrar la fase

- [ ] **Rebasar antes de mergear.** Hay 3 sesiones paralelas tocando estos archivos;
      `AdminLayout.tsx` en particular es zona de colisión.
- [ ] Abrir el PR contra `main`.
- [ ] **Correr el backfill en producción después del deploy.** Sin eso la lista sale vacía aunque
      haya datos — el mismo efecto que hacía ver la ficha vacía en local.
