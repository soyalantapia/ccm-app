import { Prisma, type Person } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import type { IdentityKeys } from '../domain/personIdentity.js'

/** true si es el error de Prisma por violar un índice único (P2002). */
function esConflictoDeUnicidad(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

/** Busca las Personas dueñas de estas claves. Desempate determinístico: más antigua y, ante
 *  un empate de createdAt (dos personas creadas casi al mismo tiempo, típico en una carrera),
 *  id ascendente como segunda clave. */
function buscarPorClaves(email: string | null, dni: string | null) {
  return prisma.person.findMany({
    where: { OR: [...(email ? [{ email }] : []), ...(dni ? [{ dni }] : [])] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
}

/**
 * De un conjunto de candidatas dueñas de las mismas claves, elige la más antigua (ya vienen
 * ordenadas así por `buscarPorClaves`). Si hay más de una, es porque el email y el dni
 * pertenecen a personas DISTINTAS: se deja rastro con `console.warn` para poder auditarlo,
 * tanto si el conflicto se vio en la lectura normal como si recién apareció al reintentar tras
 * una carrera (un caso no puede resolverse más callado que el otro: los dos son la misma
 * situación de fondo). `origen` identifica en qué punto del flujo se detectó, para que el log
 * sea útil al leerlo.
 */
function elegirDuenaYRegistrarConflicto(candidatas: Person[], origen: string): Person | undefined {
  const [duena] = candidatas
  if (candidatas.length > 1) {
    console.warn(
      `[personas] claves en conflicto (${origen}): pertenecen a personas distintas ` +
        `(${candidatas.map((p) => p.id).join(', ')}). Se usa la más antigua ${duena.id}; ` +
        `no se fusiona automáticamente.`,
    )
  }
  return duena
}

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

  const encontradas = await buscarPorClaves(email, dni)

  if (encontradas.length === 0) {
    try {
      const creada = await prisma.person.create({ data: { email, dni } })
      return creada.id
    } catch (err) {
      // Carrera: dos requests concurrentes con las mismas claves nuevas hicieron el findMany
      // de arriba casi al mismo tiempo, ambos vieron 0 resultados, y los dos llamaron a este
      // create. El índice único de Person.email/dni deja pasar uno solo; el que perdió cae acá
      // con P2002. No es un error real: el que ganó ya creó lo que necesitábamos, así que lo
      // buscamos de nuevo y devolvemos SU id en lugar de romper. Un solo reintento alcanza —
      // si ni así aparece, ahí sí es un error real y se propaga.
      if (!esConflictoDeUnicidad(err)) throw err
      const ganadora = elegirDuenaYRegistrarConflicto(
        await buscarPorClaves(email, dni),
        'reintento tras carrera en la creación',
      )
      if (!ganadora) throw err
      return ganadora.id
    }
  }

  const duena = elegirDuenaYRegistrarConflicto(encontradas, 'lectura inicial')!

  if (encontradas.length > 1) {
    return duena.id
  }

  // Completar la clave que falte, sin pisar una que ya esté.
  const faltantes: { email?: string; dni?: string } = {}
  if (email && !duena.email) faltantes.email = email
  if (dni && !duena.dni) faltantes.dni = dni
  if (Object.keys(faltantes).length > 0) {
    // Este es el punto exacto donde un email compartido (ej. una casilla familiar) puede
    // producir una fusión equivocada: si llega un DNI nuevo que en realidad pertenece a OTRO
    // ser humano que comparte el email con `duena`, esta rama se lo pega igual, porque desde
    // acá no hay forma de distinguir "es la misma persona completando su dato" de "es otra
    // persona con el mismo mail". No cambiamos el comportamiento —no completar nunca rompería
    // el caso común de alguien que primero deja el email y después el DNI— pero sí dejamos
    // rastro para poder auditarlo, igual que con el conflicto simétrico de arriba.
    try {
      await prisma.person.update({ where: { id: duena.id }, data: faltantes })
      // El log recién va ACÁ, después de que el update efectivamente commiteó: si lo
      // emitiéramos antes de intentarlo, y el update fallara más abajo (P2002: la carrera de
      // abajo), el log habría afirmado que esta persona se quedó con la clave cuando en
      // realidad terminó siendo otra. Solo se registra lo que de verdad pasó.
      console.warn(
        `[personas] se completó una clave que faltaba en la persona ${duena.id}: ` +
          `${Object.entries(faltantes)
            .map(([clave, valor]) => `${clave}=${valor}`)
            .join(', ')}.`,
      )
    } catch (err) {
      // Misma carrera que en el create, pero en el camino de completar: otro request
      // concurrente le ganó de mano esa misma clave a OTRA persona antes de que este update
      // commiteara. Reintentamos una vez buscando por las claves; si el reintento encuentra a
      // más de una dueña, es el mismo conflicto de siempre y se audita igual (ver
      // elegirDuenaYRegistrarConflicto), y devolvemos quien ganó.
      if (!esConflictoDeUnicidad(err)) throw err
      const ganadora = elegirDuenaYRegistrarConflicto(
        await buscarPorClaves(email, dni),
        'reintento tras carrera al completar una clave',
      )
      if (!ganadora) throw err
      return ganadora.id
    }
  }
  return duena.id
}

/* ─── CRM: lista y ficha ─── */

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

/** La más reciente de una lista de fechas de actividad (o null si no hay ninguna).
 *  OJO: NO usar Array.sort() sobre Date[] sin comparador — el sort por defecto compara por
 *  el string de cada elemento, no cronológicamente, y da un resultado incorrecto. */
function masReciente(fechas: Date[]): Date | null {
  return fechas.reduce<Date | null>((max, f) => (!max || f > max ? f : max), null)
}

/** Mapeo de la clave en el JSON libre de una postulación a la clave de `campos` de la ficha.
 *  Deliberadamente acotado a las claves de identidad/contacto (PRD §10.3): el resto del JSON
 *  (historia, extra, desfile, portfolio, acompanante, ...) son respuestas propias de esa
 *  convocatoria puntual y ya se muestran en el bloque de Postulaciones — traerlas acá arriba
 *  sería ruido duplicado. */
const MAPEO_CAMPOS_POSTULACION: Record<string, string> = {
  nombre: 'nombre',
  email: 'email',
  dni: 'dni',
  telefono: 'phone',
  instagram: 'instagram',
}

/**
 * Completa, desde el JSON de la postulación más reciente, las claves de `campos` que NO hayan
 * llegado ya por ProfileField. ProfileField manda siempre: tiene procedencia real (`source` y
 * `capturedAt` verdaderos, del dispositivo que los capturó), mientras que acá solo podemos
 * decir "vinieron de esta postulación" — que es honesto, pero pisar un ProfileField real con
 * esto sería peor información, no mejor. Hoy las 24 personas de la base vienen de postulaciones
 * (no del sitio), así que sin esto la ficha —que promete "quién es esta persona"— queda vacía
 * para casi todo el mundo.
 */
function camposDesdePostulacion(
  app: { data: unknown; ts: Date } | undefined,
  yaPresentes: Set<string>,
): PersonaCampo[] {
  if (!app) return []
  const { data } = app
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const d = data as Record<string, unknown>

  const campos: PersonaCampo[] = []
  for (const [claveJson, claveCampo] of Object.entries(MAPEO_CAMPOS_POSTULACION)) {
    if (yaPresentes.has(claveCampo)) continue // el ProfileField ya trajo esta clave: no se pisa
    const valor = d[claveJson]
    if (typeof valor !== 'string' || !valor.trim()) continue
    campos.push({ key: claveCampo, value: valor, source: 'postulacion', capturedAt: app.ts.toISOString() })
  }
  return campos
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
          { applications: { some: { data: { path: ['nombre'], string_contains: q, mode: 'insensitive' } } } },
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
    const ultimaAct = masReciente(p.devices.flatMap((d) => d.analytics).map((a) => a.ts))
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
      ultimaActividad: ultimaAct ? ultimaAct.toISOString() : null,
    }
  })

  const anonimos = await prisma.device.count({ where: { personId: null } })

  return {
    items,
    nextCursor: hayMas ? pagina[pagina.length - 1].id : null,
    anonimos,
  }
}

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
  // Los campos de consentimiento son por dispositivo: si la persona tiene más de uno, se
  // muestra el primero que tenga ALGO marcado (en vez de siempre el primer dispositivo a
  // secas, que dejaría la ficha en blanco si justo ese fue el que no consintió nada).
  const primerDevice =
    p.devices.find((d) => d.consentTerms || d.consentNews || d.consentSponsors) ?? p.devices[0] ?? null
  const membership = p.devices.map((d) => d.membership).find(Boolean) ?? null
  // Igual que en listPeople: NO ordenar AnalyticsEvent[] con .sort() sin comparador — el
  // string-sort por defecto no es cronológico. Cada device.analytics ya viene ts-desc, pero
  // flatMap de varios devices no queda globalmente ordenado, así que se reordena bien acá.
  const analytics = p.devices
    .flatMap((d) => d.analytics)
    .sort((a, b) => b.ts.getTime() - a.ts.getTime())

  // applications ya viene ts-desc (ver el include de arriba), así que [0] es la más reciente.
  const campos: PersonaCampo[] = [
    ...fields.map((f) => ({ key: f.key, value: f.value, source: f.source, capturedAt: f.capturedAt.toISOString() })),
    ...camposDesdePostulacion(p.applications[0], new Set(fields.map((f) => f.key))),
  ]

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
    campos,
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
    // AnalyticsEvent no tiene columnas `type`/`meta`: son `event` y `payload`.
    actividad: analytics.map((a) => ({ type: a.event, ts: a.ts.toISOString(), meta: a.payload })),
  }
}
