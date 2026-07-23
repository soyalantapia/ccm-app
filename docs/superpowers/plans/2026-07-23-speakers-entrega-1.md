# Speakers · Entrega 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Micaela pueda cargar speakers con foto y frase desde la ficha de la persona, y que tengan su pestaña pública propia agrupada por evento, sin mezclarse con el catálogo de participantes.

**Architecture:** Dos ejes ortogonales sobre el catálogo existente. `CatalogProfile.kind` (String, ya existe) suma el valor `speaker`; una tabla puente nueva `EventSpeaker` vincula persona↔evento (con bloque opcional). "Ser speaker" = tener ≥1 fila en `EventSpeaker`. Se reusa el patrón probado de `EventSponsor` y las tarjetas del catálogo.

**Tech Stack:** Express + Prisma + Postgres (server/), React 19 + Vite + Tailwind 4 (raíz), Vitest.

## Global Constraints

- **Rama y worktree:** `feat/speakers` en `/Users/alannaimtapia/dev/ccm-speakers`, sale de `origin/main` (`cc7bcac`). NO trabajar en `~/dev/ccm-seed` ni en otros worktrees.
- **Tipos compartidos:** front y back comparten `src/data/types.ts`. El server lo importa como `@domain/types` (`server/tsconfig.json:12` → `../src/data/types.ts`). Cambiar el tipo `CatalogProfile` ahí afecta a los dos lados: es correcto y es un solo lugar.
- **Migración:** nombrar con prefijo que ordene al final. El repo usa `9z…` (`9z_payment_kind_event`, `9z2_event_capacity`, `9z3_event_parent`) porque Prisma ordena las migraciones lexicográficamente y este proyecto ya se mordió con eso. Usar `9z4_event_speaker`.
- **Base local para probar:** API `http://localhost:4030`, base `ccm_local` (sembrada). El `.env` del server ya existe con `DATABASE_URL="postgresql://alannaimtapia@localhost:5432/ccm_local"`. Prohibido tocar producción salvo GET.
- **Typecheck:** front `npx tsc -b` desde la raíz; server `cd server && npx tsc --noEmit -p tsconfig.json`.
- **Tests:** `cd server && npx vitest run` (server), `npx vitest run` desde la raíz (front).
- **Commits:** terminar el mensaje con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Copy de marca:** los speakers se muestran al público como "Corazones que inspiran"; la frase de cada uno se llama "Frase" en el panel.

## File Structure

**Se modifican:**
- `src/data/types.ts` — `CatalogProfile.kind` suma `'speaker'`; nuevo campo opcional `quote?: string`; nuevo tipo `SpeakerAppearance` y el shape de "speakers por evento".
- `server/prisma/schema.prisma` — modelo `EventSpeaker`; campo `quote` en `CatalogProfile`; relaciones inversas en `Event`, `EventBlock`, `CatalogProfile`.
- `server/prisma/migrations/9z4_event_speaker/migration.sql` — **crear**.
- `server/src/lib/serialize.ts` — arreglar la ternaria de `kind` (whitelist de 3) + serializar `quote`; nuevo `toSpeakersByEvent`.
- `server/src/services/adminService.ts` — `createCatalogProfile` y `updateCatalogProfile` aceptan `quote` y las apariciones de speaker.
- `server/src/services/catalogService.ts` — `getSpeakersByEvent()`.
- `server/src/routes/catalog.ts` — `GET /api/v1/speakers`.
- `src/features/admin/OpsCatalogForm.tsx` — opción Speaker en el `kind`, campo Frase, bloque "¿En qué eventos habla?", `IMG_CAP`.
- `src/data/store/RemoteDataStore.ts` + `src/data/store/LocalDataStore.ts` + `src/data/store/DataStore.ts` — `getSpeakersByEvent()` en el contrato y las dos implementaciones.
- `src/pages/Catalogo.tsx` — excluir `kind === 'speaker'`.
- `src/App.tsx` — ruta `/speakers`.
- `src/components/layout/SiteLayout.tsx` (o donde viva el nav público) — ítem "Speakers".

**Se crean:**
- `src/pages/Speakers.tsx` — la pestaña pública.
- `server/prisma/migrations/9z4_event_speaker/migration.sql`.

---

### Task 1: Arreglar el serializador de `kind` (bloqueante, va primero)

Hoy `toCatalogProfile` colapsa cualquier `kind` que no sea `'expositor'` a `'participante'` (`serialize.ts:151`). Sin este arreglo, un `kind: 'speaker'` guardado en la base sale como `participante` y toda la feature falla en silencio. Se hace primero y aislado.

**Files:**
- Modify: `server/src/lib/serialize.ts:151`
- Modify: `src/data/types.ts:159` (el tipo)
- Test: `server/src/services/serialize.speaker.test.ts` (crear)

**Interfaces:**
- Produces: `toCatalogProfile` sigue con la misma firma; ahora preserva `kind: 'speaker'`. El tipo `CatalogProfile['kind']` pasa a `'participante' | 'expositor' | 'speaker'`.

- [ ] **Step 1: Ampliar el tipo del front**

En `src/data/types.ts`, reemplazar la línea del comentario + el campo `kind` del `CatalogProfile`:

```ts
  /** participante | expositor | speaker. Distinto cupo de imágenes + "cuenta proyectos" (expositor).
   *  speaker no aparece en el catálogo público de participantes; vive en /speakers. */
  kind?: 'participante' | 'expositor' | 'speaker'
```

- [ ] **Step 2: Write the failing test**

Crear `server/src/services/serialize.speaker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toCatalogProfile } from '../lib/serialize.js'

const base = {
  id: 'cat-x', slug: 'x', name: 'X', role: 'Speaker', platform: 'Moda',
  city: 'Córdoba', bio: 'b', projects: null, photo: 'p', instagram: null,
  whatsapp: null, verified: false, participatesIn: [], quote: null,
  createdAt: new Date(), updatedAt: new Date(),
}

describe('toCatalogProfile — preserva el kind speaker', () => {
  it('un kind speaker NO se colapsa a participante', () => {
    expect(toCatalogProfile({ ...base, kind: 'speaker' }).kind).toBe('speaker')
  })
  it('expositor sigue siendo expositor', () => {
    expect(toCatalogProfile({ ...base, kind: 'expositor' }).kind).toBe('expositor')
  })
  it('un valor desconocido cae a participante (fallback seguro)', () => {
    expect(toCatalogProfile({ ...base, kind: 'basura' as never }).kind).toBe('participante')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/serialize.speaker.test.ts`
Expected: FAIL en el primer caso — `expected 'participante' to be 'speaker'`.

- [ ] **Step 4: Arreglar la ternaria**

En `server/src/lib/serialize.ts:151`, reemplazar:

```ts
    kind: c.kind === 'expositor' ? 'expositor' : 'participante',
```

por:

```ts
    // Whitelist de 3. La ternaria vieja (=== 'expositor' ? … : 'participante') colapsaba
    // 'speaker' a 'participante' en silencio y rompía la sección entera.
    kind: c.kind === 'expositor' || c.kind === 'speaker' ? c.kind : 'participante',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/serialize.speaker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck server**

Run: `cd server && npx tsc --noEmit -p tsconfig.json`
Expected: sin salida (limpio). El test usa `quote: null` que todavía no está en el schema Prisma pero sí en el mock literal, así que no rompe.

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/serialize.ts server/src/services/serialize.speaker.test.ts src/data/types.ts
git commit -m "fix(catalogo): el serializador ya no colapsa kind:speaker a participante

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Schema — campo `quote` y tabla `EventSpeaker` + migración

**Files:**
- Modify: `server/prisma/schema.prisma` (model `CatalogProfile`, `Event`, `EventBlock`; nuevo model `EventSpeaker`)
- Create: `server/prisma/migrations/9z4_event_speaker/migration.sql`

**Interfaces:**
- Produces: modelo Prisma `EventSpeaker { eventId, profileId, blockId?, order }`; campo `CatalogProfile.quote String?`. Relaciones inversas `Event.speakers`, `EventBlock.speakerLinks`, `CatalogProfile.speakerAppearances`.

- [ ] **Step 1: Agregar `quote` a CatalogProfile**

En `server/prisma/schema.prisma`, dentro de `model CatalogProfile`, después de la línea `participatesIn String[]`:

```prisma
  quote          String?  @db.Text // "Corazón que inspira": frase propia del speaker
```

Y en el mismo modelo, después de `portfolio PortfolioPiece[]`:

```prisma
  speakerAppearances EventSpeaker[]
```

- [ ] **Step 2: Agregar la relación inversa en Event y EventBlock**

En `model Event`, junto a `sponsors EventSponsor[]`:

```prisma
  speakers      EventSpeaker[]
```

En `model EventBlock`, agregar la relación inversa (buscar el modelo y sumar dentro de las relaciones):

```prisma
  speakerLinks  EventSpeaker[]
```

- [ ] **Step 3: Definir el modelo EventSpeaker**

Agregar al final del schema, siguiendo el patrón de `EventSponsor`:

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

- [ ] **Step 4: Generar el cliente Prisma y verificar que el schema es válido**

Run: `cd server && npx prisma generate`
Expected: `✔ Generated Prisma Client`. Si tira error de relación, revisar que las tres relaciones inversas (`Event.speakers`, `EventBlock.speakerLinks`, `CatalogProfile.speakerAppearances`) estén.

- [ ] **Step 5: Crear la migración a mano**

Crear `server/prisma/migrations/9z4_event_speaker/migration.sql`:

```sql
-- Frase del speaker ("Corazón que inspira")
ALTER TABLE "CatalogProfile" ADD COLUMN "quote" TEXT;

-- Tabla puente evento ↔ persona del catálogo (con bloque opcional)
CREATE TABLE "EventSpeaker" (
    "eventId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "blockId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EventSpeaker_pkey" PRIMARY KEY ("eventId","profileId","blockId")
);

CREATE INDEX "EventSpeaker_eventId_idx" ON "EventSpeaker"("eventId");
CREATE INDEX "EventSpeaker_profileId_idx" ON "EventSpeaker"("profileId");

ALTER TABLE "EventSpeaker" ADD CONSTRAINT "EventSpeaker_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSpeaker" ADD CONSTRAINT "EventSpeaker_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "CatalogProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSpeaker" ADD CONSTRAINT "EventSpeaker_blockId_fkey"
    FOREIGN KEY ("blockId") REFERENCES "EventBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> ⚠️ Nota sobre la PK: Postgres permite filas con `blockId = NULL` repetidas bajo una PK compuesta que incluye la columna nullable (dos NULL son distintos). Para esta entrega alcanza — un evento sin grilla tendrá una fila por persona y no se re-inserta la misma. Si más adelante se necesita impedir el duplicado exacto con `blockId` null, se agrega un índice único parcial. No se hace ahora (YAGNI).

- [ ] **Step 6: Aplicar la migración a la base local**

Run: `cd server && npx prisma migrate deploy`
Expected: `Applying migration 9z4_event_speaker` y `All migrations have been successfully applied.`

- [ ] **Step 7: Verificar la tabla en la base**

Run: `PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH" psql -h localhost -d ccm_local -c '\d "EventSpeaker"'`
Expected: la tabla con las 4 columnas, la PK compuesta y los 2 índices.

- [ ] **Step 8: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/9z4_event_speaker/
git commit -m "feat(schema): tabla EventSpeaker + campo quote en CatalogProfile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Backend — serializar `quote`, tipos, y `getSpeakersByEvent()`

**Files:**
- Modify: `server/src/lib/serialize.ts` (agregar `quote` a `toCatalogProfile`; nuevo `toSpeakersByEvent`)
- Modify: `src/data/types.ts` (agregar `quote` a `CatalogProfile`; nuevos tipos `SpeakerAppearance`, `SpeakersByEvent`)
- Modify: `server/src/services/catalogService.ts` (`getSpeakersByEvent`)
- Modify: `server/src/routes/catalog.ts` (`GET /speakers`)
- Test: `server/src/services/catalogService.speakers.test.ts` (crear)

**Interfaces:**
- Consumes: `toCatalogProfile` (Task 1), modelo `EventSpeaker` (Task 2).
- Produces:
  - `CatalogProfile.quote?: string`
  - `interface SpeakersByEvent { eventId: string; eventTitle: string; eventDate: string; speakers: CatalogProfile[] }`
  - `catalogService.getSpeakersByEvent(): Promise<SpeakersByEvent[]>`
  - `GET /api/v1/speakers` → `SpeakersByEvent[]`

- [ ] **Step 1: Agregar `quote` al tipo del front**

En `src/data/types.ts`, dentro de `CatalogProfile`, después de `participatesIn: string[]`:

```ts
  /** "Corazón que inspira": frase propia del speaker. */
  quote?: string
```

Y agregar los tipos nuevos después del `interface CatalogProfile { … }`:

```ts
/** Una persona del catálogo que habla en un evento, tal como la ve /speakers. */
export interface SpeakersByEvent {
  eventId: string
  eventTitle: string
  eventDate: string // startDate ISO, para ordenar
  speakers: CatalogProfile[]
}
```

- [ ] **Step 2: Serializar `quote`**

En `server/src/lib/serialize.ts`, dentro de `toCatalogProfile`, después de la línea `participatesIn: c.participatesIn,`:

```ts
    ...(c.quote ? { quote: c.quote } : {}),
```

- [ ] **Step 3: Write the failing test**

Crear `server/src/services/catalogService.speakers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = {
  event: { findMany: vi.fn() },
}
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { getSpeakersByEvent } = await import('./catalogService.js')

const perfil = (id: string, name: string) => ({
  id, slug: id, name, role: 'Speaker', kind: 'speaker', platform: 'Moda',
  city: 'Córdoba', bio: 'b', projects: null, photo: 'p', instagram: null,
  whatsapp: null, verified: true, participatesIn: [], quote: 'Inspiro',
  portfolio: [], createdAt: new Date(), updatedAt: new Date(),
})

beforeEach(() => {
  vi.clearAllMocks()
  // Dos eventos publicados; el más nuevo primero (orden desc por fecha).
  mockPrisma.event.findMany.mockResolvedValue([
    {
      id: 'ev-2026', title: 'CCM 2026', startDate: '2026-09-19', published: true,
      speakers: [{ profile: perfil('cat-1', 'Carolina'), order: 0 }],
    },
    {
      id: 'ev-2025', title: 'CCM 2025', startDate: '2025-09-20', published: true,
      speakers: [{ profile: perfil('cat-2', 'Marcos'), order: 0 }],
    },
  ])
})

describe('getSpeakersByEvent', () => {
  it('agrupa por evento y devuelve el perfil serializado', async () => {
    const out = await getSpeakersByEvent()
    expect(out).toHaveLength(2)
    expect(out[0].eventId).toBe('ev-2026')
    expect(out[0].speakers[0].name).toBe('Carolina')
    expect(out[0].speakers[0].quote).toBe('Inspiro')
  })

  it('no incluye eventos sin speakers', async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      { id: 'ev-vacio', title: 'Vacío', startDate: '2026-01-01', published: true, speakers: [] },
    ])
    expect(await getSpeakersByEvent()).toEqual([])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/catalogService.speakers.test.ts`
Expected: FAIL — `getSpeakersByEvent is not a function`.

- [ ] **Step 5: Implementar `getSpeakersByEvent`**

En `server/src/services/catalogService.ts`, agregar el import del tipo al `import type { … } from '@domain/types'` (sumar `SpeakersByEvent`), y después de `getCatalogProfile`:

```ts
/**
 * Speakers agrupados por evento, para la pestaña pública /speakers.
 * Un speaker es cualquier CatalogProfile con ≥1 fila EventSpeaker. Sólo eventos publicados.
 * Orden: eventos por fecha descendente (la edición vigente arriba); speakers por su `order`.
 */
export async function getSpeakersByEvent(): Promise<SpeakersByEvent[]> {
  const rows = await prisma.event.findMany({
    where: { published: true, speakers: { some: {} } },
    orderBy: { startDate: 'desc' },
    include: {
      speakers: {
        orderBy: { order: 'asc' },
        include: { profile: { include: { portfolio: { orderBy: { order: 'asc' } } } } },
      },
    },
  })
  // Un perfil puede tener varias filas en el mismo evento (uno por bloque): se deduplica por id.
  return rows.map((ev) => {
    const vistos = new Set<string>()
    const speakers = ev.speakers
      .map((s) => s.profile)
      .filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
      .map(toCatalogProfile)
    return { eventId: ev.id, eventTitle: ev.title, eventDate: String(ev.startDate), speakers }
  })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/catalogService.speakers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Exponer la ruta pública**

En `server/src/routes/catalog.ts`, después de la ruta `GET /catalog/:slug` (para que `/speakers` no sea capturado como slug — igual criterio que `with-blocks` en events.ts):

```ts
/** GET /api/v1/speakers — speakers agrupados por evento. Público. */
catalogRouter.get('/speakers', async (_req, res, next) => {
  try {
    res.json(await catalogService.getSpeakersByEvent())
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 8: Typecheck + prueba en vivo**

Run: `cd server && npx tsc --noEmit -p tsconfig.json`
Expected: limpio.

Con el stack local corriendo (`npm run dev` en server/):
Run: `curl -s http://localhost:4030/api/v1/speakers`
Expected: `[]` (todavía no hay ninguna fila EventSpeaker cargada — es correcto).

- [ ] **Step 9: Commit**

```bash
git add server/src/lib/serialize.ts server/src/services/catalogService.ts server/src/services/catalogService.speakers.test.ts server/src/routes/catalog.ts src/data/types.ts
git commit -m "feat(speakers): quote serializado + GET /speakers agrupado por evento

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Backend — persistir `quote` y las apariciones de speaker en el admin

Que crear/editar un perfil guarde la frase, y que se puedan escribir/reemplazar las filas `EventSpeaker` de ese perfil. La ficha de la persona es la puerta principal de carga.

**Files:**
- Modify: `src/data/types.ts` (`NewCatalogProfile` ya deriva de `CatalogProfile`; agregar el shape de apariciones al input del perfil)
- Modify: `server/src/services/adminService.ts` (`createCatalogProfile`, `updateCatalogProfile`)
- Modify: `server/src/routes/catalog.ts` o el router admin donde se validan los campos (si hay zod)
- Test: `server/src/services/adminService.speakers.test.ts` (crear)

**Interfaces:**
- Consumes: modelo `EventSpeaker` (Task 2).
- Produces: `updateCatalogProfile(id, patch)` y `createCatalogProfile(c)` aceptan `quote?: string` y `speakerAppearances?: { eventId: string; blockId: string | null }[]`. Cuando `speakerAppearances` viene definido, se **reemplaza** el set completo de filas de ese perfil (deleteMany + createMany), igual patrón que portfolio.

- [ ] **Step 1: Agregar el shape de apariciones al tipo de input**

En `src/data/types.ts`, después del `interface CatalogProfile`:

```ts
/** Una aparición de un speaker: en qué evento (y opcionalmente qué bloque) habla. */
export interface SpeakerAppearanceInput {
  eventId: string
  blockId: string | null
}
```

Y extender `NewCatalogProfile` / el patch. Como `NewCatalogProfile = Omit<CatalogProfile, 'id'|'slug'> & { slug?: string }` (DataStore.ts:57), agregar el campo opcional al `CatalogProfile` haría que forme parte del payload. En su lugar, declarar el campo como opcional NO persistido en el tipo de dominio y sí en el input del store — para no ensuciar el tipo público, agregar en `DataStore.ts`:

```ts
export type CatalogSpeakerAppearances = { speakerAppearances?: SpeakerAppearanceInput[] }
```

y que `createCatalogProfile`/`updateCatalogProfile` del contrato acepten `NewCatalogProfile & CatalogSpeakerAppearances` / `Partial<CatalogProfile> & CatalogSpeakerAppearances`. (Ver Task 5 para el cableado del store; acá sólo se define el tipo.)

- [ ] **Step 2: Write the failing test**

Crear `server/src/services/adminService.speakers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = {
  catalogProfile: { update: vi.fn() },
  eventSpeaker: { deleteMany: vi.fn(), createMany: vi.fn() },
  $queryRaw: vi.fn(),
  portfolioPiece: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), createMany: vi.fn() },
}
const mockPrisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  catalogProfile: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'cat-1', portfolio: [] }) },
}
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))
const { updateCatalogProfile } = await import('./adminService.js')

beforeEach(() => vi.clearAllMocks())

describe('updateCatalogProfile — apariciones de speaker', () => {
  it('reemplaza las filas EventSpeaker cuando viene speakerAppearances', async () => {
    await updateCatalogProfile('cat-1', {
      quote: 'Inspiro',
      speakerAppearances: [{ eventId: 'ev-2026', blockId: null }],
    } as never)
    expect(tx.eventSpeaker.deleteMany).toHaveBeenCalledWith({ where: { profileId: 'cat-1' } })
    expect(tx.eventSpeaker.createMany).toHaveBeenCalledWith({
      data: [{ eventId: 'ev-2026', profileId: 'cat-1', blockId: null, order: 0 }],
    })
  })

  it('NO toca EventSpeaker si speakerAppearances es undefined', async () => {
    await updateCatalogProfile('cat-1', { name: 'X' } as never)
    expect(tx.eventSpeaker.deleteMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/adminService.speakers.test.ts`
Expected: FAIL — `deleteMany` no fue llamado (el servicio todavía no maneja apariciones).

- [ ] **Step 4: Manejar `quote` en el allowlist y las apariciones**

En `server/src/services/adminService.ts`:

En `createCatalogProfile`, agregar `quote: c.quote ?? null,` al `data: { … }` del `catalogProfile.create`, y después de crear el portfolio:

```ts
  if ('speakerAppearances' in c && Array.isArray((c as { speakerAppearances?: unknown }).speakerAppearances)) {
    const apps = (c as { speakerAppearances: { eventId: string; blockId: string | null }[] }).speakerAppearances
    if (apps.length) await prisma.eventSpeaker.createMany({
      data: apps.map((a, i) => ({ eventId: a.eventId, profileId: c.id, blockId: a.blockId, order: i })),
    })
  }
```

En `updateCatalogProfile`, sumar `'quote'` a la allowlist de campos (la línea del `for (const k of [...])`):

```ts
  for (const k of ['slug', 'name', 'role', 'kind', 'platform', 'city', 'bio', 'projects', 'photo', 'instagram', 'whatsapp', 'verified', 'participatesIn', 'quote'] as const) if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
```

Y dentro de la `$transaction`, después del bloque de `portfolio`, agregar (usando `tx`):

```ts
    // Reemplazo total del set de apariciones, igual criterio que portfolio: si el payload
    // trae speakerAppearances (aunque sea []), es la verdad completa para este perfil.
    const apps = (patch as { speakerAppearances?: { eventId: string; blockId: string | null }[] }).speakerAppearances
    if (apps !== undefined) {
      await tx.eventSpeaker.deleteMany({ where: { profileId: id } })
      if (apps.length) await tx.eventSpeaker.createMany({
        data: apps.map((a, i) => ({ eventId: a.eventId, profileId: id, blockId: a.blockId, order: i })),
      })
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/adminService.speakers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Correr toda la suite del server (regresión)**

Run: `cd server && npx vitest run`
Expected: todo verde. Si `adminService.test.ts` mockea `catalogProfile` sin `eventSpeaker`, agregar `eventSpeaker: { deleteMany: vi.fn(), createMany: vi.fn() }` a su mock — pero sólo si esa suite toca `updateCatalogProfile` con apariciones (no debería, porque el patch de esos tests no las trae y el bloque queda inerte).

- [ ] **Step 7: Typecheck**

Run: `cd server && npx tsc --noEmit -p tsconfig.json` y `npx tsc -b` (raíz)
Expected: limpio.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/adminService.ts server/src/services/adminService.speakers.test.ts src/data/types.ts src/data/store/DataStore.ts
git commit -m "feat(admin): persistir quote y apariciones de speaker al guardar un perfil

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Store — `getSpeakersByEvent()` y el input de apariciones en las dos implementaciones

**Files:**
- Modify: `src/data/store/DataStore.ts` (contrato)
- Modify: `src/data/store/RemoteDataStore.ts`
- Modify: `src/data/store/LocalDataStore.ts`
- Test: `src/data/store/RemoteDataStore.speakers.test.ts` (crear)

**Interfaces:**
- Consumes: `GET /api/v1/speakers` (Task 3), `SpeakersByEvent` (Task 3), `SpeakerAppearanceInput` (Task 4).
- Produces: `store.getSpeakersByEvent(): SpeakersByEvent[]` (síncrono, hidratado del backend). Los métodos `createCatalogProfile`/`updateCatalogProfile` aceptan `speakerAppearances` en el input y lo mandan al backend.

- [ ] **Step 1: Ampliar el contrato**

En `src/data/store/DataStore.ts`, en el import de tipos sumar `SpeakersByEvent`, `SpeakerAppearanceInput`, y en la interfaz `DataStore`, junto a `getCatalog()`:

```ts
  getSpeakersByEvent(): SpeakersByEvent[]
```

Cambiar las firmas de catálogo para aceptar apariciones:

```ts
  createCatalogProfile(input: NewCatalogProfile & { speakerAppearances?: SpeakerAppearanceInput[] }): CatalogProfile
  updateCatalogProfile(id: string, patch: Partial<CatalogProfile> & { speakerAppearances?: SpeakerAppearanceInput[] }): void
```

- [ ] **Step 2: Write the failing test**

Crear `src/data/store/RemoteDataStore.speakers.test.ts`, siguiendo el patrón de `RemoteDataStore.test.ts` (fetch stubeado, storage en memoria):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'

let store: Record<string, string> = {}
function mem(): Storage {
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] }, clear: () => { store = {} },
    key: (i) => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length } } as Storage
}
const SPEAKERS = [{ eventId: 'ev-2026', eventTitle: 'CCM 2026', eventDate: '2026-09-19', speakers: [] }]

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', mem()); vi.stubGlobal('sessionStorage', mem())
  vi.stubGlobal('fetch', vi.fn((url: string) =>
    Promise.resolve({ ok: true, status: 200, json: () =>
      Promise.resolve(String(url).endsWith('/speakers') ? SPEAKERS
        : String(url).endsWith('/devices') ? { deviceId: 'd', token: 't' } : []) })))
})
afterEach(() => vi.unstubAllGlobals())

describe('RemoteDataStore — speakers', () => {
  it('hidrata /speakers y lo devuelve sincrónico', async () => {
    const s = new RemoteDataStore('https://api.test')
    await vi.waitFor(() => expect(s.getSpeakersByEvent()).toHaveLength(1))
    expect(s.getSpeakersByEvent()[0].eventTitle).toBe('CCM 2026')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/data/store/RemoteDataStore.speakers.test.ts`
Expected: FAIL — `getSpeakersByEvent is not a function`.

- [ ] **Step 4: Implementar en RemoteDataStore**

En `src/data/store/RemoteDataStore.ts`: agregar el cache privado junto a `private catalog?`:

```ts
  private speakersByEvent?: SpeakersByEvent[]
```

En el bootstrap donde se hidratan las colecciones (junto al `refetch` de `/catalog`, ~línea 580):

```ts
    this.refetch<SpeakersByEvent[]>('/speakers', (s) => (this.speakersByEvent = s), 'speakersByEvent')
```

Agregar el getter (junto a `getCatalog()`):

```ts
  override getSpeakersByEvent(): SpeakersByEvent[] {
    return this.speakersByEvent ?? []
  }
```

Y que `createCatalogProfile`/`updateCatalogProfile` incluyan `speakerAppearances` en el body del POST/PATCH (ya lo pasan tal cual el input al backend; verificar que no lo estén stripeando). Tras una escritura de catálogo, refetchear speakers:

```ts
    // después del refetchCatalog() existente en create/update/deleteCatalogProfile:
    this.refetch('/speakers', (v: SpeakersByEvent[]) => (this.speakersByEvent = v), 'speakersByEvent')
```

- [ ] **Step 5: Implementar en LocalDataStore (demo, sin backend)**

En `src/data/store/LocalDataStore.ts`, agregar:

```ts
  getSpeakersByEvent(): SpeakersByEvent[] {
    // Demo: no hay tabla EventSpeaker; se deriva del seed vacío. La demo no muestra speakers reales.
    return []
  }
```

(Los `speakerAppearances` en el input de create/update del LocalDataStore se ignoran: la demo no persiste la relación. Documentarlo con el comentario.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/data/store/RemoteDataStore.speakers.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + suite front**

Run: `npx tsc -b && npx vitest run`
Expected: limpio, todo verde.

- [ ] **Step 8: Commit**

```bash
git add src/data/store/DataStore.ts src/data/store/RemoteDataStore.ts src/data/store/LocalDataStore.ts src/data/store/RemoteDataStore.speakers.test.ts
git commit -m "feat(store): getSpeakersByEvent + input de apariciones de speaker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Panel — opción Speaker, campo Frase y "¿En qué eventos habla?"

**Files:**
- Modify: `src/features/admin/OpsCatalogForm.tsx`

**Interfaces:**
- Consumes: `store.getSpeakersByEvent` no hace falta acá; sí `store.getEvents()`/`getBlocks()` para poblar el bloque de apariciones, y el input `speakerAppearances` (Task 5).
- Produces: al guardar, el form manda `kind`, `quote` y `speakerAppearances` al store.

- [ ] **Step 1: Ampliar el tipo `Kind` y el cupo de imágenes**

En `OpsCatalogForm.tsx:46-48`:

```ts
type Kind = 'participante' | 'expositor' | 'speaker'
// Cupo de imágenes de portfolio por tipo (feedback Gastón: participante 4, expositor 2).
const IMG_CAP: Record<Kind, number> = { participante: 4, expositor: 2, speaker: 4 }
```

- [ ] **Step 2: Agregar la opción al `<Select>` de kind**

En el `<Select>` de `kind` (`OpsCatalogForm.tsx:208`), sumar la opción `speaker` a las opciones existentes:

```tsx
<option value="participante">Participante</option>
<option value="expositor">Expositor</option>
<option value="speaker">Speaker · Corazón que inspira</option>
```

- [ ] **Step 3: Agregar el estado y el campo Frase**

Sumar `quote: ''` al estado inicial del form y `quote: p.quote ?? ''` al hidratar desde `p`. Agregar el campo (visible siempre) cerca del campo bio:

```tsx
<label className="block">
  <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Frase · "Corazón que inspira"</span>
  <Input value={f.quote} onChange={set('quote')} placeholder="Ej: La moda del interior también es negocio." />
</label>
```

- [ ] **Step 4: Agregar el bloque "¿En qué eventos habla?"**

Traer los eventos: `const eventos = useStore((s) => s.getEvents())`. Estado local `const [apps, setApps] = useState<SpeakerAppearanceInput[]>(...)` inicializado desde `p` si existe. Render: una casilla por evento; al tildar, `push { eventId, blockId: null }`; si el evento tiene bloques, mostrar un `<Select>` para elegir el bloque y setear `blockId`.

```tsx
{f.kind === 'speaker' && (
  <fieldset className="rounded-sm border border-line p-3">
    <legend className="px-1 text-[13px] font-medium text-ink-soft">¿En qué eventos habla?</legend>
    {eventos.map((ev) => {
      const marcado = apps.some((a) => a.eventId === ev.id)
      return (
        <label key={ev.id} className="flex items-center gap-2 py-1 text-[14px]">
          <input type="checkbox" checked={marcado} onChange={(e) =>
            setApps((prev) => e.target.checked
              ? [...prev, { eventId: ev.id, blockId: null }]
              : prev.filter((a) => a.eventId !== ev.id))} />
          {ev.title}
        </label>
      )
    })}
  </fieldset>
)}
```

> Nota: el segundo nivel (elegir bloque) se puede dejar para la Entrega 2 si aprieta el tiempo — con `blockId: null` el speaker ya queda vinculado al evento y aparece en /speakers. Marcar como opcional dentro de esta tarea.

- [ ] **Step 5: Incluir `quote` y `speakerAppearances` al guardar**

En el `onSubmit`, agregar al objeto que se manda a `store.createCatalogProfile` / `updateCatalogProfile`:

```ts
      quote: f.quote.trim() || undefined,
      ...(f.kind === 'speaker' ? { speakerAppearances: apps } : {}),
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b`
Expected: limpio.

- [ ] **Step 7: Prueba en vivo contra el stack local**

Con la API (`:4030`) y el front (`:5195`) corriendo, entrar al panel → Expositores → Crear, elegir tipo Speaker, poner nombre "Carolina Curti", una frase, y tildar el evento "Masterclass: Vender tu marca en el exterior". Guardar.
Verificar: `curl -s http://localhost:4030/api/v1/speakers` devuelve un grupo con Carolina bajo ese evento.

- [ ] **Step 8: Commit**

```bash
git add src/features/admin/OpsCatalogForm.tsx
git commit -m "feat(panel): cargar speaker con frase y en qué eventos habla

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Público — pestaña `/speakers` y excluir speakers del catálogo

**Files:**
- Create: `src/pages/Speakers.tsx`
- Modify: `src/App.tsx` (ruta)
- Modify: `src/components/layout/SiteLayout.tsx` (ítem de nav — confirmar el archivo real del nav público con `grep -rl "to=\"/catalogo\"" src/components src/features`)
- Modify: `src/pages/Catalogo.tsx` (excluir `kind === 'speaker'`)
- Test: `src/pages/Speakers.test.tsx` (crear)

**Interfaces:**
- Consumes: `store.getSpeakersByEvent()` (Task 5), las tarjetas del catálogo existentes.

- [ ] **Step 1: Excluir speakers del catálogo de participantes**

En `src/pages/Catalogo.tsx:62`, cambiar la fuente:

```ts
  const catalog = useStore((s) => s.getCatalog().filter((p) => p.kind !== 'speaker'))
```

> Un expositor que además es speaker tiene `kind: 'expositor'` → sigue apareciendo. Sólo se van los speakers puros. Correcto.

- [ ] **Step 2: Write the failing test**

Crear `src/pages/Speakers.test.tsx` (patrón de test de página con render + store mockeado; mirar cómo lo hace `AdminConvocatorias.test.tsx` para el mock del store):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../data/store', async (orig) => ({
  ...(await orig<typeof import('../data/store')>()),
  useStore: (sel: (s: unknown) => unknown) => sel({
    getSpeakersByEvent: () => [
      { eventId: 'ev-2026', eventTitle: 'CCM 2026', eventDate: '2026-09-19',
        speakers: [{ id: 'c1', slug: 'carolina', name: 'Carolina Curti', role: 'Speaker',
          kind: 'speaker', platform: 'Moda', city: 'Córdoba', bio: 'b', photo: 'p',
          verified: true, participatesIn: [], portfolio: [], quote: 'Inspiro' }] },
    ],
  }),
}))

const { default: Speakers } = await import('./Speakers')

describe('Speakers', () => {
  it('muestra el evento y el speaker con su frase', () => {
    render(<MemoryRouter><Speakers /></MemoryRouter>)
    expect(screen.getByText('CCM 2026')).toBeInTheDocument()
    expect(screen.getByText('Carolina Curti')).toBeInTheDocument()
    expect(screen.getByText(/Inspiro/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/pages/Speakers.test.tsx`
Expected: FAIL — no existe `./Speakers`.

- [ ] **Step 4: Crear la página**

Crear `src/pages/Speakers.tsx`. Reusar la tarjeta del catálogo (importar `ParticipanteCard` o el componente que use `Catalogo.tsx`; confirmarlo abriendo el archivo). Estructura: título editorial "Corazones que inspiran", y por cada grupo de `getSpeakersByEvent()` una sección con el título del evento y la grilla de tarjetas.

```tsx
import { useStore } from '../data/store'
// importar la misma card que usa Catalogo.tsx (confirmar nombre real)

export default function Speakers() {
  const grupos = useStore((s) => s.getSpeakersByEvent())
  return (
    <section className="mx-auto max-w-2xl px-5 pb-6 lg:max-w-6xl lg:px-8">
      <header className="py-8 lg:py-12">
        <h1 className="type-display text-[clamp(2rem,6vw,3.4rem)] text-ink">Corazones que inspiran</h1>
        <p className="mt-3 max-w-xl text-ink-soft">Quienes dan las charlas y workshops de cada edición.</p>
      </header>
      {grupos.length === 0 ? (
        <p className="py-12 text-center text-ink-soft">Pronto anunciamos a los speakers.</p>
      ) : grupos.map((g) => (
        <div key={g.eventId} className="mb-12">
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-accent-strong">{g.eventTitle}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
            {g.speakers.map((p) => (
              /* <ParticipanteCard profile={p} /> — usar la card real del catálogo */
              <article key={p.id} className="rounded-sm border border-line p-3">
                <img src={p.photo} alt={p.name} className="aspect-square w-full rounded-sm object-cover" />
                <h3 className="mt-2 text-[15px] font-medium text-ink">{p.name}</h3>
                {p.quote && <p className="mt-1 text-[13px] italic text-ink-soft">"{p.quote}"</p>}
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
```

> El bloque `<article>` inline es un fallback. Preferir la card real del catálogo si su interfaz lo permite (recibe un `CatalogProfile`). Abrir `Catalogo.tsx` para copiar el uso exacto.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/pages/Speakers.test.tsx`
Expected: PASS.

- [ ] **Step 6: Agregar la ruta**

En `src/App.tsx`, junto a `{ path: '/catalogo', element: <S><Catalogo /></S> }`, importar `Speakers` (lazy, siguiendo el patrón de las otras páginas) y agregar:

```tsx
            { path: '/speakers', element: <S><Speakers /></S> },
```

- [ ] **Step 7: Agregar el ítem al nav público**

Confirmar el archivo del nav: `grep -rln "/catalogo" src/components src/features src/pages`. En el nav público (donde estén "Participantes", "Eventos", etc.), agregar el ítem `Speakers → /speakers`. Respetar el patrón de nav de celular vs escritorio del sitio (dual toggle si hace falta).

- [ ] **Step 8: Typecheck + suite completa + prueba en vivo**

Run: `npx tsc -b && npx vitest run`
Expected: limpio, todo verde.

En vivo (front `:5195`): abrir `/speakers` → ver a Carolina bajo "Masterclass…". Abrir `/catalogo` → confirmar que Carolina NO aparece ahí.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Speakers.tsx src/pages/Speakers.test.tsx src/App.tsx src/pages/Catalogo.tsx src/components/layout/SiteLayout.tsx
git commit -m "feat(speakers): pestaña /speakers agrupada por evento + excluir del catálogo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Verificación de punta a punta y cierre

**Files:** ninguno nuevo — es la prueba de aceptación de la Entrega 1.

- [ ] **Step 1: Gate completo**

```bash
cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run
cd .. && npx tsc -b && npx vitest run
```
Expected: los cuatro verdes.

- [ ] **Step 2: Circuito real contra el stack local**

Con API + front arriba y sesión de admin iniciada:
1. Crear un speaker "Carolina Curti", frase, tildado en la Masterclass del 21/08.
2. `curl -s http://localhost:4030/api/v1/speakers` → aparece bajo ese evento.
3. `/speakers` en el navegador → se ve con foto y frase, bajo el título del evento.
4. `/catalogo` → NO aparece.
5. Crear un expositor común marcado además como speaker de otro evento (editar su kind a expositor, tildar un evento) → aparece en `/catalogo` **y** en `/speakers`.
6. Borrar el speaker → desaparece de `/speakers` sin dejar filas colgadas (el `onDelete: Cascade` de EventSpeaker lo limpia).

- [ ] **Step 3: Verificar que la migración es aditiva y no rompió nada existente**

`curl -s http://localhost:4030/api/v1/catalog | head -c 200` → el catálogo sigue devolviendo los perfiles de siempre, ahora con `kind` correcto.

- [ ] **Step 4: Push y PR (requiere OK del usuario — acción outward-facing)**

NO ejecutar sin confirmación. Cuando el usuario lo apruebe:

```bash
git push -u origin feat/speakers
gh pr create --base main --head feat/speakers --title "feat: sección de Speakers (Entrega 1)" --body "…"
```

## Self-Review (completado por el autor del plan)

- **Cobertura de la spec:** los 6 puntos de la Entrega 1 de la spec tienen tarea — serializer (T1), migración+quote+tabla (T2), backend read (T3), backend write (T4), store (T5), panel (T6), pestaña+filtro (T7). ✔
- **Placeholders:** cada step de código trae el código. Los dos "opcionales" (segundo nivel de bloque en T6, card real en T7) están marcados como decisiones explícitas con su fallback, no como huecos. ✔
- **Consistencia de tipos:** `SpeakersByEvent`, `SpeakerAppearanceInput`, `getSpeakersByEvent`, `speakerAppearances` se usan con el mismo nombre y forma en T3→T4→T5→T6→T7. ✔
- **Riesgo abierto:** el nombre exacto del componente de card del catálogo y del archivo del nav público se confirman al abrir los archivos (T7 Step 4 y 7 lo indican). No bloquea el plan.
