/**
 * Seed de DESARROLLO. Lee los MISMOS datos del front (src/data/seed/*, src/config/plans)
 * — cero traducción — y los inserta en Postgres reusando los IDs/slugs canónicos (no se
 * regeneran: son contrato de deep-links).
 *
 * ⚠️ NO ES IDEMPOTENTE EN EL SENTIDO INOFENSIVO DE LA PALABRA. Cada upsert lleva un
 * `update:` que reescribe TODOS los campos, y para los hijos hace deleteMany+createMany.
 * Correrlo contra producción:
 *   · pisa `price` y `mpLink` de los planes de entrada → borra los links de pago cargados
 *     a mano y devuelve los precios VIP a los del archivo, en medio de una venta;
 *   · devuelve los 18 bloques de agenda a los datos de demostración, speakers ficticios
 *     incluidos, encima de lo que el organizador haya corregido.
 * Por eso el guard de abajo. La doc vieja lo llamaba "idempotente" a secas y esa palabra
 * ya indujo a correrlo donde no correspondía.
 *
 * Cubre lo necesario para Fase B (eventos + bloques + cupos) + sus FKs (sponsors,
 * planes). 🔶 Fases E/F/etc.: catálogo, galerías, contenidos, convocatorias.
 *
 * Correr una vez contra la DB: npm run db:seed (lee server/.env, igual que src/lib/env.ts).
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { seedSponsors } from '../../src/data/seed/sponsors'
import { seedEvents } from '../../src/data/seed/events'
import { seedBlocks } from '../../src/data/seed/blocks'
import { seedCatalog } from '../../src/data/seed/catalog'
import { seedGalleries } from '../../src/data/seed/galleries'
import { seedContents } from '../../src/data/seed/contents'
import { seedConvocatorias } from '../../src/data/seed/convocatorias'
import { seedApplications } from '../../src/data/seed/applications'
import { seedBenefits } from '../../src/data/seed/benefits'
import { seedBanners } from '../../src/data/seed/banners'
import { seedNotas } from '../../src/data/seed/notas'
import { seedPlans } from '../../src/config/plans'

const prisma = new PrismaClient()

/** Aborta si la base de destino parece producción. Dos señales independientes, porque una sola
 *  falla sola: NODE_ENV puede venir sin setear en una consola suelta, y la URL puede apuntar a
 *  prod desde una máquina local. Se destraba a propósito con SEED_FORZADO=si, que obliga a
 *  escribirlo y por lo tanto a pensarlo. */
function guardDeProduccion(): void {
  if (process.env.SEED_FORZADO === 'si') {
    console.warn('⚠️  SEED_FORZADO=si — corriendo el seed sin guard. Esto PISA datos cargados a mano.')
    return
  }
  const url = process.env.DATABASE_URL ?? ''
  const señales: string[] = []
  if (process.env.NODE_ENV === 'production') señales.push('NODE_ENV=production')
  if (/railway|rlwy\.net|proxy\.rlwy/i.test(url)) señales.push('DATABASE_URL apunta a Railway')
  if (señales.length === 0) return

  console.error(
    [
      '',
      '🛑  SEED ABORTADO: la base de destino parece PRODUCCIÓN.',
      `    Señales: ${señales.join(' · ')}`,
      '',
      '    Este seed no es inofensivo: reescribe todos los campos de lo que toca.',
      '    Contra prod te borra los links de pago de las entradas y devuelve la agenda',
      '    a los datos de demostración, con los speakers ficticios incluidos.',
      '',
      '    Si de verdad querés correrlo igual: SEED_FORZADO=si npm run db:seed',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

async function main() {
  guardDeProduccion()
  // ── Sponsors (+ creatives) — FK de EventSponsor y galerías ──
  for (const s of seedSponsors) {
    await prisma.sponsor.upsert({
      where: { id: s.id },
      create: { id: s.id, name: s.name, industry: s.industry, level: s.level, exclusive: s.exclusive, tagline: s.tagline, banner: s.banner ?? null },
      update: { name: s.name, industry: s.industry, level: s.level, exclusive: s.exclusive, tagline: s.tagline, banner: s.banner ?? null },
    })
    await prisma.sponsorCreative.deleteMany({ where: { sponsorId: s.id } })
    await prisma.sponsorCreative.createMany({
      data: s.creatives.map((c, i) => ({ sponsorId: s.id, slot: c.slot, headline: c.headline, sub: c.sub ?? null, cta: c.cta ?? null, order: i })),
    })
  }

  // ── Planes de entrada ──
  for (const p of seedPlans) {
    const data = {
      name: p.name, tagline: p.tagline, price: p.price ?? null, serviceCharge: p.serviceCharge,
      mpLink: p.mpLink ?? null, perks: p.perks, featured: p.featured ?? false, day: p.day, kind: p.kind, preventa: p.preventa ?? false,
    }
    await prisma.ticketPlan.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data })
  }

  // ── Eventos (+ links a sponsors) ──
  for (const e of seedEvents) {
    const data = {
      slug: e.slug, type: e.type, title: e.title, subtitle: e.subtitle ?? null, dateLabel: e.dateLabel,
      startDate: new Date(e.startDate), timeLabel: e.timeLabel ?? null, venue: e.venue, address: e.address,
      mapsUrl: e.mapsUrl, description: e.description, cover: e.cover, price: e.price ?? null,
      past: e.past ?? false, socioOnly: e.socioOnly ?? false,
    }
    await prisma.event.upsert({ where: { id: e.id }, create: { id: e.id, ...data }, update: data })
    for (const sponsorId of e.sponsorIds ?? []) {
      await prisma.eventSponsor.upsert({
        where: { eventId_sponsorId: { eventId: e.id, sponsorId } },
        create: { eventId: e.id, sponsorId },
        update: {},
      })
    }
  }

  // ── Bloques (con seedTaken como baseline del cupo) ──
  for (const b of seedBlocks) {
    const data = {
      eventId: b.eventId, title: b.title, kind: b.kind, day: b.day, start: b.start, end: b.end,
      room: b.room, capacity: b.capacity, seedTaken: b.seedTaken, speakers: b.speakers, description: b.description ?? null,
    }
    await prisma.eventBlock.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data })
  }

  // ── Catálogo de expositores (+ portfolio) ──
  for (const c of seedCatalog) {
    const data = {
      slug: c.slug, name: c.name, role: c.role, kind: c.kind ?? 'participante', platform: c.platform, city: c.city,
      bio: c.bio, projects: c.projects ?? null, photo: c.photo, instagram: c.instagram ?? null, whatsapp: c.whatsapp ?? null, verified: c.verified, participatesIn: c.participatesIn,
    }
    await prisma.catalogProfile.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data })
    await prisma.portfolioPiece.deleteMany({ where: { profileId: c.id } })
    await prisma.portfolioPiece.createMany({
      data: c.portfolio.map((p, i) => ({ id: p.id, profileId: c.id, image: p.image, title: p.title, caption: p.caption ?? null, price: p.price ?? null, order: i })),
    })
  }

  // ── Galerías (+ fotos) ──
  for (const g of seedGalleries) {
    const data = { slug: g.slug, title: g.title, eventLabel: g.eventLabel, date: g.date, cover: g.cover, sponsorId: g.sponsorId }
    await prisma.gallery.upsert({ where: { id: g.id }, create: { id: g.id, ...data }, update: data })
    await prisma.photo.deleteMany({ where: { galleryId: g.id } })
    await prisma.photo.createMany({
      data: g.photos.map((p, i) => ({ id: p.id, galleryId: g.id, src: p.src, alt: p.alt, order: i })),
    })
  }

  // ── Contenido (videos) ──
  for (const ct of seedContents) {
    const data = {
      type: ct.type, title: ct.title, description: ct.description, youtubeId: ct.youtubeId,
      duration: ct.duration ?? null, platform: ct.platform ?? null, sponsorId: ct.sponsorId ?? null,
      publishedAt: new Date(ct.publishedAt), socioOnly: ct.socioOnly ?? false,
    }
    await prisma.contentItem.upsert({ where: { id: ct.id }, create: { id: ct.id, ...data }, update: data })
  }

  // ── Convocatorias (+ fields) ──
  for (const cv of seedConvocatorias) {
    const data = { slug: cv.slug, title: cv.title, intro: cv.intro, deadline: new Date(cv.deadline), eventId: cv.eventId }
    await prisma.convocatoria.upsert({ where: { id: cv.id }, create: { id: cv.id, ...data }, update: data })
    await prisma.convocatoriaField.deleteMany({ where: { convocatoriaId: cv.id } })
    await prisma.convocatoriaField.createMany({
      data: cv.fields.map((f, i) => ({
        convocatoriaId: cv.id, key: f.key, label: f.label, type: f.type, required: f.required,
        options: f.options ?? [], placeholder: f.placeholder ?? null, help: f.help ?? null,
        showIfKey: f.showIf?.key ?? null, showIfEquals: f.showIf?.equals ?? null, order: i,
      })),
    })
  }

  // ── Postulaciones (históricas del seed, fromSeed) ──
  for (const a of seedApplications) {
    const data = { convocatoriaId: a.convocatoriaId, status: a.status, data: a.data as object, fromSeed: true, ts: new Date(a.ts), decidedAt: a.decidedAt ? new Date(a.decidedAt) : null }
    await prisma.application.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data })
  }

  // ── Beneficios (descuentos para registrados) ──
  for (const b of seedBenefits) {
    const data = {
      partner: b.partner, category: b.category, title: b.title, description: b.description,
      code: b.code ?? null, discountLabel: b.discountLabel ?? null, url: b.url ?? null,
      logo: b.logo ?? null, validUntil: b.validUntil ? new Date(b.validUntil) : null,
      order: b.order, active: b.active,
    }
    await prisma.benefit.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data })
  }

  // ── Banners gestionados (publicidad que carga marketing) ──
  for (const bn of seedBanners) {
    const data = {
      slot: bn.slot, brand: bn.brand, image: bn.image, alt: bn.alt ?? null,
      destinationType: bn.destinationType, destinationUrl: bn.destinationUrl,
      fixed: bn.fixed, order: bn.order, active: bn.active,
    }
    await prisma.banner.upsert({ where: { id: bn.id }, create: { id: bn.id, ...data }, update: data })
  }

  // ── Notas / novedades editoriales (las edita prensa) ──
  for (const n of seedNotas) {
    const data = {
      slug: n.slug, title: n.title, excerpt: n.excerpt, body: n.body, cover: n.cover ?? null,
      author: n.author ?? null, category: n.category ?? null, youtubeId: n.youtubeId ?? null,
      published: n.published, publishedAt: new Date(n.publishedAt), order: n.order,
    }
    await prisma.nota.upsert({ where: { id: n.id }, create: { id: n.id, ...data }, update: data })
  }

  const counts = {
    notas: await prisma.nota.count(),
    banners: await prisma.banner.count(),
    sponsors: await prisma.sponsor.count(),
    benefits: await prisma.benefit.count(),
    plans: await prisma.ticketPlan.count(),
    events: await prisma.event.count(),
    blocks: await prisma.eventBlock.count(),
    catalog: await prisma.catalogProfile.count(),
    galleries: await prisma.gallery.count(),
    photos: await prisma.photo.count(),
    contents: await prisma.contentItem.count(),
    convocatorias: await prisma.convocatoria.count(),
    applications: await prisma.application.count(),
  }
  console.log('[seed] OK', counts)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[seed] error', err)
    await prisma.$disconnect()
    process.exit(1)
  })
