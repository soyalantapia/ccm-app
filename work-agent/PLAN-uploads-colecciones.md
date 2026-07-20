# PLAN v2 — Subida de imágenes en Portfolio y Galería (CCM)

Repo auditado: `/tmp/ccm-mi` @ `aae34e8`. Todo lo que sigue está verificado contra el código y contra la API de producción (`https://ccm-api-production-91a9.up.railway.app/api/v1`).

---

## 0. Lo que medí yo mismo (base de decisiones)

| Dato | Valor real | Cómo lo verifiqué |
|---|---|---|
| Fotos en prod | 58 en 4 galerías, **100% con `alt` curado y descriptivo** | `GET /api/v1/galleries` |
| IDs de fotos en prod | `ph-01…ph-28`, `ph-abr-*`, `ph-cap-*`, `ph-gala-*` → **todos de seed** | idem. El P0 todavía **no se disparó** |
| Obras de portfolio en prod | 64, **50 con `caption`** | `GET /api/v1/catalog` |
| Obras dentro de `PORTFOLIO_POOL` | **0 de 64.** El pool apunta a `img/gallery/`; las obras viven en `img/portfolio/` (48) e `img/catalogo/<slug>/` (16) | idem + `ls public/img/portfolio` (48 archivos) |
| Fotos de galería fuera del pool de 20 | 17 de 58 (8/3/1/5). `public/img/gallery` tiene **28** archivos, el pool genera 20 | `ls public/img/gallery` |
| Portadas fuera de `COVER_OPTIONS` (8) | 3 de 4 (`g14`, `g20`, `g26`) | `GET /galleries` |
| Retratos fuera de `PHOTO_OPTIONS` (p01–p10) | **13 de 23 perfiles** | `GET /catalog` |
| Archivos subidos referenciados en prod | **cero** (`grep '/uploads/'` sobre sponsors/banners/notas/contents/events) | curl |
| `src` duplicados dentro de una misma galería | 0 | curl |
| Tests que tocan galerías/fotos/catálogo | **0** (7 archivos, ninguno) | `ls server/src/**/*.test.ts` |

Correcciones de premisa que cambian prioridades:

- **El reporte al sponsor NO sale de `PhotoDownload`.** Sale de `AnalyticsEvent` (`src/features/admin/SponsorReport.tsx:40` → `store.getAnalytics()`, filtrando `payload.sponsorId`), y `AnalyticsEvent` no tiene FK a `Photo`. Lo que el cascade destruye de verdad es **Favoritos** y **Mis descargas** del asistente (`server/src/services/photoService.ts:7` y `:36`). Sigue siendo el daño #1, pero el criterio de aceptación tiene que apuntar ahí, no al dashboard de sponsors.
- **No existe "deploy solo de backend".** Un único `Dockerfile` buildea front + server y un único servicio Railway los sirve. Lo que sí existe son **clientes viejos con el bundle cacheado por el service worker** (`vite.config.ts:100` precachea JS/CSS). Ese es el motivo real para que el server tolere payloads del front actual, no un release partido.
- **`asset()` no está roto en prod.** `VITE_BASE=/` en el `Dockerfile:15` y GH Pages está **retirado** (`package.json` script `deploy` = `exit 1`). Pero con el default del repo (`/ccm-app/`) toda URL `/uploads/...` se resuelve como `/ccm-app/uploads/...` → 404. Rompe el stack local de verificación y cualquier base futura ≠ `/`.

---

## 1. Objeciones descartadas o recalibradas

| Objeción | Veredicto |
|---|---|
| "Migrar `PhotoDownload.photoId` a nullable + `SetNull`" | **Descartada.** Con la Fase 1 el único DELETE que queda es deliberado (✕ + Guardar). Que el favorito de una foto borrada desaparezca es semánticamente correcto. Una migración de schema sobre una tabla-ledger en prod, para cubrir un caso que la UI ya va a confirmar, no paga. Se reemplaza por confirmación en la UI. |
| "El plan destruye el reporte que se le vende al sponsor" | **Descartada como justificación** (ver arriba). El P0 se mantiene con la justificación correcta: favoritos y "mis descargas". |
| "Deployar la Fase 1 sola, backend sin UI" | **Recalibrada.** Front y back van en la misma imagen. Lo que se conserva: la Fase 1 va en su propio PR/deploy, el server tolera el payload del front viejo (SW cacheado), y hay `pg_dump` antes. |
| "`asset()` es bloqueante de producción" | **Recalibrada a alta prioridad, no P0 de prod.** Rompe dev local y la Fase 7. Fix de 3 líneas + test unitario. |
| "Diff por `src`" como estrategia principal | **Descartada.** `Photo` no tiene `@@unique([galleryId, src])` y las galerías del seed comparten `src` entre sí. Se conserva **solo como fallback** para clientes con bundle viejo, consumiendo cada fila existente una sola vez (determinista). |
| "Aceptar HEIC en el server" | **Descartada.** iOS convierte a JPEG cuando el `accept` lista `image/jpeg` y se elige del carrete. El problema real es el peso (>5 MB de cámara de prensa) y se resuelve con downscale en el cliente. |
| "GC de archivos huérfanos en el Volume" | **Fuera de alcance** (ver §5). Se atacan las *fuentes* de huérfanos, que es el 80%. |
| "Arreglar los otros 5 delete-all+recreate de `adminService`" | **Descartada.** Verifiqué el schema: `Photo` es la única entidad recreada con FKs entrantes. Los otros 5 no tienen blast radius referencial. Solo se agrega un comentario para que nadie revierta el fix. |
| "Drag & drop para reordenar" | **Fuera.** Se resuelve con botones ↑↓, que cubren el caso real (apertura / pasadas / saludo final). |

Fusiones: `caption` (3 auditores) → un ítem. `alt` (3 auditores) → un ítem. Rate limit (3 auditores) → un ítem. Fallo parcial del batch (3) → un ítem. `IMG_CAP` + cambio de tipo (3) → un ítem. Selects huérfanos de portada/retrato (2) → un ítem.

---

## 2. Decisiones de diseño que cierran el debate

Estas son invariantes, no sugerencias. Cada fase se mide contra ellas.

1. **Ninguna fila `Photo` que sobrevive a un guardado puede pasar por un DELETE.** No alcanza con "preservar el id": el cascade corre en el momento del DELETE.
2. **La clave de identidad es el `id`, nunca la URL.** Ni en el server, ni en las `key` de React, ni en los handlers de edición/borrado.
3. **Los ids nuevos los genera el cliente y el server los acepta tal cual** si están libres. Esto es lo que mata la carrera optimista: el segundo PATCH consecutivo manda el mismo id que el primero creó, y matchea. El server solo re-mintea (`ph_${randomUUID()}`) si el id ya pertenece a **otra** galería. `Photo.id` no tiene `@default` (`schema.prisma:374`), así que el server nunca puede omitirlo.
4. **Todo campo que el form no edita, el form no lo pisa.** `alt` y `caption` se cargan, viajan y vuelven intactos. En el server, `?? null` se reemplaza por "si la propiedad no viene, no la toques".
5. **El pool de demo y la selección son cosas distintas.** La grilla principal es siempre la selección real; el pool es un accesorio colapsable, rotulado como demo.
6. **Guardar es awaitable.** El toast verde y el cierre del sheet ocurren solo con confirmación del server.

---

## 3. Fases

Cada fase deja el sistema consistente y desplegable por sí sola.

### F0 — Congelamiento y respaldo (mismo día, sin código)

- Avisar por escrito al equipo: **no editar galerías ni perfiles del catálogo desde el admin** hasta que F1 esté en prod. Hoy prod está limpio (todos los ids son de seed); la primera edición quema esa ventana para siempre.
- `pg_dump "$DATABASE_URL" > ccm-pre-uploads-$(date +%Y%m%d-%H%M).sql` (RUNBOOK.md §4).
- Dump de los 50 captions y los 58 alt como red de seguridad:
  `curl -s .../api/v1/catalog > catalog-pre.json && curl -s .../api/v1/galleries > galleries-pre.json`

**Verificación:** los dos JSON existen y `jq '[.[].portfolio[]|select(.caption)]|length'` sobre `catalog-pre.json` da 50.

---

### F1 — Server: que guardar deje de destruir (backend puro)

**Archivos**
- `/tmp/ccm-mi/server/src/services/adminService.ts` (`updateGallery` :163-173, `updateCatalogProfile` :189-200)
- `/tmp/ccm-mi/server/src/routes/admin.ts` (:108-115, agregar zod)
- `/tmp/ccm-mi/server/src/app.ts` (:48-52 rate limit, :84-95 fallback SPA)
- `/tmp/ccm-mi/server/prisma/seed.ts` (:84, :94 — guard)
- `/tmp/ccm-mi/server/src/services/adminService.test.ts` (nuevo)

**Cambios**

1. `updateGallery` — reemplazar `deleteMany` + `createMany` por, dentro de la misma `$transaction`:
   - `const existing = await tx.photo.findMany({ where: { galleryId: id }, select: { id: true, src: true } })`
   - Matcheo por `id` contra `existing`. Para los ids entrantes que no matchean: **fallback por `src`**, consumiendo cada fila existente aún no matcheada una sola vez, en orden (esto es lo que salva a un cliente con bundle viejo cacheado por el SW, que manda `newId('ph')` en cada guardado).
   - Sobrevivientes → `tx.photo.update({ where: { id }, data: { src, alt, order } })`. **`alt` solo si vino en el payload**; si no vino, no se toca.
   - Nuevos → `create` con el id del cliente; si ese id ya existe en la DB (otra galería), re-mintear `ph_${randomUUID()}`.
   - Al final: `tx.photo.deleteMany({ where: { galleryId: id, id: { notIn: idsSobrevivientes } } })`.
   - Comentario en el código explicando **por qué Photo es especial** (`PhotoFavorite`/`PhotoDownload` con `onDelete: Cascade`, `schema.prisma:393` y `:407`) para que el próximo refactor no lo revierta.
2. `updateCatalogProfile` — mismo patrón por `id` (no tiene hijos, pero necesitamos ids estables para F6), y **`caption`/`price`: si la propiedad no viene en el objeto, conservar el valor existente** en vez de `?? null`.
3. **zod en el PATCH/POST de galerías y catálogo**: `photos: [{ id?: string, src: string(min 1), alt?: string, order?: number }]` sin ids duplicados dentro del array; `portfolio` análogo con `caption`/`price` opcionales. Devuelve 400 en vez de reventar la transacción con P2002 (hoy `route<>` pasa `req.body` crudo a Prisma, `admin.ts:110`).
4. **Rate limit**: sacar `POST /admin/upload` del `writeLimiter` o darle cubeta propia (`RATE_LIMIT_UPLOADS`, default 300/min). Hoy cae en los 120/min por IP compartidos con toda la WiFi del venue (`app.ts:48-52`, `env.ts:18`).
5. **404 real para uploads**: después del `express.static` de uploads y **antes** del fallback SPA, `app.use(uploadPrefix, (_req, res) => res.sendStatus(404))`. Hoy un `/uploads/x.jpg` inexistente devuelve `index.html` con 200 (`app.ts:95`).
6. **Guard en `seed.ts`**: abortar si `NODE_ENV === 'production'` sin `--force`. El seed repite el mismo antipatrón destructivo.

**Verificación (obligatoria, no "probar que ande")**

```bash
# Postgres efímero
docker run --rm -d --name ccm-pg -e POSTGRES_PASSWORD=ccm -p 55432:5432 postgres:16
export DATABASE_URL='postgresql://postgres:ccm@localhost:55432/postgres'
cd /tmp/ccm-mi/server && npx prisma migrate deploy && npm run db:seed

# Sembrar el daño
psql "$DATABASE_URL" -c "INSERT INTO \"Device\"(id,\"publicId\") VALUES ('dev-t','pub-t');"
psql "$DATABASE_URL" -c "INSERT INTO \"PhotoFavorite\"(\"deviceId\",\"photoId\") VALUES ('dev-t','ph-01'),('dev-t','ph-02');"
psql "$DATABASE_URL" -c "INSERT INTO \"PhotoDownload\"(id,\"deviceId\",\"photoId\",\"galleryId\",\"sponsorId\") VALUES ('dl-t','dev-t','ph-01','gal-camino-marzo','sp-aura-beauty');"
psql "$DATABASE_URL" -c "SELECT md5(string_agg(id,',' ORDER BY id)) FROM \"Photo\" WHERE \"galleryId\"='gal-camino-marzo';"  # guardar hash

# PATCH cambiando SOLO el título, con el payload del front VIEJO (ids nuevos en cada foto)
curl -s -X PATCH localhost:4000/api/v1/admin/galleries/gal-camino-marzo \
  -H 'Authorization: Bearer '$ADMIN_TOKEN -H 'Content-Type: application/json' \
  -d @payload-front-viejo.json

# Gate: los 3 tienen que dar lo mismo que antes
psql "$DATABASE_URL" -c "SELECT count(*) FROM \"PhotoFavorite\";"   # 2
psql "$DATABASE_URL" -c "SELECT count(*) FROM \"PhotoDownload\";"   # 1
psql "$DATABASE_URL" -c "SELECT md5(string_agg(id,',' ORDER BY id)) FROM \"Photo\" WHERE \"galleryId\"='gal-camino-marzo';"  # mismo hash
psql "$DATABASE_URL" -c "SELECT count(*) FROM \"Photo\" p WHERE p.alt LIKE '% · foto %';"  # 0
curl -s localhost:4000/api/v1/admin/... | jq  # los 28 alt idénticos a galleries-pre.json
```

Más, en `server/src/services/adminService.test.ts` (mock de Prisma con el patrón que ya existe en `eventService.test.ts:10-16`), casos mínimos:
- 3 fotos preexistentes + 1 nueva → **no** se llama `deleteMany` sobre los ids sobrevivientes.
- Reordenamiento puro → mismos ids, `order` distinto.
- Dos fotos con el mismo `src` en el payload (con ids distintos) → dos filas, ids preservados.
- Payload con ids duplicados → 400, no P2002.
- `alt` ausente en el payload → `update` sin `alt` en `data`.
- `PATCH` con un id que pertenece a otra galería → se re-mintea, la otra galería no se toca.

`cd /tmp/ccm-mi/server && npx vitest run` tiene que pasar de 32 a ≥38 tests.

**Deploy:** PR propio, merge, deploy, y recién ahí se levanta el congelamiento de F0.

---

### F2 — Front: el form deja de destruir lo que no edita (sin cambios visuales de grilla)

**Archivos**
- `/tmp/ccm-mi/src/features/admin/OpsGalleryForm.tsx` (:26 `photos: string[]`, :36, :96-100)
- `/tmp/ccm-mi/src/features/admin/OpsCatalogForm.tsx` (:32 `PieceForm`, :84 `fromProfile`, :135-140 submit)
- `/tmp/ccm-mi/src/lib/assets.ts` (:6-9) + `src/lib/assets.test.ts` (nuevo, hay que montar runner de front — vitest ya está en el repo del server; agregar config mínima en la raíz)
- `/tmp/ccm-mi/src/components/ui/fields.tsx` (`Select`, :47-68)
- `/tmp/ccm-mi/vite.config.ts` (:113-121)

**Cambios**

1. `Form.photos: string[]` → **`{ id?: string; src: string; alt: string }[]`**. `fromGallery` carga `id` y `alt` reales. El submit conserva `alt` de las existentes y genera `${title} · foto N` **solo para las nuevas**.
2. `PieceForm` gana **`caption`** y **`uid`** (cliente): `fromProfile` lee `pf.id` y `pf.caption`; el submit los manda. `key`, `setPiece` y el filtro de quitar pasan a indexar por `uid`, nunca por `p.image` (`OpsCatalogForm.tsx:110-125` y `:295`). Sin esto, dos filas con `image: ''` durante una subida en paralelo comparten key y se pisan el título entre sí.
3. **`asset()`**: si `path` empieza con `/`, resolver contra el origen de la API (`VITE_API_URL`), no contra `BASE_URL`. Las rutas relativas del bundle (`img/gallery/...`) siguen igual. Test unitario con los 3 casos.
4. **`Select` con valor huérfano**: si `value` no está en `options`, inyectar una `<option>` extra "Imagen actual (subida)". Cubre los 13 retratos y las 3 portadas de prod que hoy hacen que el `<select>` se vea vacío y que un toque en el picker de iOS pise la foto real con stock.
5. **Mitigación barata del Hallazgo A**: `PHOTO_POOL` de 20 → **28** (los archivos existen); `PORTFOLIO_POOL` apunta a `img/portfolio/` (48 archivos), no a `img/gallery/`. Hoy el pool del portfolio muestra 20 imágenes que **ninguna** de las 64 obras usa.
6. **SW**: agregar `cacheableResponse: { statuses: [200] }` al `runtimeCaching` de imágenes (`vite.config.ts:113`), como ya hace el bloque de video (`:126`). Evita cachear 30 días un `index.html` de 200 bajo la URL de una imagen.

**Verificación**

```bash
cd /tmp/ccm-mi && npm run build && npm run lint     # tsc -b + eslint
# Circuito, contra el stack local de F1 y CON base '/ccm-app/' (el default del repo):
#  1. Editar "Camino a CCM · Marzo": cambiar SOLO el título → guardar
#     GET /galleries → los 28 alt idénticos a galleries-pre.json, ids idénticos
#  2. Editar "Valentina Roldán" (cat-01): cambiar SOLO la bio → guardar
#     GET /catalog → los 4 caption intactos
#  3. Abrir cat-14 (Andrea, retrato img/catalogo/...): el Select muestra
#     "Imagen actual (subida)" seleccionada, no en blanco
#  4. Subir una imagen a Portada y verificar que se RENDERIZA en el preview (asset())
```

---

### F3 — Guardar de verdad (awaitable)

**Archivos**
- `/tmp/ccm-mi/src/data/store/RemoteDataStore.ts` (:826-832, :856-864) y el contrato de `DataStore`
- `/tmp/ccm-mi/src/lib/api.ts` (:44-47, error con status y código)
- `OpsGalleryForm.tsx` (:109-116, :201-203) y `OpsCatalogForm.tsx` (:156-163)

**Cambios**: `updateGallery`/`updateCatalogProfile`/`create*` devuelven `Promise<void>`. El form hace `await`, deshabilita el submit mientras está en vuelo, y **si falla deja el sheet abierto** con el error visible y el estado intacto. El toast verde solo con confirmación del server.

Hoy: `api.patch(...).then(refetch).catch(refetch)` fire-and-forget + `toast('✓ Galería actualizada')` + `onClose()` síncronos. Con 25 fotos subidas y un Bearer expirado en `sessionStorage`, el organizador ve el tick verde y pierde todo.

**Verificación**
```bash
# Con el stack local: en DevTools, sessionStorage.setItem('ccm:admin-token','roto')
# Guardar una galería → NO aparece el toast verde, el sheet queda abierto,
# se ve "No se pudo guardar (401)". Restaurar el token, Guardar → ahora sí cierra.
# Idem con throttling "Offline" en Network.
```

---

### F4 — `ImageUpload` con lote (un solo componente, un solo contrato de error)

**Archivos**: `/tmp/ccm-mi/src/components/ui/ImageUpload.tsx`

**Cambios**: se **extiende** el componente existente, no se crea uno nuevo (tiene 4 ramas de error ganadas en prod, incluida la de 503 con "pegá la URL a mano", y 7 call sites que no deben cambiar una línea).

Props nuevas, todas opcionales: `multiple?`, `max?` (cupo restante), `onBusyChange?(busy)`, `accept?`, `signal?`.
- `onUrl` se sigue llamando **una vez por archivo** a medida que cae → los 7 call sites actuales quedan intactos.
- **Downscale en el cliente antes de subir** (canvas → JPEG, lado mayor 2000px, que es exactamente lo que `uploadService.optimizeInPlace` hace después). Esto elimina en la práctica el techo de 5 MB, que es lo que frena a una cámara de prensa, y acelera la subida.
- **Concurrencia 2**, reintento con backoff ante **429** leyendo los headers `draft-7` del rate limiter.
- **Lista de estado por archivo** (pendiente / subiendo / ok / error con nombre de archivo), contador "12 de 30", resumen final "subieron 22 de 30" y botón **"Reintentar las 8 que fallaron"** sin volver a elegir nada.
- `AbortController`: al desmontar o cerrar, aborta lo pendiente.
- Si `max` está seteado y se eligen más archivos que el cupo, **corta la selección antes de subir** con un mensaje, no después.
- `accept` por defecto sin SVG cuando se usa para fotos de galería (un SVG no es una foto de evento y hoy termina descargado como `.jpg`).

**Verificación**
```bash
# Local, con RATE_LIMIT_UPLOADS temporalmente en 5:
# elegir 12 archivos → 5 OK, 7 en 429 → la UI lista los 7 por nombre,
# el botón "Reintentar" los sube y el contador llega a 12/12.
# Cerrar el sheet a mitad → en Network, las requests pendientes quedan "canceled".
# Elegir un JPG de 9 MB → sube (downscale en cliente), no da 413.
```

---

### F5 — Galería: la grilla es la selección

**Archivos**: `/tmp/ccm-mi/src/features/admin/OpsGalleryForm.tsx`, `/tmp/ccm-mi/src/features/fotos/PhotoLightbox.tsx` (:60)

**Cambios**
- La grilla principal renderiza **`f.photos`** (la selección real), no el pool. Cada tile: miniatura, ✕, ↑↓ para reordenar, botón **Reemplazar** (sube un archivo y pisa esa posición conservando el `id`), e input de **texto del epígrafe** (`alt`) — que es copy visible, no solo accesibilidad: se muestra en `PhotoLightbox.tsx:102` y como título de cada fila de "Mis descargas" (`Fotos.tsx:138`).
- Botón **"Subir fotos"** (`multiple`) que appendea tiles placeholder mientras suben.
- El pool de demo baja a una sección **colapsable**, rotulada literal: *"Set de demostración — NO son fotos del evento"*. Copy de una línea arriba de la grilla para que el equipo entienda el cambio sin llamar a nadie.
- **"Usar como portada"** desde la propia selección. El `<select>` de portada queda como accesorio.
- **✕ sobre una foto ya guardada pide confirmación**, indicando cuántos favoritos tiene (dato que ya se puede exponer). Sobre una foto agregada en esta sesión, no. Hoy quitar es un toque sin confirmación en una grilla de 3 columnas usada de parado en el evento.
- El submit se bloquea mientras haya subidas en vuelo (`onBusyChange`); cerrar el sheet con subidas pendientes pide confirmación (`Sheet.tsx:35` cierra con click en el backdrop y `:29` con Escape).
- **Extensión correcta en la descarga**: derivar del `src`/`blob.type` en vez de hardcodear `.jpg` (`PhotoLightbox.tsx:60`). Con WebP subidos, hoy el vecino se baja un archivo que varias galerías no abren.

**Verificación**
```
Circuito completo contra el stack local (con favoritos/descargas ya sembrados en F1):
 1. Abrir "Camino a CCM · Marzo" → se ven las 28 fotos REALES (incluidas g21..g28)
 2. Subir 3 fotos, reordenar una, editar el epígrafe de otra → Guardar
 3. GET /galleries: 31 fotos, los 28 ids originales intactos, los 27 alt no editados intactos
 4. SQL: count(PhotoFavorite)=2, count(PhotoDownload)=1  ← el gate que importa
 5. Quitar con ✕ la foto ph-01 (que tiene 1 favorito y 1 descarga) → aparece la confirmación
    con "1 persona la marcó como favorita" → confirmar → Guardar
 6. SQL: PhotoFavorite baja SOLO el de ph-01 (queda 1); ph-02 sigue
 7. GET /uploads/inexistente.jpg → 404, no 200 HTML
```

---

### F6 — Catálogo: la lista de obras es la selección

**Archivos**: `/tmp/ccm-mi/src/features/admin/OpsCatalogForm.tsx`

**Cambios** (mismo patrón que F5, más lo específico de portfolio)
- La lista "Título y precio por obra" pasa a ser LA selección: miniatura + ✕ + ↑↓ + Reemplazar + **título, epígrafe (`caption`) y precio**.
- Botón **"Subir obras"** con `max = cupo restante`.
- **`IMG_CAP` deja de recortar en silencio.** Al cambiar Tipo de participante (4) a expositor (2), **no se sliceа**: se marcan las obras excedentes y se **bloquea el submit** con "Como expositor el cupo es 2 — quitá 2 obras". Hoy `OpsCatalogForm.tsx:184-189` borra las 2 últimas de los 12 perfiles que tienen 4, sin aviso y sin undo. El selector de Tipo se congela mientras haya subidas en vuelo.
- El early-return mudo del cupo (`:115`) pasa a mostrar un toast.
- El **retrato** (`f.photo`) usa el mismo patrón: preview de lo que hay + "Subir" + "elegir del set" colapsable. Es el mismo bug de raíz que el Hallazgo A, en el campo más visible del catálogo público, y afecta a 13 de 23 perfiles hoy.
- Validar el cupo **también en el server** (`updateCatalogProfile` hoy persiste cualquier cantidad).

**Verificación**
```
 1. Abrir cat-01 (participante, 4 obras con caption) → se ven las 4 obras REALES
    con su caption cargado (hoy no se ven en la grilla y el caption ni se lee)
 2. Cambiar Tipo a expositor → NO se borra nada; el submit queda bloqueado
    con el mensaje de cupo. Volver a participante → sigue con 4.
 3. Subir 1 obra a un expositor con 1 slot libre; elegir 3 archivos
    → la UI corta en 1 ANTES de subir (Network: 1 sola request, no 3)
 4. Guardar → GET /catalog: los caption de las obras preexistentes intactos,
    los ids de portfolio preservados
```

---

### F7 — Verificación end-to-end y documentación

**Archivos**: `/tmp/ccm-mi/RUNBOOK.md`, `/tmp/ccm-mi/README.md` (§Testing dice "0 tests", hay que actualizarlo), `docker-compose.test.yml` (nuevo)

- Documentar el levantado de Postgres local (hoy `README.md:111` dice literalmente que no hay Postgres en el repo y sugiere apuntar a la DB de prod, que es exactamente lo que no queremos que alguien haga para "verificar").
- Correr **el circuito de F5 punto 1-7 con base `/ccm-app/`** a propósito, que es el default del repo, para que el bug de `asset()` no vuelva por la puerta de atrás.
- Anotar en el RUNBOOK: cómo medir el uso del Volume (`du -sh $UPLOAD_DIR`) y qué hacer cuando se llene, más los pasos de `pg_dump` previos a cualquier deploy de F1/F5/F6.

---

## 4. Orden de merge y deploy

1. **F0** (hoy) → congelamiento + dumps.
2. **F1** solo → PR, merge, deploy, `curl` de gate contra prod, levantar congelamiento.
3. **F2 + F3** juntos (ambos son "dejar de destruir" del lado del front y "guardar de verdad") → PR, deploy.
4. **F4** solo → PR, deploy (los 7 call sites existentes no cambian, riesgo bajo).
5. **F5** → PR, deploy, ensayo con una galería real.
6. **F6** → PR, deploy.
7. **F7** → doc + PR final.

Cada deploy con `pg_dump` previo. Nunca dos de estos PRs en vuelo en paralelo sobre los mismos archivos.

---

## 5. Fuera de alcance (explícito, con motivo)

| Ítem | Por qué queda afuera |
|---|---|
| Migrar `PhotoDownload.photoId` a nullable + `SetNull`, o soft-delete de `Photo` | Con F1, el único DELETE restante es deliberado y confirmado en UI. Migración de schema sobre tabla-ledger en prod: riesgo > beneficio. |
| GC / cuarentena de archivos huérfanos en el Volume | F4/F5/F6 atacan las **fuentes** (no subir lo que no entra, abortar al cerrar, guardado awaitable, reemplazo en vez de quitar+subir). El barrido queda como deuda documentada en RUNBOOK con el comando de medición. |
| Aceptar HEIC en el server | El picker de iOS convierte a JPEG con el `accept` actual; el problema real (peso) lo resuelve el downscale en cliente. |
| Reordenar por drag & drop | ↑↓ cubre el caso de uso (orden del desfile) con una fracción del código y funciona bien en mobile. |
| Refactor de los otros 5 delete-all+recreate de `adminService` | Verificado contra el schema: ninguna de esas 5 entidades tiene FKs entrantes. Solo se agrega el comentario que explica por qué `Photo` sí. |
| Endpoint de borrado de uploads / pantalla "archivos subidos" | No hay ningún caso de uso del organizador que lo pida; agrega superficie de borrado destructivo justo cuando estamos cerrando la de fotos. |
| `AnalyticsEvent.payload.photoId` apuntando a fotos borradas | No tiene FK y ninguna vista actual lo usa para joinear. Se anota como deuda para cuando exista "la foto más descargada". |
| Apagar el pool de demo en producción | Decisión de negocio de Gastón, no técnica. F5/F6 lo dejan colapsado y rotulado; la fecha de apagado la define él. |
| Auth/multitenancy del admin, tests del resto de `adminService` | Otro trabajo. |

---

## 6. El gate que decide si esto salió bien

Un solo criterio, medido en SQL, no "se ve bien":

> Con favoritos y descargas sembrados sobre `gal-camino-marzo`, editar la galería desde el admin **cualquier cantidad de veces** —cambiar el título, subir fotos, reordenar, editar epígrafes— deja `count(PhotoFavorite)` y `count(PhotoDownload)` **sin cambios**, y el conjunto de `Photo.id` de las fotos que siguen en la galería **idéntico**. La única forma de que un favorito desaparezca es que un humano haya apretado ✕ sobre esa foto y confirmado.

Todo lo demás de este plan es mejora de producto. Esto es el contrato.