# Rediseño de Postulaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que decidir una postulación deje rastro, avise al postulante de verdad y no se pueda disparar dos veces por accidente.

**Architecture:** Cuatro campos nuevos en `Application` (sin tabla de historial). `decideApplication` deja de ser un `update` ciego y pasa a ser una transición condicionada al estado de origen. El envío de mail es best-effort y ocurre **después** de persistir, reutilizando el `mailer` y las `templates` que ya construyó el login por OTP. En el front, la ficha se muda a una ruta propia y la lista deja de caer al seed cuando el fetch falla.

**Tech Stack:** Express + Prisma + Postgres (server), Vite + React 19 + TypeScript + Tailwind 4 (front), Vitest en ambos lados.

## Global Constraints

- Español rioplatense en todo texto visible y en los comentarios de código.
- `decisionNote` es **interna**: no puede aparecer nunca en el asunto ni en el cuerpo de ningún mail.
- Una postulación con `fromSeed: true` se puede decidir, pero **nunca** dispara un envío.
- Que falle el envío **no** revierte la decisión: son dos hechos distintos y se muestran por separado.
- No poder avisar (sin email en la convocatoria) **no** bloquea decidir.
- `decidedBy` guarda el **email** del admin, no su id ni su nombre.
- Los tests que tocan mail usan `getDevOutbox()` / `clearDevOutbox()` de `server/src/mail/mailer.ts`.
- Typecheck del front es `npx tsc -b --noEmit` (no `tsc --noEmit`).

---

## File Structure

**Server**
- `server/prisma/schema.prisma` — 4 campos nuevos en `Application`
- `server/src/services/applicationService.ts` — transición, guards, envío, paginación
- `server/src/services/applicationService.test.ts` *(nuevo)* — tests del servicio
- `server/src/mail/templates.ts` — 2 plantillas nuevas
- `server/src/mail/templates.test.ts` — tests de las plantillas
- `server/src/routes/admin.ts:186-202` — enum del PATCH + query params del GET

**Front**
- `src/data/store/DataStore.ts:207`, `LocalDataStore.ts:708`, `RemoteDataStore.ts:940` — ampliar el tipo para permitir volver a revisión
- `src/pages/admin/AdminPostulaciones.tsx` — lista: buscador, filtro, demo aparte, sin fallback al seed
- `src/pages/admin/AdminPostulacionDetalle.tsx` *(nuevo)* — la ficha en su propia ruta
- `src/features/admin/OpsApplicationCard.tsx` — card sin acordeón, enlaza a la ficha
- `src/features/admin/OpsDecisionSheet.tsx` *(nuevo)* — panel de decisión con preview del mail
- `src/App.tsx:137` — ruta `postulaciones/:id`

---

### Task 1: Campos nuevos en Application

**Files:**
- Modify: `server/prisma/schema.prisma` (model `Application`)

**Interfaces:**
- Consumes: nada
- Produces: campos `decidedBy: string | null`, `decisionNote: string | null`, `notifiedAt: Date | null`, `notifyError: string | null` en el modelo `Application`

- [ ] **Step 1: Agregar los campos al modelo**

En `server/prisma/schema.prisma`, dentro de `model Application`, después de `decidedAt DateTime?`:

```prisma
  /// EMAIL del admin que decidió. Sin FK a propósito (igual criterio que AdminUser.invitedBy):
  /// si esa persona se da de baja, la decisión que tomó no debe desaparecer ni bloquear el borrado.
  decidedBy    String?
  /// Nota INTERNA del equipo. Nunca viaja al postulante.
  decisionNote String?   @db.Text
  /// Cuándo salió el aviso. null = no se mandó (ver notifyError para saber si fue por un fallo).
  notifiedAt   DateTime?
  /// Por qué no salió, si falló. Se muestra en la ficha con opción de reintentar.
  notifyError  String?
```

- [ ] **Step 2: Aplicar el cambio a la base local**

```bash
cd server && npx prisma db push --skip-generate && npx prisma generate
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Verificar que el cliente tipa los campos**

```bash
cd server && npx tsc --noEmit -p tsconfig.json
```

Expected: sin errores (exit 0).

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(db): registrar quién decidió una postulación, por qué y si se avisó"
```

---

### Task 2: Decidir es una transición, no un update

Hoy `decideApplication` hace un `update` por id sin mirar el estado de origen, aunque su docstring dice "Solo desde 'preinscripta'". Doble click son dos decisiones — y cuando haya mail, dos mails.

**Files:**
- Modify: `server/src/services/applicationService.ts:72-75`
- Test: `server/src/services/applicationService.test.ts` (crear)

**Interfaces:**
- Consumes: campos de Task 1
- Produces: `decideApplication(id: string, status: 'aceptada' | 'rechazada' | 'preinscripta', opts: { adminUserId: string; note?: string }): Promise<void>` — lanza `conflict('APPLICATION_ALREADY_DECIDED', …)` si la transición no aplica

- [ ] **Step 1: Escribir el test que falla**

Crear `server/src/services/applicationService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = {
  application: { updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  adminUser: { findUnique: vi.fn() },
}
vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { decideApplication } = await import('./applicationService.js')

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.adminUser.findUnique.mockResolvedValue({ email: 'gaston@ccm.test' })
  mockPrisma.application.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.application.findUnique.mockResolvedValue({
    id: 'app-1', status: 'aceptada', fromSeed: false, data: {}, convocatoria: { title: 'Camino a CCM' },
  })
})

describe('decideApplication — transición condicionada', () => {
  it('exige que la postulación esté en preinscripta', async () => {
    await decideApplication('app-1', 'aceptada', { adminUserId: 'u1' })
    const args = mockPrisma.application.updateMany.mock.calls[0][0]
    expect(args.where).toMatchObject({ id: 'app-1', status: 'preinscripta' })
  })

  it('guarda el EMAIL de quien decidió, no su id', async () => {
    await decideApplication('app-1', 'aceptada', { adminUserId: 'u1' })
    const args = mockPrisma.application.updateMany.mock.calls[0][0]
    expect(args.data.decidedBy).toBe('gaston@ccm.test')
  })

  it('si ya estaba decidida (count 0) tira 409 y no sigue', async () => {
    mockPrisma.application.updateMany.mockResolvedValue({ count: 0 })
    await expect(decideApplication('app-1', 'aceptada', { adminUserId: 'u1' })).rejects.toMatchObject({
      status: 409,
    })
  })

  it('la nota es opcional: rechazar sin nota funciona', async () => {
    await decideApplication('app-1', 'rechazada', { adminUserId: 'u1' })
    expect(mockPrisma.application.updateMany).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd server && npx vitest run src/services/applicationService.test.ts
```

Expected: FAIL — `decideApplication` recibe 2 argumentos, no 3, y usa `update` en vez de `updateMany`.

- [ ] **Step 3: Reescribir decideApplication**

Reemplazar `server/src/services/applicationService.ts:72-75` por:

```ts
/**
 * Decide una postulación. Es una TRANSICIÓN, no un update: exige que esté en el estado de
 * origen esperado. Sin eso, un doble click aplicaba dos decisiones — y con el aviso conectado,
 * mandaba dos mails a la misma persona.
 *
 * `preinscripta` como destino es "volver a revisión": la única transición que parte de una
 * postulación ya decidida.
 */
export async function decideApplication(
  id: string,
  status: 'aceptada' | 'rechazada' | 'preinscripta',
  opts: { adminUserId: string; note?: string },
): Promise<void> {
  const volviendo = status === 'preinscripta'
  const admin = await prisma.adminUser.findUnique({
    where: { id: opts.adminUserId },
    select: { email: true },
  })
  const { count } = await prisma.application.updateMany({
    // Volver a revisión parte de una decidida; decidir parte de una pendiente.
    where: volviendo ? { id, status: { in: ['aceptada', 'rechazada'] } } : { id, status: 'preinscripta' },
    data: volviendo
      ? { status, decidedAt: null, decidedBy: null, decisionNote: null, notifiedAt: null, notifyError: null }
      : { status, decidedAt: new Date(), decidedBy: admin?.email ?? null, decisionNote: opts.note?.trim() || null },
  })
  if (count === 0) {
    throw conflict(
      'APPLICATION_ALREADY_DECIDED',
      volviendo ? 'Esta postulación no está decidida.' : 'Esta postulación ya fue decidida.',
    )
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd server && npx vitest run src/services/applicationService.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Actualizar el llamador de la ruta**

En `server/src/routes/admin.ts`, reemplazar el `decideSchema` y el handler (líneas ~193-201):

```ts
const decideSchema = z.object({
  status: z.enum(['aceptada', 'rechazada', 'preinscripta']),
  note: z.string().max(2000).optional(),
})
adminRouter.patch('/admin/applications/:id', requirePermission('applications:decide'), async (req, res, next) => {
  try {
    const { status, note } = decideSchema.parse(req.body)
    await applicationService.decideApplication(req.params.id, status, {
      adminUserId: req.admin!.userId,
      ...(note ? { note } : {}),
    })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 6: Verificar typecheck y suite completa**

```bash
cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run
```

Expected: sin errores de tipos, todos los tests en verde.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/applicationService.ts server/src/services/applicationService.test.ts server/src/routes/admin.ts
git commit -m "fix(postulaciones): decidir es una transición — doble click ya no son dos decisiones"
```

---

### Task 3: Plantillas de aceptación y rechazo

**Files:**
- Modify: `server/src/mail/templates.ts`
- Test: `server/src/mail/templates.test.ts`

**Interfaces:**
- Consumes: helpers privados ya existentes en el archivo (`shell`, `h1`, `p`, `esc`, `INK`, `MUTED`)
- Produces: `applicationAcceptedEmail(opts: { name: string; convocatoria: string }): EmailMsg` y `applicationRejectedEmail(opts: { name: string; convocatoria: string }): EmailMsg`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `server/src/mail/templates.test.ts`:

```ts
import { applicationAcceptedEmail, applicationRejectedEmail } from './templates.js'

describe('applicationAcceptedEmail', () => {
  const msg = applicationAcceptedEmail({ name: 'Lautaro', convocatoria: 'Camino a CCM 2026' })

  it('saluda por el nombre y nombra la convocatoria', () => {
    expect(msg.html).toContain('Lautaro')
    expect(msg.html).toContain('Camino a CCM 2026')
    expect(msg.text).toContain('Lautaro')
  })

  it('el asunto dice que quedó seleccionado, sin que haya que abrirlo', () => {
    expect(msg.subject.toLowerCase()).toContain('camino a ccm 2026')
  })
})

describe('applicationRejectedEmail', () => {
  const msg = applicationRejectedEmail({ name: 'Abril', convocatoria: 'Camino a CCM 2026' })

  it('es cordial y nombra a la persona', () => {
    expect(msg.html).toContain('Abril')
    expect(msg.text).toContain('Abril')
  })

  // El motivo es interno del equipo. Que se filtre a un mail es el peor bug posible acá.
  it('NUNCA incluye la nota interna, ni aunque se la pasen', () => {
    const conNota = applicationRejectedEmail({
      name: 'Abril',
      convocatoria: 'Camino a CCM 2026',
      // @ts-expect-error — la firma no acepta nota; el test blinda que siga siendo así
      note: 'no cumple el perfil, portfolio flojo',
    })
    expect(conNota.html).not.toContain('portfolio flojo')
    expect(conNota.text).not.toContain('portfolio flojo')
    expect(conNota.subject).not.toContain('portfolio flojo')
  })

  it('escapa el HTML de lo que venga de la base', () => {
    const m = applicationRejectedEmail({ name: '<script>x</script>', convocatoria: 'C' })
    expect(m.html).not.toContain('<script>x</script>')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd server && npx vitest run src/mail/templates.test.ts
```

Expected: FAIL — `applicationAcceptedEmail` no existe.

- [ ] **Step 3: Escribir las plantillas**

Agregar al final de `server/src/mail/templates.ts`:

```ts
/**
 * Aviso de que la postulación entró. Es el SEGUNDO aviso, no el primero: el postulante ya vio
 * el estado en la app apenas se guardó la decisión. Por eso el mail suma los próximos pasos en
 * vez de limitarse a anunciar.
 */
export function applicationAcceptedEmail(opts: { name: string; convocatoria: string }): EmailMsg {
  const conv = esc(opts.convocatoria)
  const inner = `
    ${h1('Quedaste seleccionado')}
    ${p(`Hola ${esc(opts.name)}. Tu postulación a <strong style="color:${INK};">${conv}</strong> fue aceptada por el equipo de CCM.`)}
    ${p('En los próximos días te escribimos con los detalles de la fecha, el lugar y lo que tenés que llevar. Si tenés alguna consulta, respondé este mail.')}`
  const text = `Quedaste seleccionado.

Hola ${opts.name}. Tu postulación a ${opts.convocatoria} fue aceptada por el equipo de CCM.

En los próximos días te escribimos con los detalles de la fecha, el lugar y lo que tenés que llevar.
Si tenés alguna consulta, respondé este mail.`
  return {
    subject: `Quedaste seleccionado — ${opts.convocatoria}`,
    html: shell({ preview: `Tu postulación a ${opts.convocatoria} fue aceptada.`, inner }),
    text,
  }
}

/**
 * Aviso de que la postulación no entró. Corto y cordial.
 *
 * La firma NO acepta el motivo a propósito: `decisionNote` es una nota interna del equipo y
 * filtrarla sería el peor bug de esta pantalla. Que no exista el parámetro es la garantía.
 */
export function applicationRejectedEmail(opts: { name: string; convocatoria: string }): EmailMsg {
  const conv = esc(opts.convocatoria)
  const inner = `
    ${h1('Sobre tu postulación')}
    ${p(`Hola ${esc(opts.name)}. Gracias por postularte a <strong style="color:${INK};">${conv}</strong>.`)}
    ${p('Esta vez no pudimos darte un lugar. Recibimos muchas más postulaciones que cupos, y la decisión fue difícil.')}
    ${p('Nos gustaría verte en las próximas convocatorias. Seguí atento, que van a salir pronto.')}`
  const text = `Sobre tu postulación.

Hola ${opts.name}. Gracias por postularte a ${opts.convocatoria}.

Esta vez no pudimos darte un lugar. Recibimos muchas más postulaciones que cupos, y la decisión fue difícil.

Nos gustaría verte en las próximas convocatorias. Seguí atento, que van a salir pronto.`
  return {
    subject: `Sobre tu postulación a ${opts.convocatoria}`,
    html: shell({ preview: 'Gracias por postularte a CCM.', inner }),
    text,
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
cd server && npx vitest run src/mail/templates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/mail/templates.ts server/src/mail/templates.test.ts
git commit -m "feat(mail): plantillas de aceptación y rechazo de postulaciones"
```

---

### Task 4: Enviar el aviso, sin que un fallo revierta la decisión

**Files:**
- Modify: `server/src/services/applicationService.ts`
- Test: `server/src/services/applicationService.test.ts`

**Interfaces:**
- Consumes: `decideApplication` de Task 2, plantillas de Task 3, `getMailer()` de `../mail/mailer.js`
- Produces: `decideApplication` con un cuarto comportamiento — intenta avisar y registra `notifiedAt` / `notifyError`; acepta `opts.skipEmail?: boolean`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `server/src/services/applicationService.test.ts`:

```ts
import { getDevOutbox, clearDevOutbox } from '../mail/mailer.js'

describe('decideApplication — aviso al postulante', () => {
  beforeEach(() => clearDevOutbox())

  it('manda el mail al email que cargó el postulante', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-1', status: 'aceptada', fromSeed: false,
      data: { nombre: 'Lautaro', email: 'lau@mail.test' },
      convocatoria: { title: 'Camino a CCM' },
    })
    await decideApplication('app-1', 'aceptada', { adminUserId: 'u1' })
    expect(getDevOutbox()).toHaveLength(1)
    expect(getDevOutbox()[0].to).toBe('lau@mail.test')
  })

  // Una postulación de demo trae un email de aspecto real que no es de nadie —o peor, de alguien.
  it('NUNCA le manda mail a una postulación de demo', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-seed', status: 'aceptada', fromSeed: true,
      data: { nombre: 'Demo', email: 'milagros.soria.disenio@gmail.com' },
      convocatoria: { title: 'Camino a CCM' },
    })
    await decideApplication('app-seed', 'aceptada', { adminUserId: 'u1' })
    expect(getDevOutbox()).toHaveLength(0)
  })

  it('sin email en la postulación, decide igual y no intenta enviar', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-2', status: 'aceptada', fromSeed: false,
      data: { nombre: 'Sin Mail' }, convocatoria: { title: 'Camino a CCM' },
    })
    await expect(decideApplication('app-2', 'aceptada', { adminUserId: 'u1' })).resolves.toBeUndefined()
    expect(getDevOutbox()).toHaveLength(0)
  })

  it('con skipEmail no manda nada, aunque haya email', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-3', status: 'rechazada', fromSeed: false,
      data: { nombre: 'X', email: 'x@mail.test' }, convocatoria: { title: 'C' },
    })
    await decideApplication('app-3', 'rechazada', { adminUserId: 'u1', skipEmail: true })
    expect(getDevOutbox()).toHaveLength(0)
  })

  it('si el envío falla, la decisión QUEDA y se registra el error', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      id: 'app-4', status: 'aceptada', fromSeed: false,
      data: { nombre: 'Y', email: 'no-existe@' }, convocatoria: { title: 'C' },
    })
    const mailer = await import('../mail/mailer.js')
    vi.spyOn(mailer, 'getMailer').mockReturnValue({
      send: async () => { throw new Error('SMTP caído') },
    })
    await expect(decideApplication('app-4', 'aceptada', { adminUserId: 'u1' })).resolves.toBeUndefined()
    const ultima = mockPrisma.application.updateMany.mock.calls.at(-1)![0]
    expect(ultima.data.notifyError).toContain('SMTP caído')
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd server && npx vitest run src/services/applicationService.test.ts
```

Expected: FAIL — no se manda ningún mail todavía.

- [ ] **Step 3: Agregar el envío**

En `server/src/services/applicationService.ts`, agregar los imports arriba:

```ts
import { getMailer } from '../mail/mailer.js'
import { applicationAcceptedEmail, applicationRejectedEmail } from '../mail/templates.js'
```

Y al final de `decideApplication`, después del `if (count === 0) …`:

```ts
  // Volver a revisión no avisa nada: se está deshaciendo, no comunicando.
  if (volviendo || opts.skipEmail) return

  const app = await prisma.application.findUnique({
    where: { id },
    include: { convocatoria: { select: { title: true } } },
  })
  if (!app) return

  // Las de demo traen un email de aspecto real que no es de nadie. Se decide igual, no se avisa.
  if (app.fromSeed) return

  const data = (app.data ?? {}) as Record<string, string>
  const to = typeof data.email === 'string' ? data.email.trim() : ''
  // Sin email no hay a quién escribirle. La decisión ya quedó guardada: no poder avisar
  // nunca bloquea decidir.
  if (!to) return

  const nombre = typeof data.nombre === 'string' && data.nombre.trim() ? data.nombre.trim() : 'Hola'
  const convocatoria = app.convocatoria?.title ?? 'la convocatoria'
  const msg =
    status === 'aceptada'
      ? applicationAcceptedEmail({ name: nombre, convocatoria })
      : applicationRejectedEmail({ name: nombre, convocatoria })

  // Best-effort y DESPUÉS de persistir: que el correo falle no puede desarmar una decisión
  // que el organizador ya tomó y que el postulante ya ve en su app.
  try {
    await getMailer().send(to, msg)
    await prisma.application.updateMany({ where: { id }, data: { notifiedAt: new Date(), notifyError: null } })
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    await prisma.application.updateMany({ where: { id }, data: { notifyError: detalle.slice(0, 500) } })
  }
```

Y ampliar la firma de `opts`:

```ts
  opts: { adminUserId: string; note?: string; skipEmail?: boolean },
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
cd server && npx vitest run src/services/applicationService.test.ts
```

Expected: PASS (9 tests entre esta task y la anterior).

- [ ] **Step 5: Pasar skipEmail desde la ruta**

En `server/src/routes/admin.ts`, agregar al `decideSchema`:

```ts
  skipEmail: z.boolean().optional(),
```

y al llamado:

```ts
      ...(skipEmail ? { skipEmail } : {}),
```

(desestructurando `skipEmail` del `parse`).

- [ ] **Step 6: Verificar suite completa y typecheck**

```bash
cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run
```

Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/applicationService.ts server/src/services/applicationService.test.ts server/src/routes/admin.ts
git commit -m "feat(postulaciones): avisar al postulante al decidir, sin que un fallo revierta la decisión"
```

---

### Task 5: Paginar y ordenar por antigüedad

Hoy `getApplications` hace `take: 500` con `orderBy: { ts: 'desc' }`: a partir de la 501 se esconden las más viejas, que son justo las que más esperaron respuesta.

**Files:**
- Modify: `server/src/services/applicationService.ts` (`getApplications`)
- Modify: `server/src/routes/admin.ts:186-192`
- Test: `server/src/services/applicationService.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores
- Produces: `getApplications(opts?: { cursor?: string; limit?: number }): Promise<{ items: Application[]; nextCursor: string | null }>`

- [ ] **Step 1: Escribir el test que falla**

```ts
describe('getApplications — cola de revisión', () => {
  it('ordena por más antigua primero: es la que más esperó', async () => {
    mockPrisma.application.findMany.mockResolvedValue([])
    const { getApplications } = await import('./applicationService.js')
    await getApplications()
    const args = mockPrisma.application.findMany.mock.calls[0][0]
    expect(args.orderBy).toMatchObject({ ts: 'asc' })
  })

  it('devuelve nextCursor cuando hay más de una página', async () => {
    const filas = Array.from({ length: 51 }, (_, i) => ({
      id: `app-${i}`, convocatoriaId: 'c1', status: 'preinscripta', data: {}, ts: new Date(), fromSeed: false,
    }))
    mockPrisma.application.findMany.mockResolvedValue(filas)
    const { getApplications } = await import('./applicationService.js')
    const r = await getApplications({ limit: 50 })
    expect(r.items).toHaveLength(50)
    expect(r.nextCursor).toBe('app-49')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd server && npx vitest run src/services/applicationService.test.ts -t "cola de revisión"
```

Expected: FAIL — hoy devuelve un array, no `{ items, nextCursor }`.

- [ ] **Step 3: Reescribir getApplications**

```ts
/**
 * Cola de revisión del admin. Paginada con cursor (mismo patrón que listPeople) y ordenada por
 * la MÁS ANTIGUA primero: en una cola, primero va la que más esperó. Antes era `ts: desc` con
 * `take: 500`, así que al pasar las 500 se ocultaban justamente las más urgentes.
 */
export async function getApplications(opts: { cursor?: string; limit?: number } = {}): Promise<{
  items: Application[]
  nextCursor: string | null
}> {
  const limit = Math.min(opts.limit ?? 50, 100)
  const rows = await prisma.application.findMany({
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: { ts: 'asc' },
  })
  const hayMas = rows.length > limit
  const page = hayMas ? rows.slice(0, limit) : rows
  return { items: page.map(toApplication), nextCursor: hayMas ? page[page.length - 1].id : null }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
cd server && npx vitest run src/services/applicationService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Actualizar la ruta**

En `server/src/routes/admin.ts`, el GET de applications:

```ts
const listAppsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})
adminRouter.get('/admin/applications', requirePermission('applications:read'), async (req, res, next) => {
  try {
    const q = listAppsSchema.parse(req.query)
    res.json(await applicationService.getApplications(q))
  } catch (err) {
    next(err)
  }
})
```

> `applications:read` es el permiso que esta ruta **ya usa** (`routes/admin.ts:186`) y está en el registro de roles (`domain/adminRoles.test.ts:31-34`: lo tienen OWNER y EDITOR, no CONTENT ni STAFF). No cambiarlo.

- [ ] **Step 6: Ajustar el consumidor del front**

En `src/data/store/RemoteDataStore.ts`, donde hidrata las postulaciones admin, la respuesta pasa a ser `{ items, nextCursor }`:

```ts
    this.api
      .get<{ items: Application[]; nextCursor: string | null }>('/admin/applications')
      .then((r) => { this.adminApplications = r.items })
```

- [ ] **Step 7: Verificar ambos lados**

```bash
cd server && npx vitest run && npx tsc --noEmit -p tsconfig.json
cd .. && npx tsc -b --noEmit
```

Expected: verde en los tres.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/applicationService.ts server/src/services/applicationService.test.ts server/src/routes/admin.ts src/data/store/RemoteDataStore.ts
git commit -m "fix(postulaciones): paginar por cursor y poner primero la que más esperó"
```

---

### Task 6: Permitir volver a revisión en el front

Tres tipos con `Exclude<ApplicationStatus, 'preinscripta'>` bloquean el "Deshacer" en TypeScript.

**Files:**
- Modify: `src/data/store/DataStore.ts:207`
- Modify: `src/data/store/LocalDataStore.ts:708`
- Modify: `src/data/store/RemoteDataStore.ts:940`

**Interfaces:**
- Consumes: endpoint de Task 2, que ya acepta `preinscripta`
- Produces: `decideApplication(applicationId: string, status: ApplicationStatus, opts?: { note?: string; skipEmail?: boolean }): void` en las tres capas

- [ ] **Step 1: Ampliar el contrato**

En los tres archivos, reemplazar `Exclude<ApplicationStatus, 'preinscripta'>` por `ApplicationStatus` y agregar el tercer parámetro. En `DataStore.ts:207`:

```ts
  /** Decide una postulación. `preinscripta` como destino es "volver a revisión" (deshacer). */
  decideApplication(
    applicationId: string,
    status: ApplicationStatus,
    opts?: { note?: string; skipEmail?: boolean },
  ): void
```

- [ ] **Step 2: Propagar en RemoteDataStore**

En `RemoteDataStore.ts:940`, el body pasa a mandar los campos nuevos:

```ts
  override decideApplication(
    applicationId: string,
    status: ApplicationStatus,
    opts?: { note?: string; skipEmail?: boolean },
  ): void {
    this.adminWrite(
      this.api.patch(`/admin/applications/${applicationId}`, {
        status,
        ...(opts?.note ? { note: opts.note } : {}),
        ...(opts?.skipEmail ? { skipEmail: true } : {}),
      }),
      () => this.hydrateAdminApplications(),
    )
  }
```

- [ ] **Step 3: Verificar typecheck**

```bash
npx tsc -b --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/data/store/DataStore.ts src/data/store/LocalDataStore.ts src/data/store/RemoteDataStore.ts
git commit -m "feat(postulaciones): habilitar volver a revisión en el contrato del store"
```

---

### Task 7: Que la lista no muestre postulaciones falsas

`hydrateAdminApplications` se traga el error con `.catch(() => {})` y `getApplications()` cae en cascada al seed. Es el mismo patrón que ya se corrigió en el Dashboard.

**Files:**
- Modify: `src/data/store/RemoteDataStore.ts`
- Modify: `src/data/store/DataStore.ts`
- Modify: `src/data/store/LocalDataStore.ts`
- Modify: `src/pages/admin/AdminPostulaciones.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `getAdminApplications(): Application[] | null` (null = todavía no hidrató o falló) y `applicationsFailed(): boolean`

- [ ] **Step 1: Agregar el contrato**

En `DataStore.ts`, junto a los otros getters admin:

```ts
  /** Postulaciones para el PANEL. null = no hidratado o falló; nunca cae al seed, porque
   *  mostrar postulaciones de demo como si fueran reales es peor que no mostrar nada. */
  getAdminApplications(): Application[] | null
  applicationsFailed(): boolean
```

En `LocalDataStore.ts`:

```ts
  getAdminApplications(): Application[] | null {
    return null
  }
  applicationsFailed(): boolean {
    return false
  }
```

- [ ] **Step 2: Implementar en RemoteDataStore**

```ts
  private appsError = false

  override getAdminApplications(): Application[] | null {
    return this.adminApplications ?? null
  }
  override applicationsFailed(): boolean {
    return this.appsError
  }
```

Y en `hydrateAdminApplications`, reemplazar el `.catch(() => {})` por:

```ts
      .catch(() => { this.appsError = true })
      .finally(() => bus.emit('applications'))
```

- [ ] **Step 3: Consumirlo en la pantalla**

En `AdminPostulaciones.tsx`, reemplazar la línea 10:

```ts
  const applications = useStore((s) => s.getAdminApplications())
  const fallo = useStore((s) => s.applicationsFailed())
```

y antes del render de la lista:

```tsx
  if (!applications) {
    return (
      <div className="px-5 py-8 md:px-10">
        <SectionTitle eyebrow="Admin · Postulaciones" title="Postulaciones" />
        <p className="mt-8 text-sm text-ink-soft">
          {fallo
            ? 'No pudimos traer las postulaciones. No mostramos nada para no darte una lista equivocada.'
            : 'Cargando…'}
        </p>
      </div>
    )
  }
```

- [ ] **Step 4: Verificar**

```bash
npx tsc -b --noEmit && npx vitest run
```

Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/data/store src/pages/admin/AdminPostulaciones.tsx
git commit -m "fix(postulaciones): si el fetch falla, decirlo en vez de mostrar las de demo"
```

---

### Task 8: La ficha en su propia ruta

**Files:**
- Create: `src/pages/admin/AdminPostulacionDetalle.tsx`
- Modify: `src/App.tsx:137`
- Modify: `src/features/admin/OpsApplicationCard.tsx`

**Interfaces:**
- Consumes: `getAdminApplications()` de Task 7
- Produces: ruta `/admin/postulaciones/:id`

- [ ] **Step 1: Agregar la ruta**

En `src/App.tsx`, junto a la línea 137:

```tsx
            { path: 'postulaciones/:id', element: <SA><AdminPostulacionDetalle /></SA> },
```

con el import lazy correspondiente, siguiendo el patrón de las otras páginas admin del archivo.

- [ ] **Step 2: Crear la página**

`src/pages/admin/AdminPostulacionDetalle.tsx` muestra: volver (preservando la query), nombre, estado, la historia en serif, los datos en dos columnas con email y teléfono accionables, el registro de la decisión (`decidedBy`, `decidedAt`, `notifiedAt` o `notifyError`) y los botones. Navegación con ↑ / ↓ entre postulaciones de la misma lista filtrada.

- [ ] **Step 3: La card enlaza en vez de expandir**

En `OpsApplicationCard.tsx`, sacar el `useState open` y el bloque expandible, y reemplazar el botón "Ver ficha completa" por:

```tsx
        <Link
          to={`/admin/postulaciones/${app.id}`}
          className="eyebrow flex items-center gap-1.5 text-[10px] text-ink-soft transition-colors hover:text-ink"
        >
          Ver ficha completa <ArrowRight size={13} aria-hidden />
        </Link>
```

- [ ] **Step 4: Verificar en el navegador**

Levantar el front, entrar a `/admin/postulaciones`, abrir una ficha y comprobar que la URL cambia y que "Volver" conserva el filtro.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminPostulacionDetalle.tsx src/App.tsx src/features/admin/OpsApplicationCard.tsx
git commit -m "feat(postulaciones): ficha en su propia ruta, compartible con el equipo"
```

---

### Task 9: Panel de decisión con preview del mail y deshacer

**Files:**
- Create: `src/features/admin/OpsDecisionSheet.tsx`
- Modify: `src/pages/admin/AdminPostulacionDetalle.tsx`
- Modify: `src/features/admin/OpsApplicationCard.tsx`

**Interfaces:**
- Consumes: `decideApplication(id, status, { note, skipEmail })` de Task 6
- Produces: `<OpsDecisionSheet app={app} status={'aceptada'|'rechazada'} open onClose />`

- [ ] **Step 1: Crear el panel**

Muestra: a quién se le va a escribir, **el texto real del mail** (no una descripción), un `<Textarea>` de notas internas con la aclaración de que no las ve el postulante, y un check "no enviar mail". Si `app.fromSeed` o no hay `data.email`, en lugar del preview muestra por qué no se va a enviar.

- [ ] **Step 2: Deshacer con la ventana de gracia**

Al confirmar, llamar a `store.decideApplication(...)` y mostrar el toast con acción — el kit ya lo soporta (`Toast.tsx`, `duration = action ? 5000 : 2800`, con precedente de uso en `BlockRow.tsx:58-69`):

```tsx
toast('Postulación aceptada', 'success', {
  label: 'Deshacer',
  onClick: () => store.decideApplication(app.id, 'preinscripta'),
})
```

> Nota: el envío del mail ocurre en el servidor dentro de la misma llamada. La ventana protege del **estado**, no del correo. Si se decide diferir el envío para que "Deshacer" también lo cancele, hace falta una cola en el servidor — está fuera del alcance de este plan y así lo dice el spec.

- [ ] **Step 3: Verificar el circuito completo**

Con el backend local apuntando a la base de auditoría: aceptar una postulación con email y confirmar que llega al `devOutbox` (visible en el log del servidor), que "Deshacer" la vuelve a `preinscripta`, y que una `fromSeed` no dispara envío.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/OpsDecisionSheet.tsx src/pages/admin/AdminPostulacionDetalle.tsx src/features/admin/OpsApplicationCard.tsx
git commit -m "feat(postulaciones): panel de decisión con el mail a la vista y ventana para deshacer"
```

---

### Task 10: Limpiar la lista y las promesas

**Files:**
- Modify: `src/pages/admin/AdminPostulaciones.tsx`
- Modify: `src/features/admin/OpsApplicationCard.tsx`

- [ ] **Step 1: Sacar las promesas incumplidas**

Borrar de `OpsApplicationCard.tsx` el bloque de líneas 106-110 («Al aceptar, en Fase 1 se dispara el mail de invitación + WhatsApp automático»): a partir de la Task 4 el mail **sí** se manda, y WhatsApp no existe. Del lead de `AdminPostulaciones.tsx:27`, sacar «el score IA sugerido llega en Fase 1» y la convocatoria hardcodeada.

- [ ] **Step 2: Buscador y filtro por convocatoria**

Input de búsqueda que filtre por nombre y email sobre `app.data`, y un `<Select>` de convocatoria que aparezca sólo si hay más de una.

- [ ] **Step 3: Separar las de demo**

Las `fromSeed` van en un grupo aparte, bajo un rótulo que diga que son de ejemplo, después de las reales.

- [ ] **Step 4: Verificar en el navegador y commitear**

```bash
git add src/pages/admin/AdminPostulaciones.tsx src/features/admin/OpsApplicationCard.tsx
git commit -m "feat(postulaciones): buscador, filtro por convocatoria y fin de las promesas vacías"
```

---

## Self-Review

**Cobertura del spec:**

| Requisito del spec | Task |
|---|---|
| 4 campos nuevos | 1 |
| Transición condicionada + 409 | 2 |
| `decidedBy` = email resuelto del userId | 2 |
| Nota interna opcional | 2, 9 |
| Plantillas de aceptación y rechazo | 3 |
| La nota nunca viaja al mail | 3 (test con `@ts-expect-error`) |
| Envío best-effort tras persistir | 4 |
| Guard `fromSeed` | 4 |
| Sin email no bloquea | 4 |
| `notifiedAt` / `notifyError` | 4 |
| Paginación con cursor + orden asc | 5 |
| Volver a revisión (tipos) | 6 |
| Sin fallback al seed | 7 |
| Ficha en ruta propia | 8 |
| Preview del mail + deshacer | 9 |
| Sacar promesas, buscador, filtro, demo aparte | 10 |

**Sin cobertura, y es deliberado:** que aceptar cree la `Registration` (el spec lo saca del alcance explícitamente) y WhatsApp.

**Consistencia de tipos:** `decideApplication` tiene la misma firma en Task 2 (server), Task 4 (agrega `skipEmail`) y Task 6 (front). `getApplications` devuelve `{ items, nextCursor }` en Task 5 y así lo consume Task 5 Step 6. `getAdminApplications` devuelve `Application[] | null` en Task 7 y así lo usan Tasks 8 y 10.

**Riesgos, verificados uno por uno:**

- `applications:read` **existe** y ya lo usa la ruta (`routes/admin.ts:186`, cubierto por `domain/adminRoles.test.ts:31-34`). No hay que crear nada.
- Task 4 Step 3 lee `app.data.email`, y el spec ya deja asentado que ese campo **no está garantizado**: depende de cómo el organizador armó la convocatoria. Por eso el camino sin email es un test propio (Task 4 Step 1), no una excepción.
- Task 9 Step 2 usa el toast con acción. Ya existe en el kit y hay precedente de uso (`BlockRow.tsx:58-69`), así que no hace falta construirlo.
- La ventana de "Deshacer" protege el **estado**, no el correo: el mail sale en la misma llamada del servidor. Está dicho en el propio paso y en el spec; cerrar esa brecha requeriría una cola y queda fuera.
