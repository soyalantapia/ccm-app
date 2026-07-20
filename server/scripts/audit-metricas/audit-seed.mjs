/**
 * Banco de pruebas para auditar las métricas del Dashboard.
 * Siembra cantidades EXACTAS y conocidas, para poder contrastar
 * "lo que muestra el dashboard" contra "la verdad".
 *
 * El escenario clave: 600 eventos user_created contra 10 devices reales.
 * Como GET /admin/analytics devuelve como máximo 500 filas ordenadas por ts desc,
 * cualquier conteo hecho sobre esa lista queda amputado por construcción.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const VERDAD = {
  devices: 10,
  registrationsConfirmadas: 6,
  registrationsCanceladas: 2,
  sociosPagos: 3,
  ingresoSocios: 20000, // 5000 + 5000 + 10000
  ordenesConfirmadas: 2,
  plataTrabada: 45000, // 3 iniciadas x 10000 + 1 redirigida x 15000
  ordenesTrabadas: 4,
  postulacionesRealesPendientes: 4,
  postulacionesDeSeed: 2,
  descargas: 7,
  analyticsUserCreated: 600, // > 500 a propósito
}

async function main() {
  // Catálogo mínimo para satisfacer las FK
  const ev = await prisma.event.create({
    data: {
      id: 'ev-audit', slug: 'evento-audit', type: 'camino', title: 'Evento de auditoría',
      dateLabel: '01/09', startDate: new Date('2026-09-01T00:00:00.000Z'), venue: 'Sala', address: 'Calle 1',
      mapsUrl: '', description: 'd', cover: 'img/x.jpg',
    },
  })
  await prisma.eventBlock.createMany({
    data: [
      { id: 'blk-lleno', eventId: ev.id, title: 'Bloque lleno', kind: 'charla', day: '01/09', start: '10:00', end: '11:00', room: 'A', capacity: 10, seedTaken: 8, speakers: [] },
      { id: 'blk-flojo', eventId: ev.id, title: 'Bloque flojo', kind: 'charla', day: '01/09', start: '12:00', end: '13:00', room: 'B', capacity: 100, seedTaken: 0, speakers: [] },
      { id: 'blk-cero', eventId: ev.id, title: 'Bloque sin cupo', kind: 'charla', day: '01/09', start: '14:00', end: '15:00', room: 'C', capacity: 0, seedTaken: 0, speakers: [] },
    ],
  })
  await prisma.convocatoria.createMany({
    data: [
      { id: 'conv-cerca', slug: 'cierra-pronto', title: 'Cierra en 3 días', intro: 'i', deadline: new Date(Date.now() + 3 * 864e5), eventId: ev.id },
      { id: 'conv-lejos', slug: 'cierra-lejos', title: 'Cierra en 30 días', intro: 'i', deadline: new Date(Date.now() + 30 * 864e5), eventId: ev.id },
      { id: 'conv-vencida', slug: 'ya-vencio', title: 'Venció ayer', intro: 'i', deadline: new Date(Date.now() - 864e5), eventId: ev.id },
    ],
  })
  await prisma.ticketPlan.create({
    data: { id: 'plan-vip', name: 'VIP', kind: 'vip', tagline: 't', price: 25000, serviceCharge: 5000, day: 'sabado' },
  })
  await prisma.sponsor.create({ data: { id: 'sp-1', name: 'Sponsor Uno', industry: 'banco', level: 'Oro', tagline: 't' } })
  await prisma.gallery.create({
    data: { id: 'gal-1', slug: 'g1', title: 'G', eventLabel: 'e', date: '01/09', cover: 'c.jpg', sponsorId: 'sp-1' },
  })
  await prisma.photo.createMany({
    data: Array.from({ length: 7 }, (_, i) => ({ id: `ph-${i}`, galleryId: 'gal-1', src: `p${i}.jpg`, alt: `foto ${i}`, order: i })),
  })

  // Devices: la verdad de "Registrados"
  const devices = []
  for (let i = 0; i < VERDAD.devices; i++) {
    devices.push(await prisma.device.create({ data: { publicId: `dev-pub-${i}` } }))
  }

  // Registraciones: 6 confirmadas + 2 canceladas
  for (let i = 0; i < VERDAD.registrationsConfirmadas; i++) {
    await prisma.registration.create({
      data: { id: `reg-ok-${i}`, deviceId: devices[i].id, eventId: ev.id, blockId: i < 3 ? 'blk-flojo' : null, status: 'confirmada' },
    })
  }
  for (let i = 0; i < VERDAD.registrationsCanceladas; i++) {
    await prisma.registration.create({
      data: { id: `reg-no-${i}`, deviceId: devices[i + 6].id, eventId: ev.id, blockId: null, status: 'cancelada' },
    })
  }

  // Membresías: 3 socios pagos (20000 en total) + 2 free
  const pagos = [5000, 5000, 10000]
  for (let i = 0; i < 3; i++) {
    await prisma.membership.create({ data: { deviceId: devices[i].id, tier: 'socio', since: new Date(), paid: pagos[i] } })
  }
  for (let i = 3; i < 5; i++) {
    await prisma.membership.create({ data: { deviceId: devices[i].id, tier: 'free', paid: 0 } })
  }

  // Órdenes: 2 cobradas, 4 trabadas (45000), 1 cancelada
  await prisma.ticketOrder.createMany({
    data: [
      { id: 'ord-ok-1', deviceId: devices[0].id, planId: 'plan-vip', status: 'confirmada', qty: 1, total: 30000 },
      { id: 'ord-ok-2', deviceId: devices[1].id, planId: 'plan-vip', status: 'confirmada', qty: 1, total: 30000 },
      { id: 'ord-ini-1', deviceId: devices[2].id, planId: 'plan-vip', status: 'iniciada', qty: 1, total: 10000 },
      { id: 'ord-ini-2', deviceId: devices[3].id, planId: 'plan-vip', status: 'iniciada', qty: 1, total: 10000 },
      { id: 'ord-ini-3', deviceId: devices[4].id, planId: 'plan-vip', status: 'iniciada', qty: 1, total: 10000 },
      { id: 'ord-mp-1', deviceId: devices[5].id, planId: 'plan-vip', status: 'redirigida_mp', qty: 1, total: 15000 },
      { id: 'ord-can-1', deviceId: devices[6].id, planId: 'plan-vip', status: 'cancelada', qty: 1, total: 99000 },
    ],
  })

  // Postulaciones: 4 reales pendientes (una vieja) + 2 del seed + 1 ya resuelta
  const hace = (d) => new Date(Date.now() - d * 864e5)
  await prisma.application.createMany({
    data: [
      { id: 'app-real-1', convocatoriaId: 'conv-cerca', deviceId: devices[0].id, status: 'preinscripta', data: {}, fromSeed: false, ts: hace(12) },
      { id: 'app-real-2', convocatoriaId: 'conv-cerca', deviceId: devices[1].id, status: 'preinscripta', data: {}, fromSeed: false, ts: hace(5) },
      { id: 'app-real-3', convocatoriaId: 'conv-lejos', deviceId: devices[2].id, status: 'preinscripta', data: {}, fromSeed: false, ts: hace(2) },
      { id: 'app-real-4', convocatoriaId: 'conv-lejos', deviceId: devices[3].id, status: 'preinscripta', data: {}, fromSeed: false, ts: hace(1) },
      { id: 'app-seed-1', convocatoriaId: 'conv-cerca', status: 'preinscripta', data: {}, fromSeed: true, ts: hace(40) },
      { id: 'app-seed-2', convocatoriaId: 'conv-cerca', status: 'preinscripta', data: {}, fromSeed: true, ts: hace(41) },
      { id: 'app-ok-1', convocatoriaId: 'conv-cerca', deviceId: devices[4].id, status: 'aceptada', data: {}, fromSeed: false, ts: hace(9), decidedAt: hace(8) },
    ],
  })

  // Descargas: 7
  await prisma.photoDownload.createMany({
    data: Array.from({ length: VERDAD.descargas }, (_, i) => ({
      deviceId: devices[i % VERDAD.devices].id, photoId: `ph-${i}`, galleryId: 'gal-1', sponsorId: 'sp-1',
    })),
  })

  // EL escenario clave: 600 user_created + ruido más reciente que los empuja fuera de la ventana
  await prisma.analyticsEvent.createMany({
    data: Array.from({ length: VERDAD.analyticsUserCreated }, (_, i) => ({
      event: 'user_created', deviceId: devices[i % VERDAD.devices].id, ts: new Date(Date.now() - (1000 - i) * 60000), seed: false,
    })),
  })
  await prisma.analyticsEvent.createMany({
    data: Array.from({ length: 300 }, (_, i) => ({
      event: 'ad_impression', deviceId: devices[i % VERDAD.devices].id, payload: { sponsorId: 'sp-1' }, ts: new Date(Date.now() - i * 1000), seed: false,
    })),
  })

  console.log(JSON.stringify({ sembrado: VERDAD, totalAnalytics: VERDAD.analyticsUserCreated + 300 }, null, 1))
}

main().finally(() => prisma.$disconnect())
