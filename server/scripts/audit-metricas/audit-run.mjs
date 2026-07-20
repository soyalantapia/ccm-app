/**
 * Auditoría de métricas: DASHBOARD vs VERDAD.
 *
 * Columna "dashboard": replica exactamente lo que hace hoy el front —
 * pide la lista de analytics con el mismo tope que analyticsService.list(500)
 * y cuenta con .filter().length, igual que Dashboard.tsx.
 *
 * Columna "verdad": la query correcta sobre la tabla de negocio.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const VERDAD_SEMBRADA = {
  registrados: 10, inscripciones: 6, socios: 3, ingresoSocios: 20000,
  ordenesCobradas: 2, plataTrabada: 45000, postulacionesPendientes: 4, descargas: 7,
}

async function main() {
  // ── Lo que recibe el front: analyticsService.list(limit=500) ──
  const lista = await prisma.analyticsEvent.findMany({ orderBy: { ts: 'desc' }, take: 500 })
  const totalEnBase = await prisma.analyticsEvent.count()
  const count = (name) => lista.filter((e) => e.event === name).length   // = Dashboard.tsx:25

  // ── Fuente de verdad ──
  const [registrados, inscripciones, socios, ingreso, cobradas, trabadas, pendientes, descargas] =
    await Promise.all([
      prisma.device.count(),
      prisma.registration.count({ where: { status: 'confirmada' } }),
      prisma.membership.count({ where: { tier: 'socio' } }),
      prisma.membership.aggregate({ _sum: { paid: true }, where: { tier: 'socio' } }),
      prisma.ticketOrder.count({ where: { status: 'confirmada' } }),
      prisma.ticketOrder.groupBy({
        by: ['status'], where: { status: { in: ['iniciada', 'redirigida_mp'] } },
        _sum: { total: true }, _count: { _all: true },
      }),
      prisma.application.count({ where: { status: 'preinscripta', fromSeed: false } }),
      prisma.photoDownload.count(),
    ])
  const plataTrabada = trabadas.reduce((s, g) => s + (g._sum.total ?? 0), 0)

  const filas = [
    ['Registrados',        count('user_created'),                                    registrados,              VERDAD_SEMBRADA.registrados],
    ['Inscripciones',      count('registration_created') - count('registration_cancelled'), inscripciones,     VERDAD_SEMBRADA.inscripciones],
    ['Socios CCM',         count('membership_purchased'),                            socios,                   VERDAD_SEMBRADA.socios],
    ['Ingreso socios',     lista.filter((e) => e.event === 'membership_purchased')
                             .reduce((s, e) => s + (typeof e.payload?.total === 'number' ? e.payload.total : 0), 0),
                                                                                     ingreso._sum.paid ?? 0,   VERDAD_SEMBRADA.ingresoSocios],
    ['Órdenes cobradas',   count('ticket_order_created'),                            cobradas,                 VERDAD_SEMBRADA.ordenesCobradas],
    ['Plata trabada',      null,                                                     plataTrabada,             VERDAD_SEMBRADA.plataTrabada],
    ['Postulaciones pend.',null,                                                     pendientes,               VERDAD_SEMBRADA.postulacionesPendientes],
    ['Descargas de fotos', count('photo_download'),                                  descargas,                VERDAD_SEMBRADA.descargas],
  ]

  console.log(`\nEventos en la base: ${totalEnBase}  ·  la API entrega como máximo: ${lista.length}`)
  console.log(`(o sea que se pierden ${totalEnBase - lista.length} filas antes de contar)\n`)
  console.log('MÉTRICA                 DASHBOARD      VERDAD    ESPERADO   VEREDICTO')
  console.log('─'.repeat(74))
  let rotas = 0, imposibles = 0
  for (const [nombre, dash, verdad, esperado] of filas) {
    const okVerdad = verdad === esperado
    let veredicto
    if (dash === null) { veredicto = 'NO SE PUEDE CALCULAR HOY'; imposibles++ }
    else if (dash !== verdad) { veredicto = `MAL (difiere en ${dash - verdad})`; rotas++ }
    else veredicto = 'coincide'
    if (!okVerdad) veredicto += ` ⚠ la query da ${verdad}, esperaba ${esperado}`
    console.log(
      `${nombre.padEnd(22)} ${String(dash ?? '—').padStart(9)} ${String(verdad).padStart(11)} ${String(esperado).padStart(10)}   ${veredicto}`,
    )
  }
  console.log('─'.repeat(74))
  console.log(`\n${rotas} métricas dan un número equivocado · ${imposibles} no se pueden calcular con eventos\n`)

  // Bloques flojos: verificar que capacity 0 no produce NaN
  const bloques = await prisma.eventBlock.findMany()
  const regs = await prisma.registration.groupBy({
    by: ['blockId'], where: { status: 'confirmada', blockId: { not: null } }, _count: { _all: true },
  })
  const porBloque = new Map(regs.map((r) => [r.blockId, r._count._all]))
  console.log('BLOQUE                CAP  TOMADO  OCUPACIÓN')
  for (const b of bloques) {
    const taken = Math.min(b.capacity, b.seedTaken + (porBloque.get(b.id) ?? 0))
    const ocup = b.capacity === 0 ? 'sin cupo (excluido)' : `${Math.round((taken / b.capacity) * 100)}%`
    console.log(`${b.title.padEnd(21)} ${String(b.capacity).padStart(4)} ${String(taken).padStart(7)}  ${ocup}`)
  }

  // Convocatorias por cerrar (ventana de 14 días)
  const ahora = new Date()
  const en14 = new Date(ahora.getTime() + 14 * 864e5)
  const convs = await prisma.convocatoria.findMany({
    where: { deadline: { gte: ahora, lte: en14 } }, include: { _count: { select: { applications: true } } },
  })
  console.log(`\nConvocatorias que cierran en 14 días: ${convs.length} → ${convs.map((c) => c.title).join(', ') || '(ninguna)'}`)
}

main().finally(() => prisma.$disconnect())
