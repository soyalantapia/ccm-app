# PROMPT — Ingesta del Drive de contenido CCM → sistema

> **Cómo usar:** pegá TODO este archivo como primer mensaje en una sesión nueva de Claude Code
> abierta en `~/dev/ccm-app`. El agente hace todo: recorre el Drive, extrae bios + fotos,
> arma un `CatalogProfile` por participante y lo carga en el sistema **uno por uno, ordenado,
> idempotente y verificado**, sin pisar data viva.

---

## 0. Contexto del sistema (leé esto primero)

- **Repo:** `~/dev/ccm-app`. App CCM (Córdoba Corazón de Moda) — PWA Vite/React 19 + backend
  Express/Prisma/Postgres, **un solo servicio Railway** que sirve la SPA + `/api/v1` desde
  `https://ccm-api-production-91a9.up.railway.app`.
- **Modelo destino = `CatalogProfile`** (los "expositores/participantes" del catálogo, ruta
  pública `/catalogo` y `/p/:slug`). Shape canónico (ver `src/data/seed/catalog.ts`):
  ```ts
  {
    id: 'cat-XX',            // secuencial, único
    slug: 'kebab-del-nombre',// único
    name, role, platform, city,
    bio: 'texto',            // @db.Text — resumen curado (ver §3)
    photo: 'img/catalogo/<slug>/perfil.jpg', // path RELATIVO, asset bundleado
    instagram: '@handle',    // opcional
    whatsapp: 'https://wa.me/549...', // opcional (contacto directo del participante)
    verified: false,
    participatesIn: ['CCM 2026'],
    portfolio: [
      { id: 'cat-XX-1', image: 'img/catalogo/<slug>/obra-1.jpg', title, caption?, price? }
    ],
  }
  ```
- **Plataformas CCM (7 mundos):** `Moda`, `Belleza`, `Arte`, `Gastronomía`, `Turismo`,
  `Tecnología`, `Sustentabilidad`. `platform` DEBE ser una de estas (string exacto, con tilde).
- **Imágenes = assets bundleados.** CCM todavía NO tiene storage de imágenes (Fase E, R2/Spaces
  sin decidir). El patrón real del repo es servir imágenes desde `public/img/...` (VITE_BASE=/
  en prod → se sirven en el mismo origen). Por eso las fotos del Drive se **descargan →
  optimizan → guardan en `public/img/catalogo/<slug>/` → se referencian con path relativo** y
  se publican con el deploy del front. (Mismo mecanismo que los banners de sponsors.)
- **Persistencia idempotente.** `server/prisma/seed.ts` hace `catalogProfile.upsert({where:{id}})`
  y sólo `deleteMany` del portfolio **de ese id** → agregar perfiles nuevos (ids `cat-13+`) NO
  toca los existentes. Igual, para la DB de PROD **no corras el seed completo** (re-siembra
  sponsors/events/etc. y podría resetear ediciones vivas): a prod se carga vía **admin API**
  (`POST /api/v1/admin/catalog`), que sólo agrega.

---

## 1. Fuente: carpeta de Drive

Carpeta raíz: `https://drive.google.com/drive/folders/1JcPwitPPPm2ZNV0snpTqcHzL37-1-c6-`
(ID `1JcPwitPPPm2ZNV0snpTqcHzL37-1-c6-`). Usá las tools `mcp__google-drive__*`
(listFolder, downloadFile, readTextFile). **Google Docs API está deshabilitada** → NO uses
`getGoogleDocContent`; los bios son `.docx`/`.pdf`: descargá y extraé texto con
`textutil -convert txt -stdout <f>.docx` y `pdftotext -layout <f>.pdf -`.

**Estructura (relevada 2026-07-18 — RE-RECORRÉ por si cambió):** 4 categorías, cada participante
en su propia subcarpeta con fotos y/o un bio doc:

- **ARTE** → `role`≈"Artista" (afiná desde el bio: "Artista plástica", "Fotógrafo/a", etc.),
  `platform: 'Arte'`. Carpetas: Alvaro Moyano *(vacía)*, **Carolina Curti** (3 fotos; su bio está
  **suelto en la raíz**: `bio carolina curti.docx`), Jorgelina Terreno (4 fotos), Marcela Blangino
  (3 fotos de evento), María Laura Lobo (3 fotos), Mauro Kruger *(vacía)*, Miguel Santos (3 fotos),
  Victoria Molina (4 fotos).
- **DISEÑADORES** → `role`≈"Diseñador/a" (o "Modista" si el bio lo dice), `platform: 'Moda'`.
  Carpetas: Andrea Destefani (3 fotos + bio PDF), Dahyana Funes (bio docx), Giovanni Textil (bio docx).
- **EMPRESAS** → `role: 'Marca'`, `platform` **inferida del producto** (Gin Capicúa→`Gastronomía`,
  Buen Olivo→`Gastronomía`, Impacto Textil→`Moda` o `Sustentabilidad`, Piekna→inferir, Ryoma→inferir).
  Carpetas: Buen Olivo *(vacía)*, Gin Capicúa (bio docx), Impacto Textil *(vacía)*, Piekna (bio docx),
  Ryoma (bio docx + 2 fotos).
- **SPEAKER** → *vacía* (sin contenido aún; ignorá salvo que aparezca contenido al re-recorrer).

> **Los IDs de Drive de arriba pueden cambiar** — obtenelos con `listFolder` en vivo, no los hardcodees.

---

## 2. Formato de los bios (2 variantes)

**A · Simple** (ej. `bio carolina curti.docx`): un párrafo "BIO PARA CCM". Traé nombre,
disciplina, **ciudad** ("radicada en Villa Constitución, Santa Fe"), trayectoria.

**B · Template estructurado** (`BIOGRAFIAS_MARCA_CCM2026*.docx/pdf` y `CARO 2026 Ryoma.docx`):
secciones **BIOGRAFÍA PERSONAL · TITULAR 1** (a veces TITULAR 2 si la marca tiene 2 socios),
**HISTORIA DE LA MARCA**, **EL PRODUCTO**. Cada sección cierra con **"Resumen en 2 líneas"** —
el propio doc dice: *"ese es el que usamos para el contenido visual y el magazine"*. El footer
(`Equipo MKT CCM · 351 623-6060 · CCM2026@mabel.com.ar`) es del equipo, **NO** del participante:
no lo cargues como contacto.

**Mapeo de campos:**
- `bio` (el que se muestra en la ficha) = **"Resumen en 2 líneas" de la BIOGRAFÍA PERSONAL** si
  existe (template B); si no, el párrafo "BIO PARA CCM" recortado a 1–3 oraciones (formato A).
- `city` = de dónde es/vive (parseá del texto: "Vivo en la ciudad de Mendoza", "radicada en…").
- `role`/`platform` = por categoría (§1), afinado con el bio.
- Guardá el **texto completo** (personal + historia de marca + producto + los 3 resúmenes) en el
  manifest (§5) — sirve después para Notas/magazine, pero NO va en `CatalogProfile.bio`.
- `instagram`/`whatsapp`: **los bios NO los traen.** Dejalos vacíos y FLAGGEALOS (§6). No inventes.

---

## 3. Pipeline de imágenes

Por cada foto de la carpeta del participante:
1. `mcp__google-drive__downloadFile` a `/tmp/ccm-ingesta/<slug>/<archivo original>`.
   Detectá el mimeType real por metadata (hay archivos sin extensión y dobles como `.jpg.png`).
2. Optimizá con `sharp` (ya está en devDependencies; mirá `scripts/optimize-images.mjs`):
   redimensioná el lado mayor a ~1600px, calidad ~80, quitá metadata, convertí a `.jpg` (o `.webp`).
3. Guardá en `~/dev/ccm-app/public/img/catalogo/<slug>/`:
   - **1ª foto (o la más "de retrato")** → `perfil.jpg` → `photo: 'img/catalogo/<slug>/perfil.jpg'`.
   - resto → `obra-1.jpg`, `obra-2.jpg`, … → cada una un `portfolio[]` item.
4. `portfolio[].title`: los bios NO dan títulos/precios por imagen → usá algo sobrio
   (`"<Marca/Nombre> — obra 1"`) y **sin `price`** (es opcional). Flaggealo para curaduría (§6).
   Si el participante no tiene fotos, `portfolio: []` y usá una `photo` placeholder on-brand
   (o dejá `photo` apuntando a un genérico y flaggealo).

---

## 4. Carga en el sistema (ordenada, uno por uno, idempotente)

Procesá **por categoría y alfabético**, un participante por vez. Para cada uno:

1. **Slug/id:** `slug` = kebab del nombre; `id` = `cat-<n>` siguiente (mirá el máximo actual en
   `src/data/seed/catalog.ts`, hoy llega a `cat-12`).
2. **Idempotencia:** `GET /api/v1/catalog` (prod) y `grep` en `seed/catalog.ts`. Si el slug ya
   existe → **actualizá** (no dupliques). Si no → crear.
3. **Versionado (fuente de verdad):** agregá el objeto `CatalogProfile` a
   `src/data/seed/catalog.ts` (respetando el formato exacto del archivo).
4. **Prod (vivo, sin re-seed destructivo):** cargá vía admin API. Obtené el token con
   `railway variables` (el usuario está logueado en Railway; buscá `ADMIN_TOKEN`), y hacé:
   ```
   POST https://ccm-api-production-91a9.up.railway.app/api/v1/admin/catalog
   Authorization: Bearer <ADMIN_TOKEN>
   Content-Type: application/json
   <el objeto CatalogProfile, con id/slug ya resueltos>
   ```
   (para editar uno existente: `PATCH /api/v1/admin/catalog/:id`).
5. **Log:** imprimí una línea por participante:
   `✓ cat-13 giovanni-textil (Moda) — bio✓ fotos:0 ig:∅ wa:∅ → seed + prod OK`.

**Orden global:** (a) recorré Drive y armá el plan/manifest (§5) → (b) mostralo y PARÁ para
confirmar el mapeo (plataformas ambiguas, carpetas vacías) → (c) descargá+optimizá imágenes →
(d) escribí seed + `npx tsc -b` (gate) → (e) commit de assets+seed → (f) `railway up --path-as-root .
-s ccm-api -c` (deploy, para que resuelvan los assets) → (g) POST/PATCH a prod uno por uno →
(h) verificá (§7) → (i) reporte final (§6).

---

## 5. Manifest (trazabilidad)

Antes de escribir nada, generá `work-agent/ingesta-drive-manifest.json` con un objeto por
participante: `{ categoria, carpetaDriveId, nombre, slug, idPropuesto, role, platform, city,
bioResumen, bioCompleto, instagram:null, whatsapp:null, fotos:[{driveId, nombre}], estado }`.
Es la fuente para cargar y para el reporte. Actualizá `estado` (`cargado`/`parcial`/`vacio`/`error`)
a medida que avanzás.

---

## 6. Reporte final + gaps (crítico)

Los datos están **incompletos y cruzados** — el reporte tiene que ser honesto:
- **Cargados completos** (bio + fotos).
- **Parciales** — enumerá QUÉ falta por participante:
  - ARTE (Jorgelina, María Laura, Miguel, Victoria, Marcela): **tienen fotos, falta bio**.
  - DISEÑADORES/EMPRESAS (Dahyana, Giovanni, Gin Capicúa, Piekna): **tienen bio, faltan fotos**.
  - **TODOS: falta Instagram y WhatsApp** (ningún bio los trae) — es data clave para el contacto
    directo del participante en la ficha. Pedísela al equipo.
  - Portfolio: faltan **títulos y precios por obra** (curaduría).
- **Vacías (no cargar, sólo listar):** Alvaro Moyano, Mauro Kruger, Buen Olivo, Impacto Textil,
  y la categoría SPEAKER entera.
- **Decisiones a confirmar con el usuario:** plataforma de las EMPRESAS ambiguas
  (Impacto Textil = ¿Moda o Sustentabilidad?, Piekna/Ryoma = inferir del bio y confirmar);
  qué hacer con los ARTE sin bio (¿cargar con bio mínima "en preparación" o esperar?).

---

## 7. Verificación

- Server + front typecheck (`cd server && npm run typecheck` y `npx tsc -b`) en verde.
- Por cada perfil cargado: `GET /api/v1/catalog/<slug>` (prod) devuelve el objeto correcto.
- Abrí el browser en `https://ccm-api-production-91a9.up.railway.app/catalogo` y confirmá que
  los nuevos participantes aparecen agrupados en su plataforma; abrí 1–2 fichas `/p/<slug>` y
  verificá foto + bio + portfolio. Sacá screenshot como prueba.
- Confirmá que las imágenes cargan (no roto): las rutas `img/catalogo/<slug>/…` se sirven desde
  el mismo origen tras el deploy.

---

## 8. Guardrails (no te los saltees)

- **Idempotente y no destructivo:** nunca corras `npm run db:seed` contra PROD; nunca borres ni
  pises perfiles existentes; POST sólo lo nuevo, PATCH lo que cambió.
- **Dry-run primero:** mostrá el manifest/plan y esperá OK antes de descargar imágenes, commitear
  o deployar.
- **No inventes** contactos, precios, ni narrativa de bio que no esté en el Drive. Si falta, se
  flaggea, no se rellena.
- **Español rioplatense** en todo lo visible (roles, captions, reporte).
- Deploy = outward-facing: confirmá antes de `railway up` y de los POST a prod.
- Si una plataforma no encaja en los 7 mundos, PARÁ y preguntá — no inventes una nueva.
