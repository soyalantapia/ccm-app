/**
 * Seed → prod (doc 10 §10). Idempotente (upsert por id). Lee los MISMOS datos del
 * front (src/data/seed/*, src/config/plans) — cero traducción — y los inserta en
 * Postgres reusando los IDs/slugs canónicos (no se regeneran: son contrato de deep-links).
 *
 * Cubre lo necesario para Fase B (eventos + bloques + cupos) + sus FKs (sponsors,
 * planes). 🔶 Fases E/F/etc.: catálogo, galerías, contenidos, convocatorias.
 *
 * Correr una vez contra la DB: DATABASE_URL=<...> npx tsx prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { seedSponsors } from '../../src/data/seed/sponsors'
import { seedEvents } from '../../src/data/seed/events'
import { seedBlocks } from '../../src/data/seed/blocks'
import { seedPlans } from '../../src/config/plans'

const prisma = new PrismaClient()

async function main() {
  // ── Sponsors (+ creatives) — FK de EventSponsor y galerías ──
  for (const s of seedSponsors) {
    await prisma.sponsor.upsert({
      where: { id: s.id },
      create: { id: s.id, name: s.name, industry: s.industry, level: s.level, exclusive: s.exclusive, tagline: s.tagline },
      update: { name: s.name, industry: s.industry, level: s.level, exclusive: s.exclusive, tagline: s.tagline },
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

  const counts = {
    sponsors: await prisma.sponsor.count(),
    plans: await prisma.ticketPlan.count(),
    events: await prisma.event.count(),
    blocks: await prisma.eventBlock.count(),
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
