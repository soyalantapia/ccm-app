# CRM de Usuarios — Fase 1 · Plan de implementación

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA — usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**Objetivo:** reemplazar `/admin/personas` —que hoy muestra un solo dispositivo, el del propio admin— por un CRM real: lista de usuarios con buscador y ficha completa por persona.

**Los filtros por estado** (socios, inscriptos, postulantes, con entrada) **se difieren a la Fase 2.** Con las ~25 personas que va a haber al terminar esta fase, el buscador por texto cubre todo; los filtros recién ganan sentido con volumen, y agregarlos ahora es superficie que hay que mantener sin que nadie la use.

**Arquitectura:** se agrega una tabla `Person` que funciona como **ancla de identidad**, no como copia de datos. Guarda solo email y DNI normalizados (las claves con las que se unifica) y de ella cuelgan `Device` y `Application`. Los datos personales siguen viviendo en `ProfileField` (con su procedencia) y en `Application.data`. La lista y la ficha se arman leyendo esas fuentes a través de la Persona.

**Stack:** Express + Prisma + Postgres · React 19 + Vite + TanStack Query · vitest (server y front) + supertest.

**Spec:** `docs/superpowers/specs/2026-07-20-crm-usuarios-design.md`

## Restricciones globales

- Worktree `/tmp/ccm-crm`, rama `feat/crm-usuarios`, base `origin/main` en `0ba9bd8`.
- **Español rioplatense** en todo texto visible y en los mensajes de commit.
- **`schema.prisma` y `routes/admin.ts` son archivos calientes**: hay 3 sesiones paralelas tocándolos. Hacer `git fetch && git rebase origin/main` antes de cada commit que los toque.
- El `ADMIN_TOKEN` **ya no existe** (retirado en `0ba9bd8`). La auth es por sesión: `req.userId` y `req.sessionId` siempre están presentes en rutas admin.
- Permisos: cada ruta declara el suyo con `requirePermission('...')`. No hay guard único sobre el prefijo.
- Tests del server: `cd server && npx vitest run`. Tests del front: `npx vitest run` en la raíz.
- Typecheck: `npx tsc -b` (front) y `cd server && npm run typecheck`.
- **No se toca `Ticket`, `TicketOrder` ni `Payment`**: son Fase 3 y dependen de Mercado Pago.

## Estructura de archivos

**Crear (server):**
- `server/src/domain/personIdentity.ts` — funciones puras: normalizar claves y extraerlas de una postulación.
- `server/src/domain/personIdentity.test.ts`
- `server/src/services/personService.ts` — enganche (find-or-create) y lecturas de lista y ficha.
- `server/src/services/personService.test.ts`
- `server/prisma/migrations/10_person/migration.sql`
- `server/scripts/backfill-personas.ts`

**Modificar (server):**
- `server/prisma/schema.prisma` — `Person` + `Device.personId` + `Application.personId`.
- `server/src/domain/adminRoles.ts` — permiso `people:read`.
- `server/src/services/deviceService.ts` — enganchar en `saveFields`.
- `server/src/services/applicationService.ts` — enganchar al crear.
- `server/src/routes/admin.ts` — dos rutas nuevas.

**Crear (front):**
- `src/pages/admin/AdminUsuarios.tsx`
- `src/features/admin/UsuariosTabla.tsx`
- `src/features/admin/UsuarioFicha.tsx`
- `src/features/admin/UsuariosTabla.test.tsx`

**Modificar (front):**
- `src/data/queries.ts` — `usePeople`, `usePerson`.
- `src/App.tsx` — ruta.
- `src/components/layout/AdminLayout.tsx` — menú.

**Borrar:** `src/pages/admin/AdminPersonas.tsx`

---

### Tarea 1: Identidad — normalizar y extraer claves

Funciones puras, sin base de datos. Se hacen primero porque todo lo demás depende de que "el mismo email" signifique lo mismo en todos lados.

**Archivos:**
- Crear: `server/src/domain/personIdentity.ts`
- Test: `server/src/domain/personIdentity.test.ts`

**Interfaces:**
- Produce: `normalizeEmail(v: string | null | undefined): string | null`, `normalizeDni(v: string | null | undefined): string | null`, `type IdentityKeys = { email: string | null; dni: string | null }`, `keysFromApplicationData(data: unknown): IdentityKeys`

- [ ] **Paso 1: escribir el test que falla**

```ts
// server/src/domain/personIdentity.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizeDni, keysFromApplicationData } from './personIdentity.js'

describe('normalizeEmail', () => {
  it('baja a minúsculas y recorta espacios', () => {
    expect(normalizeEmail('  Ana.Perez@Gmail.COM ')).toBe('ana.perez@gmail.com')
  })
  it('descarta lo que no parece un email', () => {
    expect(normalizeEmail('sin-arroba')).toBeNull()
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })
})

describe('normalizeDni', () => {
  it('deja solo dígitos', () => {
    expect(normalizeDni('38.456.120')).toBe('38456120')
    expect(normalizeDni('DNI 38 456 120')).toBe('38456120')
  })
  it('descarta los que no tienen largo de DNI', () => {
    expect(normalizeDni('123')).toBeNull()      // muy corto
    expect(normalizeDni('1234567890123')).toBeNull() // muy largo
    expect(normalizeDni(null)).toBeNull()
  })
})

describe('keysFromApplicationData', () => {
  it('saca email y dni del JSON de la postulación', () => {
    const data = { nombre: 'Milagros Soria', email: 'Milagros@Gmail.com', dni: '38.456.120' }
    expect(keysFromApplicationData(data)).toEqual({ email: 'milagros@gmail.com', dni: '38456120' })
  })
  it('tolera un JSON sin esos campos', () => {
    expect(keysFromApplicationData({ nombre: 'X', historia: 'Y' })).toEqual({ email: null, dni: null })
  })
  it('tolera basura', () => {
    expect(keysFromApplicationData(null)).toEqual({ email: null, dni: null })
    expect(keysFromApplicationData('texto')).toEqual({ email: null, dni: null })
  })
})
```

- [ ] **Paso 2: correr y ver que falla**

Ejecutar: `cd server && npx vitest run src/domain/personIdentity.test.ts`
Esperado: FALLA — `Cannot find module './personIdentity.js'`

- [ ] **Paso 3: implementar**

```ts
// server/src/domain/personIdentity.ts
/**
 * Claves de identidad de una persona. Son las ÚNICAS con las que se unifica: coincidencia
 * exacta tras normalizar. Nada de heurísticas por nombre — dos "Juan Pérez" no son la misma
 * persona, y fusionar de más es peor que no fusionar.
 */
export interface IdentityKeys {
  email: string | null
  dni: string | null
}

/** Minúsculas y sin espacios. Devuelve null si no parece un email. */
export function normalizeEmail(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  // Validación deliberadamente laxa: acá no rechazamos direcciones raras pero válidas,
  // solo descartamos lo que claramente no es un email y ensuciaría el índice único.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null
  return s
}

/** Solo dígitos. Devuelve null fuera del rango de largo de un documento (7 a 11). */
export function normalizeDni(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const digits = v.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 11) return null
  return digits
}

/** Extrae las claves del `data` (JSON libre) de una postulación. */
export function keysFromApplicationData(data: unknown): IdentityKeys {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { email: null, dni: null }
  }
  const d = data as Record<string, unknown>
  return {
    email: normalizeEmail(typeof d.email === 'string' ? d.email : null),
    dni: normalizeDni(typeof d.dni === 'string' ? d.dni : null),
  }
}
```

- [ ] **Paso 4: correr y ver que pasa**

Ejecutar: `cd server && npx vitest run src/domain/personIdentity.test.ts`
Esperado: PASA — 8 tests.

- [ ] **Paso 5: commitear**

```bash
cd /tmp/ccm-crm
git add server/src/domain/personIdentity.ts server/src/domain/personIdentity.test.ts
git commit -m "feat(personas): normalización y extracción de claves de identidad

Email a minúsculas sin espacios; DNI solo dígitos con largo válido. Son las únicas
claves con las que se unifica una persona: coincidencia exacta, sin heurísticas por
nombre — fusionar de más es peor que no fusionar."
```

---

### Tarea 2: Esquema y migración

**Archivos:**
- Modificar: `server/prisma/schema.prisma`
- Crear: `server/prisma/migrations/10_person/migration.sql`

**Interfaces:**
- Produce: modelo `Person { id, email?, dni?, createdAt, updatedAt }`, `Device.personId`, `Application.personId`.

- [ ] **Paso 1: rebasar antes de tocar el esquema**

```bash
cd /tmp/ccm-crm && git fetch origin -q && git rebase origin/main
```

- [ ] **Paso 2: agregar el modelo al esquema**

En `server/prisma/schema.prisma`, después del modelo `Device`:

```prisma
// ─────────────────────────────────────────────────────────
//  PERSONAS (CRM)
// ─────────────────────────────────────────────────────────

/**
 * Ancla de identidad. NO copia datos personales: solo guarda las claves con las que se
 * unifica (email, dni normalizados). Los datos siguen en ProfileField —con su procedencia—
 * y en Application.data. Copiarlos acá destruiría el "cuándo y en qué acción se capturó",
 * que es lo que hace valiosa a la base propia.
 */
model Person {
  id        String   @id @default(cuid())
  email     String?  @unique
  dni       String?  @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  devices      Device[]
  applications Application[]

  @@index([createdAt])
}
```

En `model Device`, agregar:
```prisma
  personId String?
  person   Person? @relation(fields: [personId], references: [id], onDelete: SetNull)
```
y en su bloque de índices: `@@index([personId])`

En `model Application`, agregar lo mismo:
```prisma
  personId String?
  person   Person? @relation(fields: [personId], references: [id], onDelete: SetNull)
```
y `@@index([personId])`

- [ ] **Paso 3: escribir la migración**

```sql
-- server/prisma/migrations/10_person/migration.sql
-- Persona: ancla de identidad del CRM. Aditiva: no cambia ninguna columna existente.
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "dni" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");
CREATE UNIQUE INDEX "Person_dni_key" ON "Person"("dni");
CREATE INDEX "Person_createdAt_idx" ON "Person"("createdAt");

ALTER TABLE "Device" ADD COLUMN "personId" TEXT;
ALTER TABLE "Application" ADD COLUMN "personId" TEXT;

CREATE INDEX "Device_personId_idx" ON "Device"("personId");
CREATE INDEX "Application_personId_idx" ON "Application"("personId");

ALTER TABLE "Device" ADD CONSTRAINT "Device_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Paso 4: aplicar y verificar**

```bash
cd /tmp/ccm-crm/server
export DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test"
createdb -h localhost -U "$USER" ccm_crm_test 2>/dev/null
npx prisma migrate deploy
npx prisma generate
npm run typecheck
```
Esperado: `All migrations have been successfully applied.` y typecheck sin errores.

- [ ] **Paso 5: commitear**

```bash
cd /tmp/ccm-crm
git add server/prisma/schema.prisma server/prisma/migrations/10_person
git commit -m "feat(personas): tabla Person como ancla de identidad

Aditiva: tabla nueva y dos columnas opcionales. No cambia nada existente. Se hace ahora
porque hay 2 dispositivos y 1 postulación real en producción — en septiembre la misma
migración es un operativo."
```

---

### Tarea 3: Enganche — find-or-create de la Persona

**Archivos:**
- Crear: `server/src/services/personService.ts`
- Test: `server/src/services/personService.test.ts`

**Interfaces:**
- Consume: `normalizeEmail`, `normalizeDni`, `keysFromApplicationData` de la Tarea 1.
- Produce: `linkPerson(keys: IdentityKeys, tx?): Promise<string | null>` — devuelve el `personId` o `null` si no hay ninguna clave.

- [ ] **Paso 1: escribir el test que falla**

```ts
// server/src/services/personService.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../lib/prisma.js'
import { linkPerson } from './personService.js'

describe('linkPerson', () => {
  beforeEach(async () => {
    await prisma.person.deleteMany()
  })

  it('sin claves no crea nada', async () => {
    expect(await linkPerson({ email: null, dni: null })).toBeNull()
    expect(await prisma.person.count()).toBe(0)
  })

  it('crea una persona con el email', async () => {
    const id = await linkPerson({ email: 'ana@x.com', dni: null })
    expect(id).toBeTruthy()
    expect(await prisma.person.count()).toBe(1)
  })

  it('el mismo email dos veces devuelve la MISMA persona', async () => {
    const a = await linkPerson({ email: 'ana@x.com', dni: null })
    const b = await linkPerson({ email: 'ana@x.com', dni: null })
    expect(b).toBe(a)
    expect(await prisma.person.count()).toBe(1)
  })

  it('completa el dni faltante en una persona ya existente', async () => {
    const a = await linkPerson({ email: 'ana@x.com', dni: null })
    await linkPerson({ email: 'ana@x.com', dni: '38456120' })
    const p = await prisma.person.findUniqueOrThrow({ where: { id: a! } })
    expect(p.dni).toBe('38456120')
  })

  it('unifica por dni cuando el email todavía no estaba', async () => {
    const a = await linkPerson({ email: null, dni: '38456120' })
    const b = await linkPerson({ email: 'ana@x.com', dni: '38456120' })
    expect(b).toBe(a)
    expect(await prisma.person.count()).toBe(1)
  })

  it('claves en conflicto: NO fusiona, se queda con la más antigua', async () => {
    const vieja = await linkPerson({ email: 'ana@x.com', dni: null })
    const otra = await linkPerson({ email: null, dni: '38456120' })
    expect(otra).not.toBe(vieja)
    // email de la primera + dni de la segunda: pertenecen a personas distintas
    const r = await linkPerson({ email: 'ana@x.com', dni: '38456120' })
    expect(r).toBe(vieja)                       // gana la más antigua
    expect(await prisma.person.count()).toBe(2) // y la otra sigue existiendo
  })
})
```

- [ ] **Paso 2: correr y ver que falla**

Ejecutar: `cd server && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run src/services/personService.test.ts`
Esperado: FALLA — no existe `./personService.js`.

- [ ] **Paso 3: implementar**

```ts
// server/src/services/personService.ts
import { prisma } from '../lib/prisma.js'
import type { IdentityKeys } from '../domain/personIdentity.js'

/**
 * Busca-o-crea la Persona dueña de estas claves y devuelve su id.
 *
 * Reglas:
 *  - Sin ninguna clave → null (no se crea una persona fantasma sin forma de reconocerla).
 *  - Si una clave ya tiene dueño → se usa esa persona y se le completan las claves que le falten.
 *  - Si las dos claves tienen dueños DISTINTOS → gana la más antigua y NO se fusiona.
 *    Fusionar es destructivo e irreversible; se registra para poder revisarlo a mano.
 */
export async function linkPerson(keys: IdentityKeys): Promise<string | null> {
  const { email, dni } = keys
  if (!email && !dni) return null

  const encontradas = await prisma.person.findMany({
    where: { OR: [...(email ? [{ email }] : []), ...(dni ? [{ dni }] : [])] },
    orderBy: { createdAt: 'asc' },
  })

  if (encontradas.length === 0) {
    const creada = await prisma.person.create({ data: { email, dni } })
    return creada.id
  }

  const duena = encontradas[0]

  if (encontradas.length > 1) {
    console.warn(
      `[personas] claves en conflicto: email=${email} y dni=${dni} pertenecen a personas ` +
        `distintas (${encontradas.map((p) => p.id).join(', ')}). Se usa la más antigua ${duena.id}; ` +
        `no se fusiona automáticamente.`,
    )
    return duena.id
  }

  // Completar la clave que falte, sin pisar una que ya esté.
  const faltantes: { email?: string; dni?: string } = {}
  if (email && !duena.email) faltantes.email = email
  if (dni && !duena.dni) faltantes.dni = dni
  if (Object.keys(faltantes).length > 0) {
    await prisma.person.update({ where: { id: duena.id }, data: faltantes })
  }
  return duena.id
}
```

- [ ] **Paso 4: correr y ver que pasa**

Ejecutar: `cd server && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run src/services/personService.test.ts`
Esperado: PASA — 6 tests.

- [ ] **Paso 5: commitear**

```bash
cd /tmp/ccm-crm
git add server/src/services/personService.ts server/src/services/personService.test.ts
git commit -m "feat(personas): find-or-create con unificación por email o DNI

Ante claves en conflicto (email de una persona, DNI de otra) NO fusiona: usa la más
antigua y registra el caso. Fusionar es irreversible y sin gente real todavía no vale
el riesgo."
```

---

### Tarea 4: Enganchar los caminos de escritura

Que cada dato nuevo cree o encuentre su Persona sin que nadie tenga que acordarse.

**Archivos:**
- Modificar: `server/src/services/deviceService.ts:18-39` (`saveFields`)
- Modificar: `server/src/services/applicationService.ts:22` (creación)
- Test: `server/src/services/personService.test.ts` (agregar bloque)

**Interfaces:**
- Consume: `linkPerson` de la Tarea 3.

- [ ] **Paso 1: escribir el test que falla**

Agregar al final de `server/src/services/personService.test.ts`:

```ts
import { saveFields } from './deviceService.js'

describe('enganche automático', () => {
  it('guardar el email de un dispositivo lo enlaza a una Persona', async () => {
    const device = await prisma.device.create({ data: { publicId: `dev-${Date.now()}` } })
    await saveFields(device.id, { email: 'Nueva@X.com' }, 'test')
    const actualizado = await prisma.device.findUniqueOrThrow({ where: { id: device.id } })
    expect(actualizado.personId).toBeTruthy()
    const p = await prisma.person.findUniqueOrThrow({ where: { id: actualizado.personId! } })
    expect(p.email).toBe('nueva@x.com')   // normalizado
  })

  it('un dato que no es clave de identidad no crea Persona', async () => {
    const device = await prisma.device.create({ data: { publicId: `dev2-${Date.now()}` } })
    await saveFields(device.id, { city: 'Córdoba' }, 'test')
    const actualizado = await prisma.device.findUniqueOrThrow({ where: { id: device.id } })
    expect(actualizado.personId).toBeNull()
  })
})
```

- [ ] **Paso 2: correr y ver que falla**

Ejecutar: `cd server && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run src/services/personService.test.ts`
Esperado: FALLA — `expected null to be truthy` (todavía no engancha).

- [ ] **Paso 3: enganchar en `saveFields`**

En `server/src/services/deviceService.ts`, agregar los imports:

```ts
import { normalizeEmail, normalizeDni } from '../domain/personIdentity.js'
import { linkPerson } from './personService.js'
```

y antes del `return getProfile(deviceId)` de `saveFields`:

```ts
  // Si entró un email o un DNI, este dispositivo ya es identificable: se engancha a su Persona.
  // Va DESPUÉS de la transacción a propósito: que falle el enganche no debe perder el dato.
  const email = normalizeEmail(values.email)
  const dni = normalizeDni(values.dni)
  if (email || dni) {
    try {
      const personId = await linkPerson({ email, dni })
      if (personId) await prisma.device.update({ where: { id: deviceId }, data: { personId } })
    } catch (err) {
      console.error('[personas] no se pudo enganchar el dispositivo', deviceId, err)
    }
  }
```

- [ ] **Paso 4: enganchar en la creación de postulaciones**

En `server/src/services/applicationService.ts`, agregar los imports:

```ts
import { keysFromApplicationData } from '../domain/personIdentity.js'
import { linkPerson } from './personService.js'
```

y justo después del `prisma.application.create(...)` (línea ~22), antes de devolver:

```ts
  // Las postulaciones traen su PII en el JSON y muchas veces no tienen dispositivo:
  // son la principal fuente de personas del CRM.
  try {
    const personId = await linkPerson(keysFromApplicationData(row.data))
    if (personId) await prisma.application.update({ where: { id: row.id }, data: { personId } })
  } catch (err) {
    console.error('[personas] no se pudo enganchar la postulación', row.id, err)
  }
```

- [ ] **Paso 5: correr toda la suite del server**

Ejecutar: `cd server && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run`
Esperado: PASA todo, incluidos los 2 tests nuevos. Ningún test previo se rompe.

- [ ] **Paso 6: commitear**

```bash
cd /tmp/ccm-crm
git add server/src/services/deviceService.ts server/src/services/applicationService.ts server/src/services/personService.test.ts
git commit -m "feat(personas): enganchar dispositivos y postulaciones a su Persona

El enganche corre FUERA de la transacción del dato y con try/catch: que falle unificar
nunca debe hacer perder el dato que la persona acaba de cargar."
```

---

### Tarea 5: Backfill idempotente

**Archivos:**
- Crear: `server/scripts/backfill-personas.ts`
- Test: `server/src/services/personService.test.ts` (agregar bloque)

**Interfaces:**
- Produce: `backfillPersonas(): Promise<{ creadas: number; enlazados: number }>`

- [ ] **Paso 1: escribir el test que falla**

Agregar a `server/src/services/personService.test.ts`:

```ts
import { backfillPersonas } from '../../scripts/backfill-personas.js'

describe('backfill', () => {
  it('es idempotente: correrlo dos veces no duplica personas', async () => {
    const d = await prisma.device.create({ data: { publicId: `bf-${Date.now()}` } })
    await prisma.profileField.create({ data: { deviceId: d.id, key: 'email', value: 'bf@x.com', source: 'seed' } })

    const primera = await backfillPersonas()
    expect(primera.creadas).toBe(1)
    const total = await prisma.person.count()

    const segunda = await backfillPersonas()
    expect(segunda.creadas).toBe(0)
    expect(await prisma.person.count()).toBe(total)
  })
})
```

- [ ] **Paso 2: correr y ver que falla**

Ejecutar: `cd server && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run src/services/personService.test.ts`
Esperado: FALLA — no existe el módulo.

- [ ] **Paso 3: implementar**

```ts
// server/scripts/backfill-personas.ts
import { prisma } from '../src/lib/prisma.js'
import { normalizeEmail, normalizeDni, keysFromApplicationData } from '../src/domain/personIdentity.js'
import { linkPerson } from '../src/services/personService.js'

/**
 * Crea las Personas de los datos que ya existían antes de la tabla.
 * Idempotente: solo mira lo que todavía no tiene personId, así que volver a correrlo no duplica.
 */
export async function backfillPersonas(): Promise<{ creadas: number; enlazados: number }> {
  const antes = await prisma.person.count()
  let enlazados = 0

  const devices = await prisma.device.findMany({
    where: { personId: null },
    include: { fields: { where: { key: { in: ['email', 'dni'] } } } },
  })
  for (const d of devices) {
    const email = normalizeEmail(d.fields.find((f) => f.key === 'email')?.value)
    const dni = normalizeDni(d.fields.find((f) => f.key === 'dni')?.value)
    const personId = await linkPerson({ email, dni })
    if (personId) {
      await prisma.device.update({ where: { id: d.id }, data: { personId } })
      enlazados++
    }
  }

  const apps = await prisma.application.findMany({ where: { personId: null } })
  for (const a of apps) {
    const personId = await linkPerson(keysFromApplicationData(a.data))
    if (personId) {
      await prisma.application.update({ where: { id: a.id }, data: { personId } })
      enlazados++
    }
  }

  return { creadas: (await prisma.person.count()) - antes, enlazados }
}

// Permite correrlo a mano: `npx tsx scripts/backfill-personas.ts`
if (process.argv[1]?.endsWith('backfill-personas.ts')) {
  backfillPersonas()
    .then((r) => console.log(`✓ personas creadas: ${r.creadas} · registros enlazados: ${r.enlazados}`))
    .finally(() => prisma.$disconnect())
}
```

- [ ] **Paso 4: correr el test y después el backfill de verdad**

```bash
cd server
DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run src/services/personService.test.ts
DATABASE_URL="postgresql://$USER@localhost:5432/ccm_local" npx tsx scripts/backfill-personas.ts
```
Esperado: test PASA. El backfill sobre `ccm_local` imprime personas creadas (las 24 postulaciones del seed traen email y DNI).

- [ ] **Paso 5: commitear**

```bash
cd /tmp/ccm-crm
git add server/scripts/backfill-personas.ts server/src/services/personService.test.ts
git commit -m "feat(personas): backfill idempotente de lo que ya existía

Solo mira lo que todavía no tiene personId, así que volver a correrlo no duplica."
```

---

### Tarea 6: Permiso `people:read`

**Archivos:**
- Modificar: `server/src/domain/adminRoles.ts`
- Test: `server/src/domain/adminRoles.test.ts`

**Interfaces:**
- Produce: `'people:read'` dentro del tipo `Permission`.

- [ ] **Paso 1: escribir el test que falla**

Agregar a `server/src/domain/adminRoles.test.ts`:

```ts
describe('people:read', () => {
  it('OWNER y EDITOR lo tienen', () => {
    expect(can('OWNER', 'people:read')).toBe(true)
    expect(can('EDITOR', 'people:read')).toBe(true)
  })
  it('CONTENT NO lo tiene — prensa no ve datos personales', () => {
    expect(can('CONTENT', 'people:read')).toBe(false)
  })
  it('STAFF y VIEWER tampoco', () => {
    expect(can('STAFF', 'people:read')).toBe(false)
    expect(can('VIEWER', 'people:read')).toBe(false)
  })
})
```

- [ ] **Paso 2: correr y ver que falla**

Ejecutar: `cd server && npx vitest run src/domain/adminRoles.test.ts`
Esperado: FALLA — `'people:read'` no es asignable al tipo `Permission`.

- [ ] **Paso 3: implementar**

En `server/src/domain/adminRoles.ts`, dentro de `PERMISSIONS`, después de `'applications:decide'`:

```ts
  'people:read', // ⚠️ PII: ver el CRM de usuarios (nombre, email, teléfono, DNI, actividad)
```

y en `GRANTS.EDITOR`, después de `'applications:decide'`:

```ts
    'people:read',
```

(CONTENT, STAFF y VIEWER quedan como están: no lo reciben.)

- [ ] **Paso 4: correr y ver que pasa**

Ejecutar: `cd server && npx vitest run src/domain/adminRoles.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commitear**

```bash
cd /tmp/ccm-crm
git add server/src/domain/adminRoles.ts server/src/domain/adminRoles.test.ts
git commit -m "feat(personas): permiso people:read

Solo OWNER y EDITOR. CONTENT queda afuera por el mismo criterio que ya lo excluye de
las postulaciones: prensa y marketing no ven datos personales."
```

---

### Tarea 7: Endpoint de lista

**Archivos:**
- Modificar: `server/src/services/personService.ts`
- Modificar: `server/src/routes/admin.ts`
- Test: `server/src/services/personService.test.ts`

**Interfaces:**
- Produce: `listPeople(opts: { q?: string; cursor?: string; limit?: number }): Promise<{ items: PersonaListItem[]; nextCursor: string | null; anonimos: number }>`
- Tipo `PersonaListItem = { id, nombre, email, telefono, dni, esSocio, inscripciones, postulaciones, ultimaActividad, creadaEl }`

- [ ] **Paso 1: escribir el test que falla**

```ts
describe('listPeople', () => {
  it('devuelve las personas con su nombre armado y el conteo de anónimos', async () => {
    const d = await prisma.device.create({ data: { publicId: `ls-${Date.now()}` } })
    await saveFields(d.id, { email: 'lista@x.com', firstName: 'Ana', lastName: 'Pérez' }, 'test')
    await prisma.device.create({ data: { publicId: `anon-${Date.now()}` } }) // sin datos

    const r = await listPeople({})
    const ana = r.items.find((p) => p.email === 'lista@x.com')
    expect(ana).toBeTruthy()
    expect(ana!.nombre).toBe('Ana Pérez')
    expect(r.anonimos).toBeGreaterThanOrEqual(1)
  })

  it('el buscador filtra por nombre, email o dni', async () => {
    const d = await prisma.device.create({ data: { publicId: `bus-${Date.now()}` } })
    await saveFields(d.id, { email: 'buscame@x.com', firstName: 'Zoraida' }, 'test')

    expect((await listPeople({ q: 'zorai' })).items.length).toBeGreaterThan(0)
    expect((await listPeople({ q: 'buscame@' })).items.length).toBeGreaterThan(0)
    expect((await listPeople({ q: 'nadie-con-este-texto' })).items).toHaveLength(0)
  })

  it('encuentra a alguien que NO está entre los más recientes (el filtro va en SQL)', async () => {
    const viejo = await prisma.device.create({ data: { publicId: `old-${Date.now()}` } })
    await saveFields(viejo.id, { email: 'perdida@x.com', firstName: 'Perdida' }, 'test')
    // 60 personas más nuevas la empujan fuera de la primera página (limit 50)
    for (let i = 0; i < 60; i++) {
      const d = await prisma.device.create({ data: { publicId: `pad-${Date.now()}-${i}` } })
      await saveFields(d.id, { email: `pad${i}-${Date.now()}@x.com` }, 'test')
    }
    const r = await listPeople({ q: 'Perdida' })
    expect(r.items.map((x) => x.email)).toContain('perdida@x.com')
  })
})
```

- [ ] **Paso 2: correr y ver que falla**

Ejecutar: `cd server && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run src/services/personService.test.ts`
Esperado: FALLA — `listPeople` no existe.

- [ ] **Paso 3: implementar el servicio**

Agregar a `server/src/services/personService.ts`:

```ts
import type { Prisma } from '@prisma/client'

export interface PersonaListItem {
  id: string
  nombre: string | null
  email: string | null
  telefono: string | null
  dni: string | null
  esSocio: boolean
  inscripciones: number
  postulaciones: number
  creadaEl: string
  ultimaActividad: string | null
}

/** Arma el nombre visible a partir de los campos del dispositivo o del JSON de la postulación. */
function nombreDe(fields: { key: string; value: string }[], appData: unknown): string | null {
  const f = (k: string) => fields.find((x) => x.key === k)?.value ?? null
  const nom = [f('firstName'), f('lastName')].filter(Boolean).join(' ').trim()
  if (nom) return nom
  if (appData && typeof appData === 'object' && !Array.isArray(appData)) {
    const n = (appData as Record<string, unknown>).nombre
    if (typeof n === 'string' && n.trim()) return n.trim()
  }
  return null
}

export async function listPeople(opts: { q?: string; cursor?: string; limit?: number }): Promise<{
  items: PersonaListItem[]
  nextCursor: string | null
  anonimos: number
}> {
  const limit = Math.min(opts.limit ?? 50, 100)
  const q = opts.q?.trim().toLowerCase()

  // El filtro va en SQL, no sobre la página ya armada: filtrar después de paginar solo
  // encontraría coincidencias dentro de las 50 más recientes y perdería el resto en silencio.
  // El nombre y el teléfono viven en ProfileField, y el nombre del postulante en el JSON de
  // la postulación, así que la búsqueda entra por relación a las tres fuentes.
  const where: Prisma.PersonWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { dni: { contains: q } },
          { devices: { some: { fields: { some: { value: { contains: q, mode: 'insensitive' } } } } } },
          { applications: { some: { data: { path: ['nombre'], string_contains: q } } } },
        ],
      }
    : {}

  const personas = await prisma.person.findMany({
    where,
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      devices: {
        include: {
          fields: true,
          membership: true,
          _count: { select: { registrations: true } },
          analytics: { orderBy: { ts: 'desc' }, take: 1 },
        },
      },
      applications: { orderBy: { ts: 'desc' } },
    },
  })

  const hayMas = personas.length > limit
  const pagina = hayMas ? personas.slice(0, limit) : personas

  const items: PersonaListItem[] = pagina.map((p) => {
    const fields = p.devices.flatMap((d) => d.fields)
    const appData = p.applications[0]?.data ?? null
    const campo = (k: string) => fields.find((f) => f.key === k)?.value ?? null
    const ultimaAct = p.devices.flatMap((d) => d.analytics).map((a) => a.ts).sort().pop() ?? null
    return {
      id: p.id,
      nombre: nombreDe(fields, appData),
      email: p.email,
      telefono: campo('phone'),
      dni: p.dni,
      esSocio: p.devices.some((d) => d.membership?.tier === 'socio'),
      inscripciones: p.devices.reduce((s, d) => s + d._count.registrations, 0),
      postulaciones: p.applications.length,
      creadaEl: p.createdAt.toISOString(),
      ultimaActividad: ultimaAct ? new Date(ultimaAct).toISOString() : null,
    }
  })

  const anonimos = await prisma.device.count({ where: { personId: null } })

  return {
    items,
    nextCursor: hayMas ? pagina[pagina.length - 1].id : null,
    anonimos,
  }
}
```

- [ ] **Paso 4: agregar la ruta**

En `server/src/routes/admin.ts`, después del bloque de Postulaciones:

```ts
/* ─── Personas (CRM) ─── */
adminRouter.get('/admin/people', requirePermission('people:read'), async (req, res, next) => {
  try {
    res.json(
      await personService.listPeople({
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      }),
    )
  } catch (err) {
    next(err)
  }
})
```

y el import arriba: `import * as personService from '../services/personService.js'`

- [ ] **Paso 5: correr todo y commitear**

```bash
cd server && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run && npm run typecheck
cd /tmp/ccm-crm && git fetch origin -q && git rebase origin/main
git add server/src/services/personService.ts server/src/services/personService.test.ts server/src/routes/admin.ts
git commit -m "feat(personas): GET /admin/people con buscador y conteo de anónimos"
```

---

### Tarea 8: Endpoint de ficha

**Archivos:**
- Modificar: `server/src/services/personService.ts`, `server/src/routes/admin.ts`
- Test: `server/src/services/personService.test.ts`

**Interfaces:**
- Produce: `getPerson(id: string): Promise<PersonaFicha | null>` con `PersonaFicha = PersonaListItem & { campos, consentimientos, inscripciones[], postulaciones[], membresia, actividad[] }`

- [ ] **Paso 1: escribir el test que falla**

```ts
describe('getPerson', () => {
  it('trae los campos con su procedencia', async () => {
    const d = await prisma.device.create({ data: { publicId: `fi-${Date.now()}` } })
    await saveFields(d.id, { email: 'ficha@x.com', city: 'Córdoba' }, 'inscripcion')
    const p = await prisma.device.findUniqueOrThrow({ where: { id: d.id } })

    const ficha = await getPerson(p.personId!)
    expect(ficha).toBeTruthy()
    const ciudad = ficha!.campos.find((c) => c.key === 'city')
    expect(ciudad!.value).toBe('Córdoba')
    expect(ciudad!.source).toBe('inscripcion')   // la procedencia se conserva
    expect(ciudad!.capturedAt).toBeTruthy()
  })

  it('devuelve null si no existe', async () => {
    expect(await getPerson('no-existe')).toBeNull()
  })
})
```

- [ ] **Paso 2: correr y ver que falla**

Ejecutar: `cd server && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run src/services/personService.test.ts`
Esperado: FALLA — `getPerson` no existe.

- [ ] **Paso 3: implementar**

Agregar a `server/src/services/personService.ts`:

```ts
export interface PersonaCampo {
  key: string
  value: string
  source: string
  capturedAt: string
}

export interface PersonaFicha extends PersonaListItem {
  campos: PersonaCampo[]
  consentimientos: { terms: string | null; news: string | null; sponsors: string | null }
  inscripcionesDetalle: { id: string; eventId: string; blockId: string | null; status: string; ts: string }[]
  postulacionesDetalle: { id: string; convocatoriaId: string; status: string; ts: string; data: unknown }[]
  membresia: { tier: string; since: string | null } | null
  actividad: { type: string; ts: string; meta: unknown }[]
}

export async function getPerson(id: string): Promise<PersonaFicha | null> {
  const p = await prisma.person.findUnique({
    where: { id },
    include: {
      devices: {
        include: {
          fields: true,
          membership: true,
          registrations: { orderBy: { ts: 'desc' } },
          analytics: { orderBy: { ts: 'desc' }, take: 100 },
          _count: { select: { registrations: true } },
        },
      },
      applications: { orderBy: { ts: 'desc' } },
    },
  })
  if (!p) return null

  const fields = p.devices.flatMap((d) => d.fields)
  const campo = (k: string) => fields.find((f) => f.key === k)?.value ?? null
  const primerDevice = p.devices[0] ?? null
  const membership = p.devices.map((d) => d.membership).find(Boolean) ?? null
  const analytics = p.devices.flatMap((d) => d.analytics)

  return {
    id: p.id,
    nombre: nombreDe(fields, p.applications[0]?.data ?? null),
    email: p.email,
    telefono: campo('phone'),
    dni: p.dni,
    esSocio: membership?.tier === 'socio',
    inscripciones: p.devices.reduce((s, d) => s + d._count.registrations, 0),
    postulaciones: p.applications.length,
    creadaEl: p.createdAt.toISOString(),
    ultimaActividad: analytics[0]?.ts.toISOString() ?? null,
    campos: fields.map((f) => ({
      key: f.key,
      value: f.value,
      source: f.source,
      capturedAt: f.capturedAt.toISOString(),
    })),
    consentimientos: {
      terms: primerDevice?.consentTerms?.toISOString() ?? null,
      news: primerDevice?.consentNews?.toISOString() ?? null,
      sponsors: primerDevice?.consentSponsors?.toISOString() ?? null,
    },
    inscripcionesDetalle: p.devices.flatMap((d) =>
      d.registrations.map((r) => ({
        id: r.id, eventId: r.eventId, blockId: r.blockId, status: r.status, ts: r.ts.toISOString(),
      })),
    ),
    postulacionesDetalle: p.applications.map((a) => ({
      id: a.id, convocatoriaId: a.convocatoriaId, status: a.status, ts: a.ts.toISOString(), data: a.data,
    })),
    membresia: membership ? { tier: membership.tier, since: membership.since?.toISOString() ?? null } : null,
    actividad: analytics.map((a) => ({ type: a.type, ts: a.ts.toISOString(), meta: a.meta })),
  }
}
```

- [ ] **Paso 4: agregar la ruta**

En `server/src/routes/admin.ts`, debajo de la de lista:

```ts
adminRouter.get('/admin/people/:id', requirePermission('people:read'), async (req, res, next) => {
  try {
    const ficha = await personService.getPerson(req.params.id)
    if (!ficha) {
      next(notFound('PERSON_NOT_FOUND', 'No encontramos a esa persona'))
      return
    }
    res.json(ficha)
  } catch (err) {
    next(err)
  }
})
```

Importar `notFound` desde `../lib/errors.js` si no está ya importado.

- [ ] **Paso 5: correr, verificar a mano y commitear**

```bash
cd server && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run && npm run typecheck
cd /tmp/ccm-crm && git fetch origin -q && git rebase origin/main
git add server/src/services/personService.ts server/src/services/personService.test.ts server/src/routes/admin.ts
git commit -m "feat(personas): GET /admin/people/:id — ficha completa

Los campos vienen con su procedencia (source + capturedAt): es el dato que hace valiosa
a la base propia y por eso la Persona no los copia."
```

---

### Tarea 9: Hooks de datos en el front

**Archivos:**
- Modificar: `src/data/queries.ts`

**Interfaces:**
- Consume: `GET /admin/people`, `GET /admin/people/:id`.
- Produce: `usePeople(q: string)`, `usePerson(id: string | null)`, y los tipos `PersonaListItem` / `PersonaFicha`.

- [ ] **Paso 1: implementar**

Agregar al final de `src/data/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { createApi } from '../lib/api'
import { apiBase } from './store'

const api = createApi(apiBase)

export interface PersonaListItem {
  id: string
  nombre: string | null
  email: string | null
  telefono: string | null
  dni: string | null
  esSocio: boolean
  inscripciones: number
  postulaciones: number
  creadaEl: string
  ultimaActividad: string | null
}

export interface PersonaCampo { key: string; value: string; source: string; capturedAt: string }

export interface PersonaFicha extends PersonaListItem {
  campos: PersonaCampo[]
  consentimientos: { terms: string | null; news: string | null; sponsors: string | null }
  inscripcionesDetalle: { id: string; eventId: string; blockId: string | null; status: string; ts: string }[]
  postulacionesDetalle: { id: string; convocatoriaId: string; status: string; ts: string; data: unknown }[]
  membresia: { tier: string; since: string | null } | null
  actividad: { type: string; ts: string; meta: unknown }[]
}

interface RespuestaLista { items: PersonaListItem[]; nextCursor: string | null; anonimos: number }

/** Lista de usuarios del CRM. `q` ya viene con debounce desde la página. */
export function usePeople(q: string) {
  return useQuery<RespuestaLista>({
    queryKey: ['people', q],
    queryFn: () => api.get<RespuestaLista>(`/admin/people${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  })
}

export function usePerson(id: string | null) {
  return useQuery<PersonaFicha>({
    queryKey: ['people', 'ficha', id],
    queryFn: () => api.get<PersonaFicha>(`/admin/people/${id}`),
    enabled: id !== null,
  })
}
```

El cliente se arma con las piezas que ya existen — `createApi` vive en `src/lib/api.ts` y `apiBase` se exporta desde `src/data/store/index.ts`:

```ts
import { createApi } from '../lib/api'
import { apiBase } from './store'

const api = createApi(apiBase)
```

`createApi` ya agrega el `Authorization` de la sesión en las rutas `/admin/*`, así que no hace falta plomería de auth.

- [ ] **Paso 2: verificar tipos**

Ejecutar: `cd /tmp/ccm-crm && npx tsc -b`
Esperado: sin errores.

- [ ] **Paso 3: commitear**

```bash
git add src/data/queries.ts
git commit -m "feat(personas): hooks usePeople y usePerson"
```

---

### Tarea 10: La tabla de usuarios

**Archivos:**
- Crear: `src/features/admin/UsuariosTabla.tsx`
- Test: `src/features/admin/UsuariosTabla.test.tsx`

**Interfaces:**
- Consume: `PersonaListItem` de la Tarea 9.
- Produce: `<UsuariosTabla items={...} onAbrir={(id) => void} />`

- [ ] **Paso 1: escribir el test que falla**

```tsx
// src/features/admin/UsuariosTabla.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UsuariosTabla } from './UsuariosTabla'
import type { PersonaListItem } from '../../data/queries'

const persona: PersonaListItem = {
  id: 'p1', nombre: 'Ana Pérez', email: 'ana@x.com', telefono: '351 555', dni: '38456120',
  esSocio: true, inscripciones: 2, postulaciones: 1,
  creadaEl: '2026-07-01T10:00:00.000Z', ultimaActividad: '2026-07-19T10:00:00.000Z',
}

describe('UsuariosTabla', () => {
  it('muestra el nombre y el contacto', () => {
    render(<UsuariosTabla items={[persona]} onAbrir={() => {}} />)
    expect(screen.getByText('Ana Pérez')).toBeTruthy()
    expect(screen.getByText('ana@x.com')).toBeTruthy()
  })

  it('marca a los socios', () => {
    render(<UsuariosTabla items={[persona]} onAbrir={() => {}} />)
    expect(screen.getByText(/socio/i)).toBeTruthy()
  })

  it('avisa cuando alguien no dejó su nombre', () => {
    render(<UsuariosTabla items={[{ ...persona, nombre: null }]} onAbrir={() => {}} />)
    expect(screen.getByText(/sin nombre/i)).toBeTruthy()
  })

  it('abre la ficha al tocar la fila', () => {
    const onAbrir = vi.fn()
    render(<UsuariosTabla items={[persona]} onAbrir={onAbrir} />)
    fireEvent.click(screen.getByText('Ana Pérez'))
    expect(onAbrir).toHaveBeenCalledWith('p1')
  })
})
```

- [ ] **Paso 2: instalar testing-library si falta y correr**

```bash
cd /tmp/ccm-crm
npm ls @testing-library/react >/dev/null 2>&1 || npm install --save-dev @testing-library/react @testing-library/dom
npx vitest run src/features/admin/UsuariosTabla.test.tsx
```
Esperado: FALLA — no existe `./UsuariosTabla`.

- [ ] **Paso 3: implementar**

```tsx
// src/features/admin/UsuariosTabla.tsx
import { Badge } from '../../components/ui'
import { formatRelative } from './coreFormat'
import type { PersonaListItem } from '../../data/queries'

interface Props {
  items: PersonaListItem[]
  onAbrir: (id: string) => void
}

/**
 * Lista de usuarios. En pantallas chicas se muestra como tarjetas apiladas: cuatro columnas
 * de datos no entran en un celular, y el equipo usa esto desde el teléfono durante el evento.
 */
export function UsuariosTabla({ items, onAbrir }: Props) {
  return (
    <ul className="divide-y divide-line">
      {items.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onAbrir(p.id)}
            className="flex w-full flex-col gap-2 px-1 py-4 text-left transition-colors hover:bg-bg/60 sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-ink">
                {p.nombre ?? <span className="text-ink-soft">Sin nombre</span>}
              </span>
              <span className="mt-0.5 block truncate text-xs text-ink-soft">
                {[p.email, p.telefono].filter(Boolean).join(' · ') || 'Sin contacto'}
              </span>
            </span>

            <span className="flex flex-wrap items-center gap-1.5">
              {p.esSocio && <Badge tone="accent">Socio</Badge>}
              {p.inscripciones > 0 && <Badge tone="success">{p.inscripciones} inscripción{p.inscripciones > 1 ? 'es' : ''}</Badge>}
              {p.postulaciones > 0 && <Badge tone="neutral">{p.postulaciones} postulación{p.postulaciones > 1 ? 'es' : ''}</Badge>}
            </span>

            <span className="shrink-0 text-xs text-ink-soft sm:w-32 sm:text-right">
              {p.ultimaActividad ? formatRelative(p.ultimaActividad) : '—'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
```


- [ ] **Paso 4: correr y ver que pasa**

Ejecutar: `npx vitest run src/features/admin/UsuariosTabla.test.tsx`
Esperado: PASA — 4 tests.

- [ ] **Paso 5: commitear**

```bash
git add src/features/admin/UsuariosTabla.tsx src/features/admin/UsuariosTabla.test.tsx package.json package-lock.json
git commit -m "feat(personas): tabla de usuarios, tarjetas apiladas en celular"
```

---

### Tarea 11: La ficha en panel lateral

**Archivos:**
- Crear: `src/features/admin/UsuarioFicha.tsx`

**Interfaces:**
- Consume: `usePerson` de la Tarea 9; `Sheet` de `src/components/ui`.
- Produce: `<UsuarioFicha personId={string | null} onClose={() => void} />`

- [ ] **Paso 1: implementar**

```tsx
// src/features/admin/UsuarioFicha.tsx
import { Badge, Sheet } from '../../components/ui'
import { usePerson } from '../../data/queries'
import { PROFILE_FIELD_LABELS, formatDateTime, formatRelative, sourceLabel, APPLICATION_STATUS_META } from './coreFormat'
import type { ProfileFieldKey } from '../../data/types'

interface Props {
  personId: string | null
  onClose: () => void
}

/**
 * Ficha completa en panel lateral (no página nueva): así no se pierden los filtros ni la
 * posición en la lista al volver.
 */
export function UsuarioFicha({ personId, onClose }: Props) {
  const { data, isLoading, isError, error } = usePerson(personId)

  return (
    <Sheet open={personId !== null} onClose={onClose} title={data?.nombre ?? 'Ficha'} size="lg">
      {isLoading && <p className="py-8 text-center text-sm text-ink-soft">Cargando…</p>}

      {isError && (
        <p className="py-8 text-center text-sm text-danger">
          No se pudo cargar la ficha: {(error as Error).message}
        </p>
      )}

      {data && (
        <div className="space-y-7">
          <div className="flex flex-wrap gap-1.5">
            {data.esSocio && <Badge tone="accent">Socio</Badge>}
            {data.inscripciones > 0 && <Badge tone="success">{data.inscripciones} inscripciones</Badge>}
            {data.postulaciones > 0 && <Badge tone="neutral">{data.postulaciones} postulaciones</Badge>}
          </div>

          <section>
            <p className="eyebrow text-[9px] text-ink-soft">Datos, y de dónde salió cada uno</p>
            {data.campos.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">Todavía no dejó ningún dato.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {data.campos.map((c) => (
                  <li key={c.key} className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-[13px] text-ink-soft">
                      {PROFILE_FIELD_LABELS[c.key as ProfileFieldKey] ?? c.key}
                    </span>
                    <span className="text-[13px] text-ink">{c.value}</span>
                    <span className="w-full text-[11px] text-ink-soft/70">
                      {sourceLabel(c.source)} · {formatDateTime(c.capturedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="eyebrow text-[9px] text-ink-soft">Consentimientos</p>
            <ul className="mt-3 space-y-2">
              {([['terms', 'Términos y condiciones'], ['news', 'Novedades por email'], ['sponsors', 'Compartir datos con sponsors']] as const).map(
                ([k, label]) => (
                  <li key={k} className="flex items-baseline justify-between gap-4">
                    <span className="text-[13px] text-ink">{label}</span>
                    <span className="text-[11px] text-ink-soft">
                      {data.consentimientos[k] ? formatDateTime(data.consentimientos[k]!) : 'Sin otorgar'}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </section>

          <section>
            <p className="eyebrow text-[9px] text-ink-soft">Entradas y pagos</p>
            <p className="mt-3 text-sm text-ink-soft">
              Sin entradas todavía. Se va a llenar cuando esté activo el cobro por Mercado Pago.
            </p>
          </section>

          {data.postulacionesDetalle.length > 0 && (
            <section>
              <p className="eyebrow text-[9px] text-ink-soft">Postulaciones</p>
              <ul className="mt-3 space-y-3">
                {data.postulacionesDetalle.map((a) => (
                  <li key={a.id} className="rounded-sm border border-line p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] text-ink">{a.convocatoriaId}</span>
                      <Badge tone={APPLICATION_STATUS_META[a.status as keyof typeof APPLICATION_STATUS_META]?.tone ?? 'neutral'}>
                        {APPLICATION_STATUS_META[a.status as keyof typeof APPLICATION_STATUS_META]?.label ?? a.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-soft">{formatDateTime(a.ts)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.actividad.length > 0 && (
            <section>
              <p className="eyebrow text-[9px] text-ink-soft">Actividad</p>
              <ul className="mt-3 space-y-1.5">
                {data.actividad.slice(0, 25).map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 text-[12px]">
                    <span className="text-ink">{a.type}</span>
                    <span className="text-ink-soft">{formatRelative(a.ts)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  )
}
```

- [ ] **Paso 2: verificar tipos**

Ejecutar: `npx tsc -b`
Esperado: sin errores.

- [ ] **Paso 3: commitear**

```bash
git add src/features/admin/UsuarioFicha.tsx
git commit -m "feat(personas): ficha en panel lateral con la procedencia de cada dato"
```

---

### Tarea 12: La página, la ruta y el menú

Cierra la fase: conecta todo y retira la página vieja.

**Archivos:**
- Crear: `src/pages/admin/AdminUsuarios.tsx`
- Modificar: `src/App.tsx:49,139`, `src/components/layout/AdminLayout.tsx:46,62`
- Borrar: `src/pages/admin/AdminPersonas.tsx`

- [ ] **Paso 1: crear la página**

```tsx
// src/pages/admin/AdminUsuarios.tsx
import { useEffect, useState } from 'react'
import { Input } from '../../components/ui'
import { usePeople } from '../../data/queries'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { UsuariosTabla } from '../../features/admin/UsuariosTabla'
import { UsuarioFicha } from '../../features/admin/UsuarioFicha'

export default function AdminUsuarios() {
  const [texto, setTexto] = useState('')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)

  // Debounce: sin esto sale una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(texto), 300)
    return () => clearTimeout(t)
  }, [texto])

  const { data, isLoading, isError, error } = usePeople(q)

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        eyebrow="CRM"
        title="Usuarios"
        lead="Toda la gente que pasó por CCM: quién es, qué hizo y cómo contactarla."
      />

      <div className="mt-8 max-w-md">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre, email, teléfono o DNI…"
          aria-label="Buscar usuarios"
        />
      </div>

      <div className="mt-6">
        {isLoading && <p className="py-10 text-center text-sm text-ink-soft">Cargando…</p>}

        {isError && (
          <p className="py-10 text-center text-sm text-danger">
            No se pudo cargar la lista: {(error as Error).message}
          </p>
        )}

        {data && data.items.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-soft">
            {q
              ? `Sin resultados para «${q}».`
              : 'Todavía no hay nadie cargado. La lista se llena sola cuando la gente se registre, se inscriba o se postule.'}
          </p>
        )}

        {data && data.items.length > 0 && (
          <UsuariosTabla items={data.items} onAbrir={setAbierta} />
        )}

        {data && data.anonimos > 0 && (
          <p className="mt-8 border-t border-line pt-5 text-xs text-ink-soft">
            Además, {data.anonimos} dispositivo{data.anonimos > 1 ? 's' : ''} anónimo
            {data.anonimos > 1 ? 's' : ''} visitó la app sin dejar datos.
          </p>
        )}
      </div>

      <UsuarioFicha personId={abierta} onClose={() => setAbierta(null)} />
    </div>
  )
}
```


- [ ] **Paso 2: cambiar la ruta**

En `src/App.tsx` línea 49, reemplazar:
```ts
const AdminPersonas = lazyWithReload(() => import('./pages/admin/AdminPersonas'))
```
por:
```ts
const AdminUsuarios = lazyWithReload(() => import('./pages/admin/AdminUsuarios'))
```

Y en la línea 139:
```tsx
{ path: 'personas', element: <SA><AdminUsuarios /></SA> },
```
(se conserva la ruta `personas` para no romper enlaces guardados.)

- [ ] **Paso 3: cambiar el menú**

En `src/components/layout/AdminLayout.tsx` línea 46:
```ts
  { to: '/admin/personas', label: 'Usuarios', icon: Users, needs: 'people:read' },
```
y línea 62 (menú de celular):
```ts
  { to: '/admin/personas', label: 'Usuarios', icon: Users },
```

- [ ] **Paso 4: borrar la página vieja**

```bash
cd /tmp/ccm-crm && git rm src/pages/admin/AdminPersonas.tsx
```

- [ ] **Paso 5: verificar todo**

```bash
cd /tmp/ccm-crm
npx tsc -b && npx vitest run && npx vite build
cd server && npm run typecheck && DATABASE_URL="postgresql://$USER@localhost:5432/ccm_crm_test" npx vitest run
```
Esperado: todo verde. Ningún import huérfano de `AdminPersonas`.

- [ ] **Paso 6: probar el circuito real en el navegador**

```bash
cd /tmp/ccm-crm && VITE_BASE=/ VITE_API_URL=http://localhost:4050 npx vite build
```
Levantar el server local contra `ccm_local` (con el backfill ya corrido), abrir `/admin/personas` y confirmar: aparecen las personas de las postulaciones, el buscador filtra, se abre la ficha y muestra los datos con su procedencia.

- [ ] **Paso 7: commitear**

```bash
cd /tmp/ccm-crm && git fetch origin -q && git rebase origin/main
git add -A src/pages/admin src/App.tsx src/components/layout/AdminLayout.tsx
git commit -m "feat(personas): la página Personas pasa a ser el CRM de Usuarios

Reemplaza la pantalla que mostraba un solo dispositivo (el del propio admin) por la lista
real con buscador y la ficha completa. La ruta /admin/personas se conserva para no romper
enlaces guardados; el menú ahora dice Usuarios y exige people:read."
```

---

## Verificación final de la fase

- [ ] `npx tsc -b` y `cd server && npm run typecheck` — verdes.
- [ ] `npx vitest run` (front) y `cd server && npx vitest run` — verdes.
- [ ] `npx vite build` — verde.
- [ ] Backfill corrido sobre la base local; las personas aparecen en la lista.
- [ ] El buscador filtra por nombre, email y DNI.
- [ ] La ficha muestra la procedencia de cada dato.
- [ ] Un usuario con rol CONTENT no ve la sección en el menú y recibe 403 en el endpoint.
- [ ] PR abierto contra `main`, rebasado justo antes de mergear (3 sesiones paralelas tocando los mismos archivos).
- [ ] **En producción, correr el backfill después del deploy** — sin eso la lista sale vacía aunque haya datos.
