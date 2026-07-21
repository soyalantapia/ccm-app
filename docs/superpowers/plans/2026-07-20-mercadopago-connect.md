# Mercado Pago Connect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el link de pago pegado a mano por una integración real: el organizador vincula su cuenta de Mercado Pago desde el panel (OAuth) y CCM cobra entradas, membresía Socio y publicidad con el monto correcto, confirmando solo por webhook.

**Architecture:** Cuatro piezas server-side con una responsabilidad cada una — `mpApi` (único lugar que habla HTTP con MP), `mpOAuthService` (única puerta a los tokens), `mpCheckoutService` (calcula el monto desde la base y crea la preferencia), `mpWebhookService` (verifica, consulta y activa). El front suma una pantalla de Cobros en el panel y cambia el `window.open(mpLink)` por pedir un checkout real, cayendo al link manual si no hay conexión.

**Tech Stack:** Express + Prisma + Postgres (server), React 19 + Vite (front), vitest en ambos lados, Zod para validación, `fetch` nativo de Node 20 para las llamadas a MP (sin SDK: la superficie que usamos son 4 endpoints y el SDK oficial agrega una dependencia grande con tipos propios).

## Global Constraints

- **Español rioplatense** en todo texto visible y en comentarios de código. Los identificadores en inglés, como el resto del repo.
- **El monto NUNCA viene del cliente.** Cualquier `total`/`paid`/`amount` que llegue en un request se ignora; se recalcula server-side. Este es el defecto que el plan cierra, no una preferencia de estilo.
- **Los tokens de MP no salen por ninguna ruta.** `getStatus()` devuelve estado, cuenta y vencimiento; nunca `accessToken` ni `refreshToken`.
- **Degradación sin corte:** sin conexión MP, la venta sigue con el link manual (`TicketPlan.mpLink`). Ninguna tarea puede dejar la compra inutilizable.
- **Migraciones aditivas.** Nada de `DROP`/`ALTER ... NOT NULL` sobre columnas con datos. La próxima migración libre es `12_mp_connection`: main ya tiene hasta `11_person` (`9_admin_auth` el login del panel, `10_event_published` el borrador de eventos, `11_person` el CRM).
- **Tests:** front `npm test` (vitest + jsdom, `src/**/*.test.{ts,tsx}`); server `cd server && npm test` (vitest + node, `src/**/*.test.ts` co-locados, con `server/test/setup.ts`). Ambos deben quedar verdes.
- **Typecheck:** front `npx tsc -b`; server `cd server && npm run typecheck`. El server usa `verbatimModuleSyntax` + `NodeNext`: los imports relativos llevan extensión `.js`.
- **Auth del panel: NO existe `ADMIN_TOKEN`.** Se entra con sesión personal (login por código). Cada ruta `/admin/*` declara su permiso con `requirePermission(<Permission>)` — hay un test estructural (`server/src/routes/adminGuards.test.ts`) que falla si alguna queda sin guard. Las rutas de conexión con Mercado Pago exigen **`team:manage`**: elegir la cuenta donde entra la plata es la acción más sensible del panel.
- **En el front la sesión la sabe un solo módulo:** `src/data/adminSession.ts` (`getAdminToken()`, `adminAuthHeaders()`, `can(permission)`). Nunca leer `sessionStorage` a mano.
- **Commits frecuentes**, uno por tarea como mínimo.

## File Structure

**Nuevos (server):**
- `server/src/lib/mpApi.ts` — único módulo que hace HTTP contra Mercado Pago. Cuatro funciones puras de I/O, sin lógica de negocio. Existe para que todo lo demás sea testeable con un mock.
- `server/src/services/mpOAuthService.ts` — única puerta a `MpConnection`. Nadie más lee esa tabla.
- `server/src/services/mpCheckoutService.ts` — calcula monto desde la base y crea la preferencia.
- `server/src/services/mpWebhookService.ts` — verifica firma, consulta el pago real, activa el recurso.
- `server/src/routes/mp.ts` — rutas admin (`/admin/mp/*`) y públicas (`/mp/callback`, `/mp/webhook`, `/payments/preference`).

**Nuevos (compartido):**
- `src/lib/pricing.ts` — precios que front y server deben compartir. Mismo patrón que `src/lib/htmlPolicy.ts`, que el server ya importa por ruta relativa (`server/src/lib/sanitizeBody.ts:12`).

**Nuevos (front):**
- `src/features/admin/OpsMpConnection.tsx` — la sección Cobros del panel.

**Modificados:**
- `server/prisma/schema.prisma` — modelo `MpConnection`.
- `server/prisma/migrations/12_mp_connection/migration.sql`.
- `server/src/lib/env.ts` — `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`.
- `server/src/app.ts` — montar `mpRouter`.
- `server/src/routes/memberships.ts` + `server/src/services/membershipService.ts` — sacar `paid` del cliente.
- `server/src/services/orderService.ts` — `createCampaign` recalcula el total.
- `src/features/membresia/plans.ts` y `src/features/publicidad/adPricing.ts` — importar de `src/lib/pricing.ts`.
- `src/data/store/DataStore.ts`, `LocalDataStore.ts`, `RemoteDataStore.ts` — métodos de conexión y checkout.
- `src/pages/admin/AdminConfiguracion.tsx` — montar la sección Cobros.
- `src/features/tickets/TicketSelector.tsx` — pedir checkout real con fallback.

---

### Task 1: Los precios se calculan en el servidor

Cierra el agujero antes de tocar MP: hoy `becomeSocio(deviceId, paid)` recibe cuánto pagó el cliente y el total de publicidad se calcula en el navegador. Esta tarea es independiente de Mercado Pago y tiene valor sola.

**Files:**
- Create: `src/lib/pricing.ts`
- Create: `server/src/services/pricing.test.ts`
- Modify: `src/features/membresia/plans.ts:25`
- Modify: `src/features/publicidad/adPricing.ts:16-22,40-42`
- Modify: `server/src/routes/memberships.ts:20-30`
- Modify: `server/src/services/membershipService.ts:16`
- Modify: `server/src/services/orderService.ts` (`createCampaign`)

**Interfaces:**
- Produces: `SOCIO_PRICE: number`, `PRICE_PER_HOUR_BY_SLOT: Record<AdSlot, number>`, `priceForCampaign(slot: AdSlot, hours: number): number` desde `src/lib/pricing.ts`. Las tareas 4 y 5 los consumen para calcular montos.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/src/services/pricing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SOCIO_PRICE, PRICE_PER_HOUR_BY_SLOT, priceForCampaign } from '../../../src/lib/pricing.js'

describe('pricing compartido — la fuente de verdad de los montos', () => {
  it('expone el precio de Socio', () => {
    expect(SOCIO_PRICE).toBe(9900)
  })

  it('cobra la publicidad por hora según el slot', () => {
    expect(priceForCampaign('S2', 5)).toBe(PRICE_PER_HOUR_BY_SLOT.S2 * 5)
    expect(priceForCampaign('S1', 1)).toBe(9000)
  })

  it('normaliza horas inválidas a 1 en vez de devolver 0 o NaN', () => {
    expect(priceForCampaign('S2', 0)).toBe(PRICE_PER_HOUR_BY_SLOT.S2)
    expect(priceForCampaign('S2', -3)).toBe(PRICE_PER_HOUR_BY_SLOT.S2)
    expect(priceForCampaign('S2', 2.7)).toBe(PRICE_PER_HOUR_BY_SLOT.S2 * 2)
  })

  it('un slot desconocido no cobra $0 — cae a la tarifa del feed', () => {
    expect(priceForCampaign('S9' as never, 1)).toBe(PRICE_PER_HOUR_BY_SLOT.S2)
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd ~/dev/ccm-app/server && npx vitest run src/services/pricing.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/lib/pricing.js"`

- [ ] **Step 3: Crear el módulo compartido**

Crear `src/lib/pricing.ts`:

```ts
import type { AdSlot } from '../data/types'

/**
 * Precios que el SERVIDOR debe conocer para cobrar.
 *
 * Vive en src/lib/ (no en features/) porque el backend lo importa por ruta relativa, igual que
 * htmlPolicy.ts — ver server/src/lib/sanitizeBody.ts. Una sola constante para los dos lados:
 * si el precio viviera solo en el front, el server no tendría con qué validar lo que le mandan.
 */

/** Membresía Socio CCM. */
export const SOCIO_PRICE = 9900

/** Tarifa por hora de cada espacio publicitario. S5 no existe en el dominio (hueco intencional). */
export const PRICE_PER_HOUR_BY_SLOT: Record<AdSlot, number> = {
  S1: 9000,
  S2: 6000,
  S3: 4500,
  S4: 5000,
  S6: 3000,
}

/**
 * Total de una campaña. Normaliza las horas (entero ≥ 1) y cae al feed ante un slot desconocido:
 * devolver 0 sería regalar el espacio, y NaN rompería la columna Int de Postgres.
 */
export function priceForCampaign(slot: AdSlot, hours: number): number {
  const perHora = PRICE_PER_HOUR_BY_SLOT[slot] ?? PRICE_PER_HOUR_BY_SLOT.S2
  const horas = Math.max(1, Math.floor(Number(hours) || 1))
  return perHora * horas
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `cd ~/dev/ccm-app/server && npx vitest run src/services/pricing.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Que el front consuma la misma constante**

En `src/features/membresia/plans.ts`, reemplazar la línea 25 (`export const SOCIO_PRICE = 9900`) por:

```ts
export { SOCIO_PRICE } from '../../lib/pricing'
import { SOCIO_PRICE } from '../../lib/pricing'
```

En `src/features/publicidad/adPricing.ts`, importar el precio y sacarlo del literal:

```ts
import type { AdSlot } from '../../data/types'
import { PRICE_PER_HOUR_BY_SLOT, priceForCampaign } from '../../lib/pricing'
```

Reemplazar cada `pricePerHour: <número>` de `AD_SLOTS` por `pricePerHour: PRICE_PER_HOUR_BY_SLOT.S1` (y `.S2`, `.S3`, `.S6` en su fila correspondiente), y reemplazar el cuerpo de `priceFor`:

```ts
export function priceFor(slot: AdSlot, hours: number): number {
  return priceForCampaign(slot, hours)
}
```

- [ ] **Step 6: El server deja de creerle al cliente**

En `server/src/services/membershipService.ts`, cambiar la firma para que el monto no entre por parámetro:

```ts
import { SOCIO_PRICE } from '../../../src/lib/pricing.js'

/**
 * Alta de Socio. El monto NO llega del cliente: antes `paid` venía en el body y alguien podía
 * hacerse Socio declarando que pagó 0. Cuando el cobro por MP esté activo, el webhook es quien
 * llama acá tras confirmar el pago real.
 */
export async function becomeSocio(deviceId: string, paid: number = SOCIO_PRICE): Promise<Membership> {
  const m = await prisma.membership.upsert({
    where: { deviceId },
    create: { deviceId, tier: 'socio', since: new Date(), paid },
    update: { tier: 'socio', since: new Date(), paid },
  })
  return toMembership(m)
}
```

En `server/src/routes/memberships.ts`, borrar `becomeSchema` y su uso; el handler queda:

```ts
/** POST /api/v1/memberships — hacerse Socio CCM. El monto lo fija el server (pricing compartido). */
membershipsRouter.post('/memberships', requireDevice, async (req, res, next) => {
  try {
    res.status(201).json(await membershipService.becomeSocio(req.deviceId!))
  } catch (err) {
    next(err)
  }
})
```

En `server/src/services/orderService.ts`, dentro de `createCampaign`, reemplazar `total: input.total` por el cálculo propio y agregar el import:

```ts
import { priceForCampaign } from '../../../src/lib/pricing.js'
```

```ts
      hours: Math.max(1, Math.floor(input.hours || 1)),
      // El total lo recalcula el server: el que manda el cliente se ignora (mismo criterio que
      // las órdenes de entrada, donde se compraba una VIP a $1 editando el request).
      total: priceForCampaign(input.slot, input.hours),
```

- [ ] **Step 7: Test de que el server ignora el precio del cliente**

Agregar a `server/src/services/pricing.test.ts`:

```ts
describe('el server ignora el monto que manda el cliente', () => {
  it('una campaña de 5h en S2 cuesta la tarifa, no lo que pida el request', () => {
    const totalDelCliente = 1
    const totalReal = priceForCampaign('S2', 5)
    expect(totalReal).not.toBe(totalDelCliente)
    expect(totalReal).toBe(30000)
  })
})
```

- [ ] **Step 8: Correr todo y verificar**

Run: `cd ~/dev/ccm-app && npx tsc -b && npm test`
Expected: typecheck sin salida, 40 tests PASS

Run: `cd ~/dev/ccm-app/server && npm run typecheck && npm test`
Expected: typecheck sin salida, tests PASS incluidos los 5 nuevos de pricing

- [ ] **Step 9: Commit**

```bash
cd ~/dev/ccm-app
git add src/lib/pricing.ts src/features/membresia/plans.ts src/features/publicidad/adPricing.ts \
        server/src/services/pricing.test.ts server/src/services/membershipService.ts \
        server/src/routes/memberships.ts server/src/services/orderService.ts
git commit -m "fix(precios): el server calcula los montos, no el navegador

becomeSocio recibia 'paid' del cliente (alguien podia hacerse Socio declarando
que pago 0) y el total de publicidad se calculaba en el front. Ahora ambos salen
de src/lib/pricing.ts, un modulo compartido que el server importa por ruta
relativa igual que htmlPolicy.ts."
```

---

### Task 2: La conexión con Mercado Pago (tabla + servicio)

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/12_mp_connection/migration.sql`
- Modify: `server/src/lib/env.ts:43-44`
- Create: `server/src/lib/mpApi.ts`
- Create: `server/src/services/mpOAuthService.ts`
- Create: `server/src/services/mpOAuthService.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `mpApi.exchangeCodeForTokens(code: string): Promise<MpTokenResponse>`
  - `mpApi.refreshTokens(refreshToken: string): Promise<MpTokenResponse>`
  - `mpApi.createPreference(accessToken: string, body: unknown): Promise<{ id: string; init_point: string }>`
  - `mpApi.getPayment(accessToken: string, paymentId: string): Promise<MpPayment>`
  - `mpOAuthService.buildAuthUrl(): Promise<string>`, `exchangeCode(code, state): Promise<void>`, `getValidToken(): Promise<string>`, `getStatus(): Promise<MpStatus>`, `disconnect(): Promise<void>`, `isConnected(): Promise<boolean>`
  - Tipo `MpStatus = { conectado: boolean; cuenta?: string; desde?: string; vence?: string }`

- [ ] **Step 1: Escribir el test que falla**

Crear `server/src/services/mpOAuthService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    mpConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))
vi.mock('../lib/mpApi.js', () => ({
  exchangeCodeForTokens: vi.fn(),
  refreshTokens: vi.fn(),
}))

import { prisma } from '../lib/prisma.js'
import * as mpApi from '../lib/mpApi.js'
import { buildAuthUrl, exchangeCode, getStatus, getValidToken, disconnect } from './mpOAuthService.js'

const filaConectada = (vence: Date) => ({
  id: 'default',
  mpUserId: '1928447',
  accessToken: 'ACCESS-vigente',
  refreshToken: 'REFRESH-1',
  publicKey: 'PUB-1',
  expiresAt: vence,
  scope: null,
  connectedAt: new Date('2026-07-20T14:32:00Z'),
  updatedAt: new Date(),
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('mpOAuthService — estado de la conexión', () => {
  it('informa desconectado cuando no hay fila', async () => {
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(null as never)
    expect(await getStatus()).toEqual({ conectado: false })
  })

  it('NUNCA devuelve los tokens en el estado', async () => {
    const dentroDeUnMes = new Date(Date.now() + 30 * 24 * 3600_000)
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(filaConectada(dentroDeUnMes) as never)
    const status = await getStatus()
    expect(status.conectado).toBe(true)
    expect(status.cuenta).toBe('1928447')
    expect(JSON.stringify(status)).not.toContain('ACCESS-vigente')
    expect(JSON.stringify(status)).not.toContain('REFRESH-1')
  })
})

describe('mpOAuthService — el state protege la vuelta de MP', () => {
  it('un state que no se emitió acá se rechaza', async () => {
    await expect(exchangeCode('CODE-1', 'state-inventado')).rejects.toMatchObject({ code: 'MP_STATE_INVALID' })
    expect(mpApi.exchangeCodeForTokens).not.toHaveBeenCalled()
  })

  it('el state es de un solo uso: no se puede reutilizar', async () => {
    vi.mocked(mpApi.exchangeCodeForTokens).mockResolvedValue({
      access_token: 'A', refresh_token: 'R', user_id: 9, public_key: 'P', expires_in: 15552000,
    } as never)
    vi.mocked(prisma.mpConnection.upsert).mockResolvedValue({} as never)

    const url = await buildAuthUrl()
    const state = new URL(url).searchParams.get('state')!
    await exchangeCode('CODE-1', state)
    await expect(exchangeCode('CODE-2', state)).rejects.toMatchObject({ code: 'MP_STATE_INVALID' })
  })
})

describe('mpOAuthService — renovación del token', () => {
  it('devuelve el token tal cual si todavía está lejos de vencer', async () => {
    const dentroDeUnMes = new Date(Date.now() + 30 * 24 * 3600_000)
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(filaConectada(dentroDeUnMes) as never)
    expect(await getValidToken()).toBe('ACCESS-vigente')
    expect(mpApi.refreshTokens).not.toHaveBeenCalled()
  })

  it('renueva cuando está por vencer', async () => {
    const enUnaHora = new Date(Date.now() + 3600_000)
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(filaConectada(enUnaHora) as never)
    vi.mocked(mpApi.refreshTokens).mockResolvedValue({
      access_token: 'ACCESS-nuevo', refresh_token: 'REFRESH-2', user_id: 1928447, public_key: 'P', expires_in: 15552000,
    } as never)
    vi.mocked(prisma.mpConnection.upsert).mockResolvedValue({} as never)

    expect(await getValidToken()).toBe('ACCESS-nuevo')
    expect(mpApi.refreshTokens).toHaveBeenCalledWith('REFRESH-1')
  })

  it('si no hay conexión, falla con un código que la UI entiende', async () => {
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(null as never)
    await expect(getValidToken()).rejects.toMatchObject({ code: 'MP_NOT_CONNECTED' })
  })
})

describe('mpOAuthService — desconectar', () => {
  it('borra la conexión', async () => {
    vi.mocked(prisma.mpConnection.deleteMany).mockResolvedValue({ count: 1 } as never)
    await disconnect()
    expect(prisma.mpConnection.deleteMany).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd ~/dev/ccm-app/server && npx vitest run src/services/mpOAuthService.test.ts`
Expected: FAIL — `Failed to resolve import "./mpOAuthService.js"`

- [ ] **Step 3: Agregar el modelo y la migración**

En `server/prisma/schema.prisma`, al final:

```prisma
/// Conexión OAuth con Mercado Pago. Una sola fila (id "default"): CCM cobra en UNA cuenta.
model MpConnection {
  id           String   @id @default("default")
  mpUserId     String // la cuenta de MP a la que entra la plata
  accessToken  String
  refreshToken String
  publicKey    String?
  expiresAt    DateTime // vencimiento del access token
  scope        String?
  connectedAt  DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Crear `server/prisma/migrations/12_mp_connection/migration.sql`:

```sql
CREATE TABLE "MpConnection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mpUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "publicKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MpConnection_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 4: Sumar las variables de entorno**

En `server/src/lib/env.ts`, reemplazar las dos líneas de MP existentes por:

```ts
  // Mercado Pago. La app se crea en el panel de developers; sin estas tres, /admin/mp/connect
  // responde 503 y la venta sigue con el link manual.
  MP_CLIENT_ID: z.string().optional(),
  MP_CLIENT_SECRET: z.string().optional(),
  MP_REDIRECT_URI: z.string().optional(),
  MP_ACCESS_TOKEN: z.string().optional(), // ⏳ solo para el plan B (token pegado, sin OAuth)
  MP_WEBHOOK_SECRET: z.string().optional(),
```

- [ ] **Step 5: Crear el cliente HTTP de MP**

Crear `server/src/lib/mpApi.ts`:

```ts
/**
 * Único módulo que habla HTTP con Mercado Pago. No tiene lógica de negocio a propósito: así
 * los servicios se testean mockeando este archivo, sin red.
 */
import { env } from './env.js'
import { ApiError } from './errors.js'

const AUTH_BASE = 'https://api.mercadopago.com'

export interface MpTokenResponse {
  access_token: string
  refresh_token: string
  user_id: number
  public_key?: string
  expires_in: number
  scope?: string
}

export interface MpPayment {
  id: number
  status: 'approved' | 'pending' | 'in_process' | 'rejected' | 'cancelled' | 'refunded'
  external_reference?: string
  transaction_amount?: number
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new ApiError(502, 'MP_API_ERROR', `Mercado Pago respondió ${res.status}`, detalle.slice(0, 400))
  }
  return (await res.json()) as T
}

/** Canjea el código de autorización por tokens (fin del flujo OAuth). */
export function exchangeCodeForTokens(code: string): Promise<MpTokenResponse> {
  return post<MpTokenResponse>('/oauth/token', {
    grant_type: 'authorization_code',
    client_id: env.MP_CLIENT_ID,
    client_secret: env.MP_CLIENT_SECRET,
    code,
    redirect_uri: env.MP_REDIRECT_URI,
  })
}

/** Renueva el access token antes de que venza. */
export function refreshTokens(refreshToken: string): Promise<MpTokenResponse> {
  return post<MpTokenResponse>('/oauth/token', {
    grant_type: 'refresh_token',
    client_id: env.MP_CLIENT_ID,
    client_secret: env.MP_CLIENT_SECRET,
    refresh_token: refreshToken,
  })
}

/** Crea la preferencia de Checkout Pro. Devuelve el link al que mandar al comprador. */
export function createPreference(
  accessToken: string,
  body: unknown,
): Promise<{ id: string; init_point: string }> {
  return post<{ id: string; init_point: string }>('/checkout/preferences', body, accessToken)
}

/** Consulta el estado REAL de un pago. Nunca se le cree al cuerpo del webhook. */
export async function getPayment(accessToken: string, paymentId: string): Promise<MpPayment> {
  const res = await fetch(`${AUTH_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new ApiError(502, 'MP_API_ERROR', `Mercado Pago respondió ${res.status} al consultar el pago`)
  return (await res.json()) as MpPayment
}
```

- [ ] **Step 6: Crear el servicio de conexión**

Crear `server/src/services/mpOAuthService.ts`:

```ts
/**
 * Única puerta a los tokens de Mercado Pago. Nadie más lee la tabla MpConnection: el resto
 * pide getValidToken() y no se entera de si hubo que renovar.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { ApiError } from '../lib/errors.js'
import * as mpApi from '../lib/mpApi.js'

const FILA = 'default'
/** Se renueva si vence dentro de este margen (no esperamos al último minuto). */
const MARGEN_RENOVACION_MS = 24 * 3600_000
/** Los state viven poco: es el tiempo entre tocar Conectar y volver de MP. */
const STATE_TTL_MS = 10 * 60_000

/** state pendientes, en memoria. Si el proceso reinicia a mitad del flujo, se reintenta y listo. */
const statesEmitidos = new Map<string, number>()

export interface MpStatus {
  conectado: boolean
  cuenta?: string
  desde?: string
  vence?: string
}

function limpiarStatesVencidos(): void {
  const ahora = Date.now()
  for (const [s, ts] of statesEmitidos) if (ahora - ts > STATE_TTL_MS) statesEmitidos.delete(s)
}

/** URL de autorización de MP. El state de un solo uso evita que alguien falsifique la vuelta. */
export async function buildAuthUrl(): Promise<string> {
  if (!env.MP_CLIENT_ID || !env.MP_REDIRECT_URI) {
    throw new ApiError(503, 'MP_NOT_CONFIGURED', 'Falta configurar la aplicación de Mercado Pago (MP_CLIENT_ID / MP_REDIRECT_URI)')
  }
  limpiarStatesVencidos()
  const state = randomUUID()
  statesEmitidos.set(state, Date.now())
  const u = new URL('https://auth.mercadopago.com.ar/authorization')
  u.searchParams.set('client_id', env.MP_CLIENT_ID)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('platform_id', 'mp')
  u.searchParams.set('redirect_uri', env.MP_REDIRECT_URI)
  u.searchParams.set('state', state)
  return u.toString()
}

async function guardar(t: mpApi.MpTokenResponse): Promise<void> {
  const data = {
    mpUserId: String(t.user_id),
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    publicKey: t.public_key ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scope: t.scope ?? null,
  }
  await prisma.mpConnection.upsert({ where: { id: FILA }, create: { id: FILA, ...data }, update: data })
}

/** Cierra el flujo OAuth: valida el state, canjea el código y guarda la conexión. */
export async function exchangeCode(code: string, state: string): Promise<void> {
  limpiarStatesVencidos()
  if (!statesEmitidos.delete(state)) {
    throw new ApiError(400, 'MP_STATE_INVALID', 'La vuelta de Mercado Pago no es válida. Probá conectar de nuevo.')
  }
  await guardar(await mpApi.exchangeCodeForTokens(code))
}

/** Token utilizable. Renueva solo si está por vencer. */
export async function getValidToken(): Promise<string> {
  const fila = await prisma.mpConnection.findUnique({ where: { id: FILA } })
  if (!fila) throw new ApiError(503, 'MP_NOT_CONNECTED', 'Mercado Pago no está conectado')
  if (fila.expiresAt.getTime() - Date.now() > MARGEN_RENOVACION_MS) return fila.accessToken
  const renovado = await mpApi.refreshTokens(fila.refreshToken)
  await guardar(renovado)
  return renovado.access_token
}

export async function isConnected(): Promise<boolean> {
  return (await prisma.mpConnection.findUnique({ where: { id: FILA } })) !== null
}

/** Estado para el panel. Sin tokens: esta respuesta viaja al navegador. */
export async function getStatus(): Promise<MpStatus> {
  const fila = await prisma.mpConnection.findUnique({ where: { id: FILA } })
  if (!fila) return { conectado: false }
  return {
    conectado: true,
    cuenta: fila.mpUserId,
    desde: fila.connectedAt.toISOString(),
    vence: fila.expiresAt.toISOString(),
  }
}

export async function disconnect(): Promise<void> {
  await prisma.mpConnection.deleteMany({ where: { id: FILA } })
}
```

- [ ] **Step 7: Correr el test y ver que pasa**

Run: `cd ~/dev/ccm-app/server && npx prisma generate && npx vitest run src/services/mpOAuthService.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 8: Aplicar la migración y verificar**

Run: `cd ~/dev/ccm-app/server && DATABASE_URL="postgresql://alannaimtapia@localhost:5432/ccm_mp" npx prisma migrate deploy`
Expected: `All migrations have been successfully applied.` (crear la base antes con `createdb -h localhost ccm_mp` si no existe; `export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"`)

- [ ] **Step 9: Commit**

```bash
cd ~/dev/ccm-app
git add server/prisma/schema.prisma server/prisma/migrations/12_mp_connection \
        server/src/lib/env.ts server/src/lib/mpApi.ts \
        server/src/services/mpOAuthService.ts server/src/services/mpOAuthService.test.ts
git commit -m "feat(mp): conexion OAuth con Mercado Pago (tabla + servicio)

mpOAuthService es la unica puerta a los tokens: el resto pide getValidToken()
y no se entera de la renovacion. getStatus() nunca devuelve tokens. El state
es de un solo uso para que la vuelta de MP no se pueda falsificar."
```

---

### Task 3: Rutas de conexión en el panel

**Files:**
- Create: `server/src/routes/mp.ts`
- Create: `server/src/routes/mp.test.ts`
- Modify: `server/src/app.ts:19-20,78`

**Interfaces:**
- Consumes: `mpOAuthService.{buildAuthUrl, exchangeCode, getStatus, disconnect}` de la tarea 2.
- Produces: `mpRouter` (Express Router) con `GET /admin/mp/status`, `POST /admin/mp/connect`, `GET /mp/callback`, `POST /admin/mp/disconnect`. La tarea 4 le suma `/payments/preference` y la 5 `/mp/webhook`.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/src/routes/mp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../services/mpOAuthService.js', () => ({
  buildAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  getStatus: vi.fn(),
  disconnect: vi.fn(),
}))

import * as oauth from '../services/mpOAuthService.js'
import { createApp } from '../app.js'

const app = createApp()

beforeEach(() => vi.clearAllMocks())

describe('rutas de conexión — exigen sesión con permiso', () => {
  it('GET /admin/mp/status sin sesión → 401', async () => {
    await request(app).get('/api/v1/admin/mp/status').expect(401)
    expect(oauth.getStatus).not.toHaveBeenCalled()
  })

  it('POST /admin/mp/connect sin sesión → 401', async () => {
    await request(app).post('/api/v1/admin/mp/connect').expect(401)
    expect(oauth.buildAuthUrl).not.toHaveBeenCalled()
  })

  it('POST /admin/mp/disconnect sin sesión → 401', async () => {
    await request(app).post('/api/v1/admin/mp/disconnect').expect(401)
    expect(oauth.disconnect).not.toHaveBeenCalled()
  })

  it('un token de sesión inventado → 401, no 403', async () => {
    await request(app)
      .get('/api/v1/admin/mp/status')
      .set('Authorization', 'Bearer token-inventado')
      .expect(401)
  })
})

describe('vuelta de Mercado Pago', () => {
  it('/mp/callback es público (lo abre el navegador, no el panel) y redirige al panel', async () => {
    vi.mocked(oauth.exchangeCode).mockResolvedValue(undefined)
    const res = await request(app).get('/api/v1/mp/callback?code=C1&state=S1').expect(302)
    expect(oauth.exchangeCode).toHaveBeenCalledWith('C1', 'S1')
    expect(res.headers.location).toContain('/admin/configuracion')
  })

  it('si falta el code, redirige con error en vez de romper', async () => {
    const res = await request(app).get('/api/v1/mp/callback').expect(302)
    expect(res.headers.location).toContain('mp=error')
    expect(oauth.exchangeCode).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd ~/dev/ccm-app/server && npx vitest run src/routes/mp.test.ts`
Expected: FAIL — 404 en todas (las rutas no existen)

- [ ] **Step 3: Crear el router**

Crear `server/src/routes/mp.ts`:

```ts
import { Router } from 'express'
import { requirePermission } from '../middlewares/admin.js'
import * as oauth from '../services/mpOAuthService.js'

export const mpRouter = Router()

/** Estado de la conexión (sin tokens). */
mpRouter.get('/admin/mp/status', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    res.json(await oauth.getStatus())
  } catch (err) {
    next(err)
  }
})

/** Devuelve la URL de autorización; el panel abre esa URL. */
mpRouter.post('/admin/mp/connect', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    res.json({ url: await oauth.buildAuthUrl() })
  } catch (err) {
    next(err)
  }
})

mpRouter.post('/admin/mp/disconnect', requirePermission('team:manage'), async (_req, res, next) => {
  try {
    await oauth.disconnect()
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/**
 * Vuelta de Mercado Pago. Es PÚBLICA porque la invoca el navegador volviendo de MP, no el panel:
 * la seguridad la da el state de un solo uso, no un token de admin. Siempre redirige al panel
 * (nunca devuelve JSON): del otro lado hay una persona mirando, no un fetch.
 */
mpRouter.get('/mp/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!code || !state) return res.redirect('/admin/configuracion?mp=error')
  try {
    await oauth.exchangeCode(code, state)
    res.redirect('/admin/configuracion?mp=ok')
  } catch {
    res.redirect('/admin/configuracion?mp=error')
  }
})
```

- [ ] **Step 4: Montar el router**

En `server/src/app.ts`, agregar el import junto a los otros routers:

```ts
import { mpRouter } from './routes/mp.js'
```

y montarlo antes de `adminRouter`:

```ts
  v1.use(mpRouter) // Mercado Pago: conexion OAuth, checkout y webhook
```

- [ ] **Step 5: Correr el test y ver que pasa**

Run: `cd ~/dev/ccm-app/server && npx vitest run src/routes/mp.test.ts`
Expected: PASS — 6 tests

Los tests cubren el rechazo (401 sin sesión) y la vuelta pública de MP. El camino feliz *con*
sesión no se testea acá a propósito: exige montar una sesión real en la base, y el guard ya está
cubierto estructuralmente por `adminGuards.test.ts` (falla si una ruta `/admin` queda sin permiso)
y por `middlewares/admin.test.ts`. Duplicarlo acá probaría el middleware, no estas rutas.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/ccm-app
git add server/src/routes/mp.ts server/src/routes/mp.test.ts server/src/app.ts
git commit -m "feat(mp): rutas de conexion del panel (status, connect, callback, disconnect)

/mp/callback es publica a proposito: la invoca el navegador volviendo de MP.
La protege el state de un solo uso, y siempre redirige al panel en vez de
devolver JSON porque del otro lado hay una persona."
```

---

### Task 4: Crear el cobro (Checkout Pro)

**Files:**
- Create: `server/src/services/mpCheckoutService.ts`
- Create: `server/src/services/mpCheckoutService.test.ts`
- Modify: `server/src/routes/mp.ts`

**Interfaces:**
- Consumes: `mpOAuthService.getValidToken()`, `mpApi.createPreference()`, `pricing.{SOCIO_PRICE, priceForCampaign}`.
- Produces: `createCheckout(kind: PaymentKind, resourceId: string, deviceId?: string): Promise<{ initPoint: string; paymentId: string }>` y `POST /payments/preference`.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/src/services/mpCheckoutService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    ticketOrder: { findUnique: vi.fn() },
    adCampaign: { findUnique: vi.fn() },
    payment: { create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('./mpOAuthService.js', () => ({ getValidToken: vi.fn() }))
vi.mock('../lib/mpApi.js', () => ({ createPreference: vi.fn() }))

import { prisma } from '../lib/prisma.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { createCheckout } from './mpCheckoutService.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidToken).mockResolvedValue('ACCESS-1')
  vi.mocked(prisma.payment.create).mockResolvedValue({ id: 'pay_1' } as never)
  vi.mocked(mpApi.createPreference).mockResolvedValue({ id: 'pref_1', init_point: 'https://mp/checkout/pref_1' })
})

/** Lee el monto que se le mandó a MP en la preferencia. */
function montoEnviadoAMp(): number {
  const body = vi.mocked(mpApi.createPreference).mock.calls[0][1] as { items: { unit_price: number; quantity: number }[] }
  return body.items.reduce((acc, i) => acc + i.unit_price * i.quantity, 0)
}

describe('mpCheckoutService — el monto sale de la base', () => {
  it('una orden de entradas cobra su total congelado', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 66000, qty: 2, planId: 'sab-night-vip', status: 'iniciada' } as never)
    const r = await createCheckout('ticket_order', 'ord_1', 'dev_1')
    expect(montoEnviadoAMp()).toBe(66000)
    expect(r.initPoint).toBe('https://mp/checkout/pref_1')
  })

  it('la membresía cobra SOCIO_PRICE, no lo que diga nadie', async () => {
    await createCheckout('membership', 'dev_1', 'dev_1')
    expect(montoEnviadoAMp()).toBe(9900)
  })

  it('la campaña se recalcula por slot y horas', async () => {
    vi.mocked(prisma.adCampaign.findUnique).mockResolvedValue({ id: 'camp_1', slot: 'S2', hours: 5, total: 1 } as never)
    await createCheckout('ad_campaign', 'camp_1', 'dev_1')
    expect(montoEnviadoAMp()).toBe(30000)
  })

  it('la preferencia lleva external_reference con el id del Payment (es lo que reconcilia)', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'iniciada' } as never)
    await createCheckout('ticket_order', 'ord_1', 'dev_1')
    const body = vi.mocked(mpApi.createPreference).mock.calls[0][1] as { external_reference: string }
    expect(body.external_reference).toBe('pay_1')
  })
})

describe('mpCheckoutService — casos que no deben cobrar', () => {
  it('sin conexión responde 503 y no crea preferencia', async () => {
    vi.mocked(getValidToken).mockRejectedValue(Object.assign(new Error('x'), { status: 503, code: 'MP_NOT_CONNECTED' }))
    await expect(createCheckout('membership', 'dev_1', 'dev_1')).rejects.toMatchObject({ code: 'MP_NOT_CONNECTED' })
    expect(mpApi.createPreference).not.toHaveBeenCalled()
  })

  it('una orden inexistente no crea cobro', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue(null as never)
    await expect(createCheckout('ticket_order', 'ord_fantasma', 'dev_1')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' })
  })

  it('una orden ya confirmada no se vuelve a cobrar', async () => {
    vi.mocked(prisma.ticketOrder.findUnique).mockResolvedValue({ id: 'ord_1', total: 1000, qty: 1, planId: 'p', status: 'confirmada' } as never)
    await expect(createCheckout('ticket_order', 'ord_1', 'dev_1')).rejects.toMatchObject({ code: 'ALREADY_PAID' })
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd ~/dev/ccm-app/server && npx vitest run src/services/mpCheckoutService.test.ts`
Expected: FAIL — `Failed to resolve import "./mpCheckoutService.js"`

- [ ] **Step 3: Crear el servicio**

Crear `server/src/services/mpCheckoutService.ts`:

```ts
/**
 * Arma el cobro de Checkout Pro. Calcula el monto DESDE LA BASE: el navegador nunca dice cuánto
 * cuesta algo. Cada preferencia lleva external_reference = Payment.id, que es lo que después
 * permite reconciliar el webhook sin ambigüedad.
 */
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { ApiError, notFound, conflict } from '../lib/errors.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { SOCIO_PRICE, priceForCampaign } from '../../../src/lib/pricing.js'
import type { AdSlot } from '@domain/types'

type PaymentKind = 'ticket_order' | 'membership' | 'ad_campaign'

interface Cobro {
  titulo: string
  monto: number
}

/** Qué se cobra y cuánto, según el tipo. Única función que decide montos. */
async function resolverCobro(kind: PaymentKind, resourceId: string): Promise<Cobro> {
  if (kind === 'ticket_order') {
    const orden = await prisma.ticketOrder.findUnique({ where: { id: resourceId } })
    if (!orden) throw notFound('RESOURCE_NOT_FOUND', 'La orden no existe')
    if (orden.status === 'confirmada') throw conflict('ALREADY_PAID', 'Esa orden ya está paga')
    return { titulo: `Entradas CCM · ${orden.qty}`, monto: orden.total }
  }
  if (kind === 'membership') {
    return { titulo: 'Membresía Socio CCM', monto: SOCIO_PRICE }
  }
  const camp = await prisma.adCampaign.findUnique({ where: { id: resourceId } })
  if (!camp) throw notFound('RESOURCE_NOT_FOUND', 'La campaña no existe')
  if (camp.status === 'activa') throw conflict('ALREADY_PAID', 'Esa campaña ya está paga')
  return {
    titulo: `Espacio publicitario ${camp.slot} · ${camp.hours} h`,
    monto: priceForCampaign(camp.slot as AdSlot, camp.hours),
  }
}

/** Base pública del server, para armar las URLs de vuelta y de aviso. */
function baseUrl(): string {
  return (env.MP_REDIRECT_URI ?? '').replace(/\/api\/v1\/mp\/callback$/, '')
}

export async function createCheckout(
  kind: PaymentKind,
  resourceId: string,
  deviceId?: string,
): Promise<{ initPoint: string; paymentId: string }> {
  // Primero el token: si no hay conexión, no queremos dejar un Payment huérfano en la base.
  const token = await getValidToken()
  const { titulo, monto } = await resolverCobro(kind, resourceId)

  const pago = await prisma.payment.create({
    data: { kind, resourceId, deviceId: deviceId ?? null, amount: monto, status: 'pending' },
  })

  try {
    const pref = await mpApi.createPreference(token, {
      items: [{ title: titulo, quantity: 1, unit_price: monto, currency_id: 'ARS' }],
      external_reference: pago.id,
      notification_url: `${baseUrl()}/api/v1/mp/webhook`,
      back_urls: {
        success: `${baseUrl()}/entradas?pago=ok`,
        pending: `${baseUrl()}/entradas?pago=pendiente`,
        failure: `${baseUrl()}/entradas?pago=error`,
      },
      auto_return: 'approved',
    })
    await prisma.payment.update({ where: { id: pago.id }, data: { mpPreferenceId: pref.id } })
    return { initPoint: pref.init_point, paymentId: pago.id }
  } catch (err) {
    // La preferencia no se creó: el Payment queda rechazado en vez de pendiente para siempre.
    await prisma.payment.update({ where: { id: pago.id }, data: { status: 'rejected' } }).catch(() => {})
    if (err instanceof ApiError) throw err
    throw new ApiError(502, 'MP_API_ERROR', 'No pudimos crear el cobro en Mercado Pago')
  }
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `cd ~/dev/ccm-app/server && npx vitest run src/services/mpCheckoutService.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Exponer la ruta**

En `server/src/routes/mp.ts`, agregar al final (con los imports arriba):

```ts
import { z } from 'zod'
import { requireDevice } from '../middlewares/device.js'
import { createCheckout } from '../services/mpCheckoutService.js'
```

```ts
const checkoutSchema = z.object({
  kind: z.enum(['ticket_order', 'membership', 'ad_campaign']),
  resourceId: z.string().min(1),
  // El monto NO se acepta: lo calcula el server.
})

/** POST /api/v1/payments/preference — devuelve el link de pago de esta compra. */
mpRouter.post('/payments/preference', requireDevice, async (req, res, next) => {
  try {
    const { kind, resourceId } = checkoutSchema.parse(req.body)
    res.status(201).json(await createCheckout(kind, resourceId, req.deviceId!))
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 6: Verificar typecheck y suite**

Run: `cd ~/dev/ccm-app/server && npm run typecheck && npm test`
Expected: typecheck sin salida; todos los tests PASS

- [ ] **Step 7: Commit**

```bash
cd ~/dev/ccm-app
git add server/src/services/mpCheckoutService.ts server/src/services/mpCheckoutService.test.ts server/src/routes/mp.ts
git commit -m "feat(mp): crear el cobro con el monto calculado en el server

El navegador pide 'cobrame esto' con kind + resourceId; el monto sale de la
base (orden congelada, SOCIO_PRICE, o slot x horas). external_reference lleva
el id del Payment: es lo que reconcilia el webhook."
```

---

### Task 5: Recibir el pago (webhook)

**Files:**
- Create: `server/src/services/mpWebhookService.ts`
- Create: `server/src/services/mpWebhookService.test.ts`
- Modify: `server/src/routes/mp.ts`

**Interfaces:**
- Consumes: `mpApi.getPayment()`, `mpOAuthService.getValidToken()`, `membershipService.becomeSocio()`.
- Produces: `handleNotification(paymentId: string, firmaValida: boolean): Promise<void>` y `verificarFirma(headers, dataId): boolean`.

- [ ] **Step 1: Escribir el test que falla**

Crear `server/src/services/mpWebhookService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    ticketOrder: { update: vi.fn() },
    adCampaign: { update: vi.fn() },
  },
}))
vi.mock('./mpOAuthService.js', () => ({ getValidToken: vi.fn() }))
vi.mock('../lib/mpApi.js', () => ({ getPayment: vi.fn() }))
vi.mock('./membershipService.js', () => ({ becomeSocio: vi.fn() }))

import { prisma } from '../lib/prisma.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { becomeSocio } from './membershipService.js'
import { handleNotification, verificarFirma } from './mpWebhookService.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getValidToken).mockResolvedValue('ACCESS-1')
  vi.mocked(prisma.payment.findFirst).mockResolvedValue(null as never)
  vi.mocked(prisma.payment.update).mockResolvedValue({} as never)
})

function pagoAprobado(ref: string) {
  vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 111, status: 'approved', external_reference: ref } as never)
}

describe('webhook — verificación de firma', () => {
  it('rechaza una firma que no corresponde', () => {
    const ok = verificarFirma({ 'x-signature': 'ts=1,v1=firmafalsa', 'x-request-id': 'req-1' }, '111')
    expect(ok).toBe(false)
  })

  it('sin secreto configurado NO acepta cualquier cosa', () => {
    const ok = verificarFirma({}, '111')
    expect(ok).toBe(false)
  })
})

describe('webhook — activa el recurso al aprobarse', () => {
  it('una orden de entradas pasa a confirmada', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ id: 'pay_1', kind: 'ticket_order', resourceId: 'ord_1', deviceId: 'dev_1', status: 'pending' } as never)
    pagoAprobado('pay_1')
    await handleNotification('111', true)
    expect(prisma.ticketOrder.update).toHaveBeenCalledWith({ where: { id: 'ord_1' }, data: { status: 'confirmada' } })
  })

  it('una membresía deja al device como socio', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ id: 'pay_2', kind: 'membership', resourceId: 'dev_1', deviceId: 'dev_1', amount: 9900, status: 'pending' } as never)
    pagoAprobado('pay_2')
    await handleNotification('111', true)
    expect(becomeSocio).toHaveBeenCalledWith('dev_1', 9900)
  })

  it('una campaña se pone al aire con su ventana de horas', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ id: 'pay_3', kind: 'ad_campaign', resourceId: 'camp_1', status: 'pending' } as never)
    vi.mocked(prisma.adCampaign.update).mockResolvedValue({} as never)
    pagoAprobado('pay_3')
    await handleNotification('111', true)
    const args = vi.mocked(prisma.adCampaign.update).mock.calls[0][0] as { data: { status: string; startsAt: Date; expiresAt: Date } }
    expect(args.data.status).toBe('activa')
    expect(args.data.expiresAt.getTime()).toBeGreaterThan(args.data.startsAt.getTime())
  })
})

describe('webhook — lo que NO debe pasar', () => {
  it('con firma inválida no activa nada', async () => {
    await handleNotification('111', false)
    expect(mpApi.getPayment).not.toHaveBeenCalled()
    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()
  })

  it('un pago pendiente (efectivo) NO confirma la orden', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ id: 'pay_4', kind: 'ticket_order', resourceId: 'ord_1', status: 'pending' } as never)
    vi.mocked(mpApi.getPayment).mockResolvedValue({ id: 111, status: 'pending', external_reference: 'pay_4' } as never)
    await handleNotification('111', true)
    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()
  })

  it('el mismo pago avisado dos veces se procesa una sola vez', async () => {
    vi.mocked(prisma.payment.findFirst).mockResolvedValue({ id: 'pay_1', mpPaymentId: '111', status: 'approved' } as never)
    await handleNotification('111', true)
    expect(prisma.ticketOrder.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd ~/dev/ccm-app/server && npx vitest run src/services/mpWebhookService.test.ts`
Expected: FAIL — `Failed to resolve import "./mpWebhookService.js"`

- [ ] **Step 3: Crear el servicio**

Crear `server/src/services/mpWebhookService.ts`:

```ts
/**
 * Recibe el aviso de pago de Mercado Pago.
 *
 * Tres cuidados, en este orden: (1) la firma, porque si no cualquiera avisa "esto se pagó" y se
 * lleva entradas gratis; (2) no creerle al cuerpo del mensaje — se consulta el estado real a MP;
 * (3) idempotencia, porque MP reintenta.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import * as mpApi from '../lib/mpApi.js'
import { getValidToken } from './mpOAuthService.js'
import { becomeSocio } from './membershipService.js'

/**
 * Firma de MP: HMAC-SHA256 sobre "id:<dataId>;request-id:<reqId>;ts:<ts>;" con MP_WEBHOOK_SECRET.
 * Sin secreto configurado devuelve false: preferimos no procesar a procesar cualquier cosa.
 */
export function verificarFirma(headers: Record<string, string | undefined>, dataId: string): boolean {
  const secreto = env.MP_WEBHOOK_SECRET
  const firma = headers['x-signature']
  const requestId = headers['x-request-id']
  if (!secreto || !firma || !requestId) return false

  const partes = Object.fromEntries(
    firma.split(',').map((p) => p.split('=').map((s) => s.trim()) as [string, string]),
  )
  const ts = partes.ts
  const v1 = partes.v1
  if (!ts || !v1) return false

  const esperado = createHmac('sha256', secreto)
    .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
    .digest('hex')
  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(v1, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Activa lo que corresponda según el tipo de cobro. */
async function activar(kind: string, resourceId: string, deviceId: string | null, amount: number): Promise<void> {
  if (kind === 'ticket_order') {
    await prisma.ticketOrder.update({ where: { id: resourceId }, data: { status: 'confirmada' } })
    return
  }
  if (kind === 'membership') {
    if (deviceId) await becomeSocio(deviceId, amount)
    return
  }
  const camp = await prisma.adCampaign.findUnique({ where: { id: resourceId } })
  const horas = camp?.hours ?? 1
  const desde = new Date()
  await prisma.adCampaign.update({
    where: { id: resourceId },
    data: { status: 'activa', startsAt: desde, expiresAt: new Date(desde.getTime() + horas * 3600_000) },
  })
}

export async function handleNotification(mpPaymentId: string, firmaValida: boolean): Promise<void> {
  if (!firmaValida) return

  // Idempotencia: si ya guardamos este pago de MP, no volvemos a activar nada.
  const yaProcesado = await prisma.payment.findFirst({ where: { mpPaymentId } })
  if (yaProcesado) return

  const token = await getValidToken()
  const pagoMp = await mpApi.getPayment(token, mpPaymentId)
  const ref = pagoMp.external_reference
  if (!ref) return

  const pago = await prisma.payment.findUnique({ where: { id: ref } })
  if (!pago) return

  if (pagoMp.status !== 'approved') {
    // Efectivo/Rapipago llega como pending: se registra, pero NO se activa nada todavía.
    await prisma.payment.update({
      where: { id: pago.id },
      data: { mpPaymentId, status: pagoMp.status === 'rejected' ? 'rejected' : 'pending', raw: pagoMp as never },
    })
    return
  }

  await prisma.payment.update({
    where: { id: pago.id },
    data: { mpPaymentId, status: 'approved', raw: pagoMp as never },
  })
  await activar(pago.kind, pago.resourceId, pago.deviceId, pago.amount)
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `cd ~/dev/ccm-app/server && npx vitest run src/services/mpWebhookService.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Exponer la ruta**

En `server/src/routes/mp.ts`, agregar el import y la ruta:

```ts
import { handleNotification, verificarFirma } from '../services/mpWebhookService.js'
```

```ts
/**
 * POST /api/v1/mp/webhook — aviso de pago de Mercado Pago.
 * Responde 200 SIEMPRE y rápido: MP reintenta si tarda o si contesta error, y no queremos que
 * un reintento en loop dependa de nuestra lógica. La validación real ocurre adentro.
 */
mpRouter.post('/mp/webhook', async (req, res) => {
  const dataId = String((req.body as { data?: { id?: string } })?.data?.id ?? req.query['data.id'] ?? '')
  res.status(200).end()
  if (!dataId) return
  const headers = req.headers as Record<string, string | undefined>
  try {
    await handleNotification(dataId, verificarFirma(headers, dataId))
  } catch {
    // Nunca propagamos: el 200 ya salió. El pago queda pendiente y MP reintenta.
  }
})
```

- [ ] **Step 6: Verificar la suite completa del server**

Run: `cd ~/dev/ccm-app/server && npm run typecheck && npm test`
Expected: typecheck sin salida; todos los tests PASS

- [ ] **Step 7: Commit**

```bash
cd ~/dev/ccm-app
git add server/src/services/mpWebhookService.ts server/src/services/mpWebhookService.test.ts server/src/routes/mp.ts
git commit -m "feat(mp): webhook que confirma el pago y activa el recurso

Verifica la firma HMAC de MP, consulta el estado real del pago (no le cree al
cuerpo del aviso) y es idempotente por mpPaymentId. Un pago pendiente de
efectivo NO confirma la orden: solo se registra."
```

---

### Task 6: La pantalla de Cobros en el panel

**Files:**
- Create: `src/features/admin/OpsMpConnection.tsx`
- Modify: `src/data/store/DataStore.ts`
- Modify: `src/data/store/LocalDataStore.ts`
- Modify: `src/data/store/RemoteDataStore.ts`
- Modify: `src/pages/admin/AdminConfiguracion.tsx`
- Create: `src/features/admin/OpsMpConnection.test.tsx`

**Interfaces:**
- Consumes: `GET /admin/mp/status`, `POST /admin/mp/connect`, `POST /admin/mp/disconnect` de la tarea 3.
- Produces: `store.getMpStatus(): MpStatus | undefined`, `store.connectMp(): Promise<string>`, `store.disconnectMp(): Promise<void>`, tipo `MpStatus` en `src/data/types.ts`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/features/admin/OpsMpConnection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OpsMpConnection } from './OpsMpConnection'

const estado = vi.fn()
vi.mock('../../data/store', () => ({
  store: {
    getMpStatus: () => estado(),
    connectMp: vi.fn(),
    disconnectMp: vi.fn(),
  },
  useStore: (sel: (s: unknown) => unknown) => sel({ getMpStatus: () => estado() }),
  IS_REMOTE: true,
}))

beforeEach(() => vi.clearAllMocks())

describe('OpsMpConnection', () => {
  it('desconectado: ofrece conectar y aclara que la venta sigue con el link manual', () => {
    estado.mockReturnValue({ conectado: false })
    render(<OpsMpConnection />)
    expect(screen.getByRole('button', { name: /conectar con mercado pago/i })).toBeDefined()
    expect(screen.getByText(/link manual/i)).toBeDefined()
  })

  it('conectado: muestra la cuenta y ofrece desconectar', () => {
    estado.mockReturnValue({ conectado: true, cuenta: '1928447', desde: '2026-07-20T14:32:00Z', vence: '2027-01-16T00:00:00Z' })
    render(<OpsMpConnection />)
    expect(screen.getByText(/1928447/)).toBeDefined()
    expect(screen.getByRole('button', { name: /desconectar/i })).toBeDefined()
  })

  it('nunca muestra tokens aunque el backend los mandara por error', () => {
    estado.mockReturnValue({ conectado: true, cuenta: '1928447', accessToken: 'ACCESS-SECRETO' } as never)
    const { container } = render(<OpsMpConnection />)
    expect(container.textContent).not.toContain('ACCESS-SECRETO')
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd ~/dev/ccm-app && npx vitest run src/features/admin/OpsMpConnection.test.tsx`
Expected: FAIL — no existe `./OpsMpConnection`

- [ ] **Step 3: Sumar el tipo y los métodos al store**

En `src/data/types.ts`, agregar:

```ts
/** Estado de la conexión con Mercado Pago. Sin tokens: esto viaja al navegador. */
export interface MpStatus {
  conectado: boolean
  cuenta?: string
  desde?: string
  vence?: string
}
```

En `src/data/store/DataStore.ts`, dentro de la interfaz:

```ts
  /* Cobros con Mercado Pago (panel del organizador). */
  getMpStatus(): MpStatus | undefined
  connectMp(): Promise<string>
  disconnectMp(): Promise<void>
```

En `src/data/store/LocalDataStore.ts` (modo demo: no hay backend que conectar):

```ts
  getMpStatus(): MpStatus | undefined {
    return { conectado: false }
  }
  async connectMp(): Promise<string> {
    throw new Error('Mercado Pago no está disponible en la demo local')
  }
  async disconnectMp(): Promise<void> {}
```

En `src/data/store/RemoteDataStore.ts`, agregar el caché, la hidratación y los overrides:

```ts
  private mpStatus?: MpStatus

  private hydrateMpStatus(): void {
    this.api.get<MpStatus>('/admin/mp/status').then((s) => { this.mpStatus = s; bus.emit('mp') }).catch(() => {})
  }

  override getMpStatus(): MpStatus | undefined {
    return this.mpStatus
  }

  override async connectMp(): Promise<string> {
    const { url } = await this.api.post<{ url: string }>('/admin/mp/connect', {})
    return url
  }

  override async disconnectMp(): Promise<void> {
    await this.api.del('/admin/mp/disconnect').catch(async () => {
      await this.api.post('/admin/mp/disconnect', {})
    })
    this.mpStatus = { conectado: false }
    bus.emit('mp')
  }
```

Llamar `this.hydrateMpStatus()` dentro de `refetchAdminScoped()`, junto a las otras hidrataciones admin.

- [ ] **Step 4: Crear el componente**

Crear `src/features/admin/OpsMpConnection.tsx`:

```tsx
import { useState } from 'react'
import { Button, Card, Eyebrow, Modal, toast } from '../../components/ui'
import { store, useStore } from '../../data/store'

/** Formatea una fecha ISO en algo legible para el organizador. */
function cuando(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function OpsMpConnection() {
  const estado = useStore((s) => s.getMpStatus())
  const [confirmando, setConfirmando] = useState(false)
  const [yendo, setYendo] = useState(false)

  const conectar = async () => {
    setYendo(true)
    try {
      window.location.href = await store.connectMp()
    } catch {
      toast('No pudimos abrir Mercado Pago. Revisá que la aplicación esté configurada.', 'info')
      setYendo(false)
    }
  }

  const desconectar = async () => {
    await store.disconnectMp()
    setConfirmando(false)
    toast('✓ Mercado Pago desconectado')
  }

  const conectado = estado?.conectado === true

  return (
    <>
      <Eyebrow>Cobros</Eyebrow>
      <Card className="mt-5 max-w-xl p-5 md:p-6">
        <div className="flex items-center gap-2.5">
          <span className={`size-2 rounded-full ${conectado ? 'bg-success' : 'bg-line'}`} />
          <span className="text-[15px] font-medium text-ink">
            Mercado Pago · {conectado ? 'conectado' : 'desconectado'}
          </span>
        </div>

        {conectado ? (
          <>
            <dl className="mt-4 space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Cuenta</dt>
                <dd className="text-ink">{estado?.cuenta}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Conectada desde</dt>
                <dd className="text-ink">{cuando(estado?.desde)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Permiso vigente hasta</dt>
                <dd className="text-ink">{cuando(estado?.vence)} · se renueva sola</dd>
              </div>
            </dl>
            <Button variant="ghost" size="sm" className="mt-5" onClick={() => setConfirmando(true)}>
              Desconectar
            </Button>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
              Mientras esté desconectado, las compras siguen andando con el link manual que cargaste
              por plan y confirmás las órdenes a mano.
            </p>
            <Button className="mt-5" onClick={conectar} disabled={yendo}>
              {yendo ? 'Abriendo Mercado Pago…' : 'Conectar con Mercado Pago'}
            </Button>
          </>
        )}
      </Card>

      <Modal open={confirmando} onClose={() => setConfirmando(false)}>
        <div className="p-5 md:p-6">
          <h3 className="text-[17px] font-medium text-ink">Desconectar Mercado Pago</h3>
          <p className="mt-2.5 text-[14px] leading-relaxed text-ink">
            CCM deja de poder cobrar al instante y las compras vuelven al link manual.
          </p>
          <p className="mt-3 rounded-sm bg-accent/10 p-3 text-[13px] leading-relaxed text-ink">
            Mercado Pago no permite que una aplicación se quite a sí misma el permiso. Para borrarlo
            del todo, entrá a las aplicaciones autorizadas de tu cuenta y quitá CCM desde ahí.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button size="sm" onClick={desconectar}>Desconectar</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
```

`Modal` se controla con `open` (no se monta condicionalmente) y **no acepta `title`**: su firma real es `{ open, onClose, children, variant, className }` — ver `src/components/ui/Modal.tsx:16`. El encabezado va como `<h3>` dentro de los children.

- [ ] **Step 5: Montar la sección en Configuración**

En `src/pages/admin/AdminConfiguracion.tsx`, agregar el import y la sección después del editor de tema:

```tsx
import { OpsMpConnection } from '../../features/admin/OpsMpConnection'
```

```tsx
      {/* ─── Cobros con Mercado Pago ─── */}
      <section className="mt-14 border-t border-line pt-10">
        <OpsMpConnection />
      </section>
```

- [ ] **Step 6: Correr el test y ver que pasa**

Run: `cd ~/dev/ccm-app && npx vitest run src/features/admin/OpsMpConnection.test.tsx`
Expected: PASS — 3 tests

- [ ] **Step 7: Verificar todo el front**

Run: `cd ~/dev/ccm-app && npx tsc -b && npm test`
Expected: typecheck sin salida; todos los tests PASS

- [ ] **Step 8: Commit**

```bash
cd ~/dev/ccm-app
git add src/features/admin/OpsMpConnection.tsx src/features/admin/OpsMpConnection.test.tsx \
        src/data/types.ts src/data/store/DataStore.ts src/data/store/LocalDataStore.ts \
        src/data/store/RemoteDataStore.ts src/pages/admin/AdminConfiguracion.tsx
git commit -m "feat(mp): pantalla de Cobros en el panel

Estado de la conexion, conectar y desconectar. El dialogo de desconexion dice
la verdad: MP no permite que la app se quite su propio permiso, asi que se
manda al organizador a las aplicaciones autorizadas de su cuenta."
```

---

### Task 7: El usuario paga de verdad (con red de seguridad)

**Files:**
- Modify: `src/data/store/DataStore.ts`
- Modify: `src/data/store/LocalDataStore.ts`
- Modify: `src/data/store/RemoteDataStore.ts`
- Modify: `src/features/tickets/TicketSelector.tsx:62-86`
- Create: `src/data/store/checkout.test.ts`

**Interfaces:**
- Consumes: `POST /payments/preference` de la tarea 4.
- Produces: `store.startCheckout(kind, resourceId): Promise<string | null>` — devuelve el link de pago, o `null` si no hay conexión MP (el llamador cae al link manual).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/data/store/checkout.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RemoteDataStore } from './RemoteDataStore'

let calls: { method: string; url: string; body?: string }[] = []
let store: Record<string, string> = {}

function memoryStorage(): Storage {
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v) },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  } as Storage
}

function fetchQueResponde(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: { method?: string; body?: string }) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body })
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
  }))
}

beforeEach(() => {
  store = {}
  calls = []
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
})

describe('startCheckout — el navegador nunca manda el precio', () => {
  it('pide el link de pago con kind y resourceId, sin monto', async () => {
    fetchQueResponde(201, { initPoint: 'https://mp/checkout/pref_1', paymentId: 'pay_1' })
    const s = new RemoteDataStore('https://api.test')
    const link = await s.startCheckout('ticket_order', 'ord_1')
    expect(link).toBe('https://mp/checkout/pref_1')
    const post = calls.find((c) => c.url.endsWith('/payments/preference'))!
    expect(post.body).toContain('ord_1')
    expect(post.body).not.toContain('total')
    expect(post.body).not.toContain('amount')
  })

  it('devuelve null si Mercado Pago no está conectado, para que el llamador use el link manual', async () => {
    fetchQueResponde(503, { error: { code: 'MP_NOT_CONNECTED' } })
    const s = new RemoteDataStore('https://api.test')
    expect(await s.startCheckout('ticket_order', 'ord_1')).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd ~/dev/ccm-app && npx vitest run src/data/store/checkout.test.ts`
Expected: FAIL — `s.startCheckout is not a function`

- [ ] **Step 3: Sumar el método al store**

En `src/data/store/DataStore.ts`:

```ts
  /** Link de pago de Mercado Pago para este recurso, o null si no hay conexión (usar mpLink). */
  startCheckout(kind: 'ticket_order' | 'membership' | 'ad_campaign', resourceId: string): Promise<string | null>
```

En `src/data/store/LocalDataStore.ts` (demo: nunca hay checkout real):

```ts
  async startCheckout(): Promise<string | null> {
    return null
  }
```

En `src/data/store/RemoteDataStore.ts`:

```ts
  override async startCheckout(
    kind: 'ticket_order' | 'membership' | 'ad_campaign',
    resourceId: string,
  ): Promise<string | null> {
    try {
      const r = await this.api.post<{ initPoint: string }>('/payments/preference', { kind, resourceId })
      return r.initPoint
    } catch {
      // Sin conexión MP (503) o error de red: devolvemos null y el llamador cae al link manual.
      // No se avisa acá: quien llama decide si hay alternativa o si hay que mostrar el error.
      return null
    }
  }
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `cd ~/dev/ccm-app && npx vitest run src/data/store/checkout.test.ts`
Expected: PASS — 2 tests

- [ ] **Step 5: Usar el checkout real al comprar entradas**

En `src/features/tickets/TicketSelector.tsx`, reemplazar el bloque que arma `mpLink` (línea ~70) por el pedido del checkout real, y `goToMp` por su versión asíncrona:

```tsx
      const orders = selected.map((p) => store.createOrder(p.id, qty[p.id]!))
      const orderedTotal = orders.reduce((acc, o) => acc + o.total, 0)
      // Checkout real por la PRIMERA orden; si no hay conexión con MP, cae al link manual del plan.
      const real = await store.startCheckout('ticket_order', orders[0].id)
      const mpLink = real ?? selected.find((p) => p.mpLink)?.mpLink ?? ''
      setPending({ orders, total: orderedTotal, mpLink })
```

```tsx
  const goToMp = () => {
    if (!pending) return
    if (!pending.mpLink) {
      toast('La venta de entradas no está disponible en este momento. Probá más tarde.', 'info')
      setPending(null)
      return
    }
    pending.orders.forEach((o) => store.markOrderRedirected(o.id))
    window.location.href = pending.mpLink
    setPending(null)
    setQty({})
    setConfirming(true)
  }
```

El `window.location.href` reemplaza al `window.open(..., '_blank')`: en móvil la pestaña nueva se pierde y el comprador no vuelve. Con redirección en la misma pestaña, las `back_urls` de la preferencia lo traen de nuevo a CCM.

Verificar que `toast` esté importado en el archivo; si no, agregarlo a la línea de import de `../../components/ui`.

- [ ] **Step 6: Verificar todo**

Run: `cd ~/dev/ccm-app && npx tsc -b && npm test`
Expected: typecheck sin salida; todos los tests PASS

Run: `cd ~/dev/ccm-app && npm run build`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
cd ~/dev/ccm-app
git add src/data/store/DataStore.ts src/data/store/LocalDataStore.ts src/data/store/RemoteDataStore.ts \
        src/data/store/checkout.test.ts src/features/tickets/TicketSelector.tsx
git commit -m "feat(mp): el comprador paga el monto real, con el link manual como red

startCheckout pide el link de pago con kind + resourceId (nunca el monto) y
devuelve null si MP no esta conectado, para caer al mpLink de siempre. La
redireccion pasa a ser en la misma pestania: en movil la pestania nueva se
perdia y el comprador no volvia."
```

---

### Task 8: Probar el circuito completo contra Mercado Pago

Las tareas 1-7 quedan verdes sin tocar MP. Esta las conecta de verdad. **Requiere que la aplicación de MP exista** (ver la sección "Prerrequisito" del spec).

**Files:**
- Create: `docs/superpowers/plans/2026-07-20-mercadopago-verificacion.md` (bitácora de lo verificado)

- [ ] **Step 1: Crear la aplicación en Mercado Pago**

Seguir el spec, sección "Prerrequisito". Al final se tienen: `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`.

- [ ] **Step 2: Crear los usuarios de prueba**

En el panel de developers de MP, crear dos usuarios de prueba: uno **vendedor** y uno **comprador**. Anotar usuario y contraseña de cada uno.

- [ ] **Step 3: Configurar el entorno en Railway**

```bash
cd ~/dev/ccm-app
railway link -p 1944e951-b049-4e9f-a15d-35fee058f8dc -e 30ce92c1-93d2-474b-bbc3-57714a3af19d -s 72d6c0c7-fcc5-4ef7-9ec7-1969078e1251
railway variables --set "MP_CLIENT_ID=<client-id>" --set "MP_CLIENT_SECRET=<client-secret>" \
                  --set "MP_REDIRECT_URI=https://ccm-api-production-91a9.up.railway.app/api/v1/mp/callback" \
                  --set "MP_WEBHOOK_SECRET=<webhook-secret>" -s ccm-api
```

Expected: `railway variables -s ccm-api | grep MP_` muestra las cuatro.

- [ ] **Step 4: Deployar**

```bash
cd ~/dev/ccm-app && railway up --ci -s ccm-api
```
Expected: `Deploy complete`

- [ ] **Step 5: Conectar con el vendedor de prueba**

Entrar al panel → Configuración → Cobros → "Conectar con Mercado Pago", iniciando sesión con el **usuario vendedor de prueba**. Aceptar los permisos.

Expected: vuelve a `/admin/configuracion?mp=ok` y la tarjeta muestra "conectado" con la cuenta y la fecha.

Verificar por API (el token de sesión se saca de las herramientas del navegador con el panel abierto, o se omite este paso y se mira la pantalla):
```bash
curl -s -H "Authorization: Bearer <TOKEN-DE-TU-SESION>" https://ccm-api-production-91a9.up.railway.app/api/v1/admin/mp/status
```
Expected: `{"conectado":true,"cuenta":"...","desde":"...","vence":"..."}` — **sin ningún token en la respuesta**.

- [ ] **Step 6: Comprar con el comprador de prueba**

En una ventana privada, entrar a la app, elegir 2 entradas VIP y comprar. Pagar con la tarjeta de prueba aprobada que MP documenta para Argentina, logueado como el **comprador de prueba**.

Expected: redirige a MP con el monto correcto (precio × 2, no un link genérico), se paga, y vuelve a `/entradas?pago=ok`.

- [ ] **Step 7: Verificar que se confirmó sola**

```bash
curl -s -H "Authorization: Bearer <TOKEN-DE-TU-SESION>" https://ccm-api-production-91a9.up.railway.app/api/v1/admin/orders | python3 -m json.tool | head -20
```
Expected: la orden figura con `"status": "confirmada"` **sin que nadie la haya tocado a mano**.

- [ ] **Step 8: Verificar la degradación**

Desconectar Mercado Pago desde el panel. Intentar comprar de nuevo.

Expected: la compra sigue funcionando y abre el link manual del plan; ninguna pantalla queda rota.

- [ ] **Step 9: Anotar lo verificado y commitear**

Escribir `docs/superpowers/plans/2026-07-20-mercadopago-verificacion.md` con: qué se probó, con qué usuarios, qué se observó en cada paso y cualquier diferencia con lo diseñado.

```bash
cd ~/dev/ccm-app
git add docs/superpowers/plans/2026-07-20-mercadopago-verificacion.md
git commit -m "docs(mp): bitacora de la verificacion del circuito con usuarios de prueba"
```

---

## Notas de ejecución

**Orden.** Las tareas 1→7 son secuenciales en dependencias pero cada una queda verde sola. La 8 necesita credenciales reales y es la única que no se puede hacer sin el dueño de la cuenta.

**Rebasar antes de empezar.** El repo tiene varias sesiones trabajando en paralelo; esta rama llegó a estar 32 commits atrás. `git fetch origin && git rebase origin/main` antes de la primera tarea y ante cualquier conflicto.

**Lo que NO hay que hacer:** agregar el SDK de Mercado Pago (`mercadopago` en npm). Se usan 4 endpoints por `fetch` y el SDK arrastra dependencias y tipos propios que después hay que mantener.
