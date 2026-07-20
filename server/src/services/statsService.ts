import { prisma } from '../lib/prisma.js'

/**
 * Métricas del Dashboard del organizador, calculadas sobre las TABLAS DE NEGOCIO.
 *
 * Reemplaza el modelo anterior, que contaba eventos de AnalyticsEvent en el navegador
 * sobre una lista truncada a 500 filas. Ese modelo fallaba de tres formas distintas y
 * simultáneas (medido en scripts/audit-metricas):
 *
 *  1. Eventos que NUNCA llegan al backend. `user_created` se emite por lib/track.ts,
 *     que sólo escribe en localStorage, así que la tabla no tiene una sola fila. El KPI
 *     "Registrados" daba 0 en producción — y "Conversión a Socio" mostraba 0% siempre,
 *     porque ese cero era el denominador.
 *  2. El techo de 500. Los eventos de alta frecuencia (page_view, ad_impression) desplazan
 *     al resto fuera de la ventana, así que todo conteo queda amputado y sesgado.
 *  3. Contar eventos no es contar hechos. Una reemisión infla; un flush perdido borra.
 *
 * Acá cada número sale de un COUNT/groupBy sobre la tabla que es fuente de verdad, y todo
 * se calcula en la MISMA llamada para que los KPIs no puedan contradecirse entre sí.
 */

const DIA_MS = 86_400_000
/** Ventana de "está por cerrar" para convocatorias. */
const VENTANA_CIERRE_DIAS = 14
/** Cuántas filas se muestran de cada lista accionable. */
const TOP = 5

export interface AdminStats {
  generatedAt: string
  kpis: {
    registrados: number
    inscripciones: number
    socios: number
    ingresoSocios: number
    ordenesConfirmadas: number
    postulaciones: number
    descargas: number
  }
  postulacionesPendientes: {
    total: number
    masAntiguaDias: number | null
    items: { id: string; convocatoriaTitulo: string; diasEsperando: number; ts: string }[]
  }
  plataTrabada: {
    montoTotal: number
    cantidad: number
    porEstado: { status: string; cantidad: number; monto: number }[]
  }
  bloquesFlojos: {
    items: {
      id: string
      titulo: string
      eventoTitulo: string
      dia: string
      capacity: number
      taken: number
      faltan: number
      ocupacion: number
    }[]
  }
  convocatoriasPorCerrar: {
    items: { id: string; slug: string; titulo: string; deadline: string; diasRestantes: number; postulaciones: number }[]
  }
  sponsors: { items: { sponsorId: string; nombre: string; nivel: string | null; descargas: number }[] }
}

/** Días enteros transcurridos entre dos fechas (nunca negativo). */
function diasDesde(desde: Date, hasta: Date): number {
  return Math.max(0, Math.floor((hasta.getTime() - desde.getTime()) / DIA_MS))
}

/** Los siete números de la fila superior. Cada uno, un COUNT sobre su tabla. */
async function contarKpis(): Promise<AdminStats['kpis']> {
  const [registrados, inscripciones, socios, ingreso, ordenesConfirmadas, postulaciones, descargas] =
    await Promise.all([
      prisma.device.count(),
      prisma.registration.count({ where: { status: 'confirmada' } }),
      prisma.membership.count({ where: { tier: 'socio' } }),
      prisma.membership.aggregate({ _sum: { paid: true }, where: { tier: 'socio' } }),
      // Sólo lo COBRADO. Las trabadas tienen su propio bloque, con una acción asociada;
      // sumarlas acá daría un número que no distingue plata en mano de plata perdida.
      prisma.ticketOrder.count({ where: { status: 'confirmada' } }),
      // fromSeed:false — las del seed son demo y nadie las va a responder.
      prisma.application.count({ where: { fromSeed: false } }),
      prisma.photoDownload.count(),
    ])
  return {
    registrados,
    inscripciones,
    socios,
    ingresoSocios: ingreso._sum.paid ?? 0,
    ordenesConfirmadas,
    postulaciones,
    descargas,
  }
}

/** Postulaciones que esperan respuesta, las más viejas primero. */
async function postulacionesPendientes(ahora: Date): Promise<AdminStats['postulacionesPendientes']> {
  const where = { status: 'preinscripta' as const, fromSeed: false }
  const [total, filas] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: { ts: 'asc' },
      take: TOP,
      include: { convocatoria: { select: { title: true } } },
    }),
  ])
  const items = filas.map((a) => ({
    id: a.id,
    convocatoriaTitulo: a.convocatoria?.title ?? 'Convocatoria',
    // Se calcula en el SERVIDOR: si lo hiciera el front, dependería del reloj del visitante.
    diasEsperando: diasDesde(a.ts, ahora),
    ts: a.ts.toISOString(),
  }))
  return { total, masAntiguaDias: items[0]?.diasEsperando ?? null, items }
}

/** Compras que arrancaron y no se cobraron: cuánta plata hay para recuperar. */
async function plataTrabada(): Promise<AdminStats['plataTrabada']> {
  const grupos = await prisma.ticketOrder.groupBy({
    by: ['status'],
    where: { status: { in: ['iniciada', 'redirigida_mp'] } },
    _sum: { total: true },
    _count: { _all: true },
  })
  const porEstado = grupos.map((g) => ({
    status: String(g.status),
    cantidad: g._count._all,
    monto: g._sum.total ?? 0,
  }))
  return {
    montoTotal: porEstado.reduce((s, g) => s + g.monto, 0),
    cantidad: porEstado.reduce((s, g) => s + g.cantidad, 0),
    porEstado,
  }
}

/** Bloques de eventos que todavía no pasaron, ordenados por qué tan vacíos están. */
async function bloquesFlojos(ahora: Date): Promise<AdminStats['bloquesFlojos']> {
  // Sólo eventos futuros: el panel anterior apuntaba a un evento fijo por id, así que
  // seguía mostrando "Camino a CCM · Junio" un mes después de que terminara.
  const bloques = await prisma.eventBlock.findMany({
    where: { event: { startDate: { gte: ahora } }, capacity: { gt: 0 } },
    include: { event: { select: { title: true, startDate: true } } },
  })
  if (bloques.length === 0) return { items: [] }

  const confirmadas = await prisma.registration.groupBy({
    by: ['blockId'],
    where: { blockId: { in: bloques.map((b) => b.id) }, status: 'confirmada' },
    _count: { _all: true },
  })
  const porBloque = new Map(confirmadas.map((r) => [r.blockId!, r._count._all]))

  const items = bloques
    // capacity > 0 ya viene filtrado por la query; el guard extra evita cualquier NaN
    // si algún dato viejo se colara con capacity 0.
    .filter((b) => b.capacity > 0)
    .map((b) => {
      const taken = Math.min(b.capacity, b.seedTaken + (porBloque.get(b.id) ?? 0))
      return {
        id: b.id,
        titulo: b.title,
        eventoTitulo: b.event.title,
        dia: b.day,
        capacity: b.capacity,
        taken,
        faltan: Math.max(0, b.capacity - taken),
        ocupacion: Math.round((taken / b.capacity) * 100),
        _fecha: b.event.startDate.getTime(),
      }
    })
    // Más vacío primero; a igual ocupación, el que ocurre antes (es más urgente).
    .sort((a, b) => a.ocupacion - b.ocupacion || a._fecha - b._fecha)
    .slice(0, TOP)
    .map(({ _fecha, ...b }) => b)

  return { items }
}

/** Convocatorias que cierran pronto: todavía se puede empujar difusión o extender. */
async function convocatoriasPorCerrar(ahora: Date): Promise<AdminStats['convocatoriasPorCerrar']> {
  const limite = new Date(ahora.getTime() + VENTANA_CIERRE_DIAS * DIA_MS)
  const filas = await prisma.convocatoria.findMany({
    where: { deadline: { gte: ahora, lte: limite } },
    orderBy: { deadline: 'asc' },
    include: { _count: { select: { applications: true } } },
  })
  return {
    items: filas.map((c) => ({
      id: c.id,
      slug: c.slug,
      titulo: c.title,
      deadline: c.deadline.toISOString(),
      diasRestantes: diasDesde(ahora, c.deadline),
      postulaciones: c._count.applications,
    })),
  }
}

/**
 * Descargas de fotos por sponsor. Impresiones y clics quedan afuera a propósito:
 * viven en AnalyticsEvent y arrastran el mismo techo de 500 que este servicio vino
 * a eliminar. PhotoDownload es una tabla real, así que este número sí es confiable.
 */
async function sponsors(): Promise<AdminStats['sponsors']> {
  const grupos = await prisma.photoDownload.groupBy({
    by: ['sponsorId'],
    _count: { _all: true },
    orderBy: { _count: { sponsorId: 'desc' } },
    take: 10,
  })
  if (grupos.length === 0) return { items: [] }
  const encontrados = await prisma.sponsor.findMany({
    where: { id: { in: grupos.map((g) => g.sponsorId) } },
    select: { id: true, name: true, level: true },
  })
  const porId = new Map(encontrados.map((s) => [s.id, s]))
  return {
    items: grupos.map((g) => {
      const s = porId.get(g.sponsorId)
      return {
        sponsorId: g.sponsorId,
        nombre: s?.name ?? 'Sponsor dado de baja',
        nivel: s?.level ?? null,
        descargas: g._count._all,
      }
    }),
  }
}

/** Todo el Dashboard en una sola llamada, con un único instante de referencia. */
export async function getAdminStats(): Promise<AdminStats> {
  // Un solo `ahora` para todos los bloques: si cada uno tomara el suyo, "días esperando"
  // y "días restantes" podrían quedar calculados contra relojes distintos.
  const ahora = new Date()
  const [kpis, pendientes, trabada, flojos, porCerrar, sponsorRows] = await Promise.all([
    contarKpis(),
    postulacionesPendientes(ahora),
    plataTrabada(),
    bloquesFlojos(ahora),
    convocatoriasPorCerrar(ahora),
    sponsors(),
  ])
  return {
    generatedAt: ahora.toISOString(),
    kpis,
    postulacionesPendientes: pendientes,
    plataTrabada: trabada,
    bloquesFlojos: flojos,
    convocatoriasPorCerrar: porCerrar,
    sponsors: sponsorRows,
  }
}
