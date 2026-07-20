import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { toEventItem, toEventBlock, toContentItem, toSponsor, toGallery, toCatalogProfile, toConvocatoria } from '../lib/serialize.js'
import { conflict, badRequest } from '../lib/errors.js'
import { parseDate } from '../lib/dates.js'
import { cleanStoredUrl } from '../lib/url.js'
import type { EventItem, EventBlock, ContentItem, Sponsor, Gallery, CatalogProfile, PlanId, Convocatoria } from '@domain/types'

/**
 * Precio saneado para una columna Int? de Postgres.
 *
 * Ninguna capa de la cadena admin acotaba los precios: ni el input, ni el submit
 * (`Number(raw)` crudo), ni la ruta (el helper `create` solo valida que venga un id). Un
 * decimal, un negativo, un NaN o un número fuera del rango de int4 llegaban tal cual a
 * Prisma y salían como 500 en vez de un 400 de validación — o peor, se persistía un precio
 * absurdo que después se le muestra al público en la ficha del catálogo.
 */
const PRECIO_MAX = 1_000_000_000 // holgado para pesos, muy por debajo del techo de int4
function precioValido(raw: unknown, campo = 'precio'): number | null {
  if (raw == null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > PRECIO_MAX) {
    throw badRequest('INVALID_PRICE', `El ${campo} debe ser un número entre 0 y ${PRECIO_MAX}.`)
  }
  return Math.round(n)
}

/* ─── Eventos ─── */
async function readEvent(id: string): Promise<EventItem> {
  const ev = await prisma.event.findUniqueOrThrow({
    where: { id },
    include: { sponsors: { select: { sponsorId: true } } },
  })
  return toEventItem(ev)
}

export async function createEvent(e: EventItem): Promise<EventItem> {
  await prisma.event.create({
    data: {
      id: e.id, slug: e.slug, type: e.type, title: e.title, subtitle: e.subtitle ?? null,
      dateLabel: e.dateLabel, startDate: parseDate(e.startDate, 'fecha del evento'), timeLabel: e.timeLabel ?? null,
      venue: e.venue, address: e.address, mapsUrl: cleanStoredUrl(e.mapsUrl, 'mapa') ?? '', description: e.description,
      cover: e.cover, price: precioValido(e.price, 'precio del evento'), past: e.past ?? false, socioOnly: e.socioOnly ?? false,
    },
  })
  if (e.sponsorIds?.length) {
    await prisma.eventSponsor.createMany({
      data: e.sponsorIds.map((sponsorId) => ({ eventId: e.id, sponsorId })),
      skipDuplicates: true,
    })
  }
  return readEvent(e.id)
}

export async function updateEvent(id: string, patch: Partial<EventItem>): Promise<EventItem> {
  const data: Record<string, unknown> = {}
  for (const k of ['type', 'title', 'subtitle', 'dateLabel', 'timeLabel', 'venue', 'address', 'description', 'cover', 'past', 'socioOnly', 'slug'] as const) {
    if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  }
  if ('price' in patch) data.price = precioValido(patch.price, 'precio del evento')
  if ('mapsUrl' in patch) data.mapsUrl = cleanStoredUrl(patch.mapsUrl, 'mapa') ?? '' // valida esquema (no javascript:/data:)
  if (patch.startDate) data.startDate = parseDate(patch.startDate, 'fecha del evento')
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id }, data })
    if (patch.sponsorIds) {
      await tx.eventSponsor.deleteMany({ where: { eventId: id } })
      if (patch.sponsorIds.length) {
        await tx.eventSponsor.createMany({
          data: patch.sponsorIds.map((sponsorId) => ({ eventId: id, sponsorId })),
          skipDuplicates: true,
        })
      }
    }
  })
  return readEvent(id)
}

export async function deleteEvent(id: string): Promise<void> {
  // El pre-chequeo y el delete van en UNA transacción, con la fila padre bloqueada (FOR UPDATE)
  // ANTES de contar. Si no, el count es una foto de un instante anterior al DELETE: alguien se
  // inscribe en esa ventana y el cascade se lleva su inscripción, que es justo lo que la guarda
  // quería evitar. Vale para los cuatro borrados con pre-chequeo de este archivo.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${id} FOR UPDATE`
    const regs = await tx.registration.count({ where: { eventId: id, status: 'confirmada' } })
    if (regs > 0) throw conflict('HAS_REGISTRATIONS', `No se puede borrar: tiene ${regs} inscripciones confirmadas`)
    // Convocatoria.eventId es FK RESTRICT: sin este pre-chequeo el delete tira P2003 y el errorHandler
    // lo mapea al mensaje genérico de "galerías". Damos un 409 claro.
    const convs = await tx.convocatoria.count({ where: { eventId: id } })
    if (convs > 0) throw conflict('HAS_CONVOCATORIAS', `No se puede borrar: tiene ${convs} convocatoria(s) asociada(s)`)
    await tx.event.delete({ where: { id } }) // cascade a bloques sin inscripciones
  })
}

/* ─── Bloques ─── */
export async function createBlock(b: EventBlock): Promise<EventBlock> {
  const row = await prisma.eventBlock.create({
    data: {
      id: b.id, eventId: b.eventId, title: b.title, kind: b.kind, day: b.day, start: b.start,
      end: b.end, room: b.room, capacity: b.capacity, seedTaken: b.seedTaken ?? 0,
      speakers: b.speakers ?? [], description: b.description ?? null,
    },
  })
  return toEventBlock(row)
}

export async function updateBlock(id: string, patch: Partial<EventBlock>): Promise<EventBlock> {
  const data: Record<string, unknown> = {}
  for (const k of ['title', 'kind', 'day', 'start', 'end', 'room', 'capacity', 'seedTaken', 'speakers', 'description'] as const) {
    if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  }
  const row = await prisma.eventBlock.update({ where: { id }, data })
  return toEventBlock(row)
}

export async function deleteBlock(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EventBlock" WHERE id = ${id} FOR UPDATE`
    const regs = await tx.registration.count({ where: { blockId: id, status: 'confirmada' } })
    if (regs > 0) throw conflict('HAS_REGISTRATIONS', `No se puede borrar: tiene ${regs} inscripciones confirmadas`)
    await tx.eventBlock.delete({ where: { id } })
  })
}

/* ─── Contenido ─── */
export async function createContent(c: ContentItem): Promise<ContentItem> {
  const row = await prisma.contentItem.create({
    data: {
      id: c.id, type: c.type, title: c.title, description: c.description, youtubeId: c.youtubeId,
      duration: c.duration ?? null, platform: c.platform ?? null, sponsorId: c.sponsorId ?? null,
      publishedAt: parseDate(c.publishedAt, 'fecha de publicación'), socioOnly: c.socioOnly ?? false,
    },
  })
  return toContentItem(row)
}

export async function updateContent(id: string, patch: Partial<ContentItem>): Promise<ContentItem> {
  const data: Record<string, unknown> = {}
  for (const k of ['title', 'description', 'youtubeId', 'duration', 'platform', 'sponsorId', 'socioOnly'] as const) {
    if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  }
  if (patch.publishedAt) data.publishedAt = parseDate(patch.publishedAt, 'fecha de publicación')
  const row = await prisma.contentItem.update({ where: { id }, data })
  return toContentItem(row)
}

export async function deleteContent(id: string): Promise<void> {
  await prisma.contentItem.delete({ where: { id } })
}

/* ─── Sponsors (+ creatives) ─── */
async function readSponsor(id: string): Promise<Sponsor> {
  const s = await prisma.sponsor.findUniqueOrThrow({ where: { id }, include: { creatives: { orderBy: { order: 'asc' } } } })
  return toSponsor(s)
}
function creativeRows(sponsorId: string, creatives: Sponsor['creatives']) {
  return creatives.map((c, i) => ({ sponsorId, slot: c.slot, headline: c.headline, sub: c.sub ?? null, cta: c.cta ?? null, order: i }))
}
export async function createSponsor(s: Sponsor): Promise<Sponsor> {
  await prisma.sponsor.create({ data: { id: s.id, name: s.name, industry: s.industry, level: s.level, exclusive: s.exclusive, tagline: s.tagline, banner: s.banner ?? null } })
  if (s.creatives?.length) await prisma.sponsorCreative.createMany({ data: creativeRows(s.id, s.creatives) })
  return readSponsor(s.id)
}
export async function updateSponsor(id: string, patch: Partial<Sponsor>): Promise<Sponsor> {
  const data: Record<string, unknown> = {}
  for (const k of ['name', 'industry', 'level', 'exclusive', 'tagline', 'banner'] as const) if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  await prisma.$transaction(async (tx) => {
    await tx.sponsor.update({ where: { id }, data })
    if (patch.creatives) {
      await tx.sponsorCreative.deleteMany({ where: { sponsorId: id } })
      if (patch.creatives.length) await tx.sponsorCreative.createMany({ data: creativeRows(id, patch.creatives) })
    }
  })
  return readSponsor(id)
}
export async function deleteSponsor(id: string): Promise<void> {
  // Borrado seguro: Gallery.sponsorId es onDelete: Restrict. Pre-chequeamos para dar
  // un 409 claro (el RESTRICT del FK surfacea como error genérico, no mapeable).
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sponsor" WHERE id = ${id} FOR UPDATE`
    const galleries = await tx.gallery.count({ where: { sponsorId: id } })
    if (galleries > 0) throw conflict('HAS_GALLERIES', `No se puede borrar: tiene ${galleries} galería(s) asociada(s)`)
    await tx.sponsor.delete({ where: { id } })
  })
}

/* ─── Galerías (+ fotos) ─── */
async function readGallery(id: string): Promise<Gallery> {
  const g = await prisma.gallery.findUniqueOrThrow({ where: { id }, include: { photos: { orderBy: { order: 'asc' } } } })
  return toGallery(g)
}
export async function createGallery(g: Gallery): Promise<Gallery> {
  await prisma.gallery.create({ data: { id: g.id, slug: g.slug, title: g.title, eventLabel: g.eventLabel, date: g.date, cover: g.cover, sponsorId: g.sponsorId } })
  if (g.photos?.length) await prisma.photo.createMany({ data: g.photos.map((p, i) => ({ id: p.id, galleryId: g.id, src: p.src, alt: p.alt, order: i })) })
  return readGallery(g.id)
}
/**
 * ⚠️ NO VOLVER A `deleteMany` + `createMany` ACÁ. `Photo` es la única entidad que recreamos
 * cuyo id está referenciado por otras tablas: `PhotoFavorite.photoId` y `PhotoDownload.photoId`,
 * ambas con `onDelete: Cascade` (schema.prisma). El cascade dispara en el DELETE, así que borrar
 * y recrear con el MISMO id igual se lleva puestos los favoritos y las descargas del asistente.
 * Medido: editarle el título a una galería borraba todos sus favoritos y descargas.
 *
 * Invariante: ninguna fila que sobrevive al guardado pasa por un DELETE.
 *   sobrevivientes → update · nuevas → create · y solo al final se borran las que realmente se sacaron.
 */
export async function updateGallery(id: string, patch: Partial<Gallery>): Promise<Gallery> {
  const data: Record<string, unknown> = {}
  for (const k of ['slug', 'title', 'eventLabel', 'date', 'cover', 'sponsorId'] as const) if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  await prisma.$transaction(async (tx) => {
    await tx.gallery.update({ where: { id }, data })
    if (!patch.photos) return

    const existentes = await tx.photo.findMany({ where: { galleryId: id }, select: { id: true, src: true } })
    const porId = new Map(existentes.map((p) => [p.id, p]))
    // Fallback por src para clientes con el bundle viejo cacheado por el service worker: ese front
    // manda un id nuevo por foto en cada guardado. Cada fila existente se consume UNA sola vez.
    const librePorSrc = new Map<string, string[]>()
    for (const p of existentes) {
      if (!porId.has(p.id)) continue
      const l = librePorSrc.get(p.src) ?? []
      l.push(p.id)
      librePorSrc.set(p.src, l)
    }

    const sobreviven: string[] = []
    const usados = new Set<string>()
    for (const [i, p] of patch.photos.entries()) {
      let real: string | undefined
      if (p.id && porId.has(p.id) && !usados.has(p.id)) real = p.id
      else {
        const cola = librePorSrc.get(p.src)
        while (cola?.length) {
          const cand = cola.shift() as string
          if (!usados.has(cand)) { real = cand; break }
        }
      }

      if (real) {
        usados.add(real)
        sobreviven.push(real)
        // `alt` solo se pisa si vino en el payload: en prod los 58 alt están escritos a mano.
        const campos: Record<string, unknown> = { src: p.src, order: i }
        if (p.alt !== undefined) campos.alt = p.alt
        await tx.photo.update({ where: { id: real }, data: campos })
      } else {
        // Id nuevo. `Photo.id` no tiene @default, así que siempre lo ponemos nosotros; si el id que
        // manda el cliente ya existe (podría ser de OTRA galería), lo re-minteamos para no robarla.
        const propuesto = p.id && !(await tx.photo.findUnique({ where: { id: p.id }, select: { id: true } })) ? p.id : `ph_${randomUUID()}`
        sobreviven.push(propuesto)
        await tx.photo.create({ data: { id: propuesto, galleryId: id, src: p.src, alt: p.alt ?? '', order: i } })
      }
    }

    await tx.photo.deleteMany({ where: { galleryId: id, id: { notIn: sobreviven } } })
  })
  return readGallery(id)
}
export async function deleteGallery(id: string): Promise<void> {
  await prisma.gallery.delete({ where: { id } })
}

/* ─── Catálogo (+ portfolio) ─── */
async function readCatalog(id: string): Promise<CatalogProfile> {
  const c = await prisma.catalogProfile.findUniqueOrThrow({ where: { id }, include: { portfolio: { orderBy: { order: 'asc' } } } })
  return toCatalogProfile(c)
}
export async function createCatalogProfile(c: CatalogProfile): Promise<CatalogProfile> {
  await prisma.catalogProfile.create({ data: { id: c.id, slug: c.slug, name: c.name, role: c.role, kind: c.kind ?? 'participante', platform: c.platform, city: c.city, bio: c.bio, projects: c.projects ?? null, photo: c.photo, instagram: c.instagram ?? null, whatsapp: c.whatsapp ?? null, verified: c.verified, participatesIn: c.participatesIn } })
  if (c.portfolio?.length) await prisma.portfolioPiece.createMany({ data: c.portfolio.map((p, i) => ({ id: p.id, profileId: c.id, image: p.image, title: p.title, caption: p.caption ?? null, price: precioValido(p.price, 'precio de la obra'), order: i })) })
  return readCatalog(c.id)
}
export async function updateCatalogProfile(id: string, patch: Partial<CatalogProfile>): Promise<CatalogProfile> {
  const data: Record<string, unknown> = {}
  for (const k of ['slug', 'name', 'role', 'kind', 'platform', 'city', 'bio', 'projects', 'photo', 'instagram', 'whatsapp', 'verified', 'participatesIn'] as const) if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  await prisma.$transaction(async (tx) => {
    await tx.catalogProfile.update({ where: { id }, data })
    if (patch.portfolio) {
      // A diferencia de Photo, PortfolioPiece no está referenciada por nadie, así que recrearla es
      // inocuo. Lo que NO es inocuo es `?? null`: el form de expositores no conoce `caption` y en
      // prod hay 50 obras con epígrafe escrito a mano. Guardar un perfil los borraba a todos.
      // Regla: campo que no viene en el payload = campo que no se toca (se hereda del existente).
      const previas = await tx.portfolioPiece.findMany({ where: { profileId: id }, select: { id: true, image: true, caption: true, price: true, title: true } })
      const porId = new Map(previas.map((p) => [p.id, p]))
      const porImagen = new Map(previas.map((p) => [p.image, p]))
      const hereda = (p: { id?: string; image: string }) => (p.id ? porId.get(p.id) : undefined) ?? porImagen.get(p.image)

      await tx.portfolioPiece.deleteMany({ where: { profileId: id } })
      if (patch.portfolio.length) {
        await tx.portfolioPiece.createMany({
          data: patch.portfolio.map((p, i) => {
            const prev = hereda(p)
            return {
              id: p.id,
              profileId: id,
              image: p.image,
              title: p.title,
              caption: p.caption !== undefined ? p.caption : (prev?.caption ?? null),
              // Hereda si no vino, pero si vino se valida: un precio fuera del rango de int4
              // llegaba crudo a una columna Int? y salía como 500 en vez de un 400.
              price: p.price !== undefined ? precioValido(p.price, 'precio de la obra') : (prev?.price ?? null),
              order: i,
            }
          }),
        })
      }
    }
  })
  return readCatalog(id)
}
export async function deleteCatalogProfile(id: string): Promise<void> {
  await prisma.catalogProfile.delete({ where: { id } })
}

/* ─── Planes (solo precio/mpLink) ─── */
export async function updatePlan(id: PlanId, patch: { price?: number | null; mpLink?: string }): Promise<void> {
  const data: Record<string, unknown> = {}
  if ('price' in patch) data.price = precioValido(patch.price, 'precio del plan')
  if ('mpLink' in patch) data.mpLink = cleanStoredUrl(patch.mpLink, 'link de pago')
  await prisma.ticketPlan.update({ where: { id }, data })
}

/* ─── Convocatorias (crear/editar desde el admin — antes solo venían del seed) ─── */
// Mapea los campos del dominio (showIf: {key, equals}) a las columnas de ConvocatoriaField.
// SIN convocatoriaId: Prisma pone la FK sola en el nested `create`. Para el `createMany`
// del update (que sí necesita la FK) se agrega convocatoriaId al vuelo (ver updateConvocatoria).
function fieldRows(fields: Convocatoria['fields']) {
  return fields.map((f, i) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    options: f.options ?? [],
    placeholder: f.placeholder ?? null,
    help: f.help ?? null,
    showIfKey: f.showIf?.key ?? null,
    showIfEquals: f.showIf?.equals ?? null,
    order: i,
  }))
}

function logoRows(logos: NonNullable<Convocatoria['logos']>) {
  return logos.map((l, i) => ({
    name: l.name,
    logoUrl: l.logoUrl,
    url: cleanStoredUrl(l.url, 'link del logo'),
    rubro: l.rubro ?? null,
    order: i,
  }))
}

async function readConvocatoria(id: string): Promise<Convocatoria> {
  const cv = await prisma.convocatoria.findUniqueOrThrow({
    where: { id },
    include: { fields: { orderBy: { order: 'asc' } }, logos: { orderBy: { order: 'asc' } } },
  })
  return toConvocatoria(cv)
}

export async function createConvocatoria(cv: Convocatoria): Promise<Convocatoria> {
  await prisma.convocatoria.create({
    data: {
      id: cv.id,
      slug: cv.slug,
      title: cv.title,
      intro: cv.intro,
      deadline: parseDate(cv.deadline, 'fecha límite'),
      eventId: cv.eventId,
      ctaLabel: cv.ctaLabel ?? null,
      ctaUrl: cleanStoredUrl(cv.ctaUrl, 'CTA'),
      fields: { create: fieldRows(cv.fields) },
      ...(cv.logos && cv.logos.length ? { logos: { create: logoRows(cv.logos) } } : {}),
    },
  })
  return readConvocatoria(cv.id)
}

export async function updateConvocatoria(id: string, patch: Partial<Convocatoria>): Promise<Convocatoria> {
  const data: Record<string, unknown> = {}
  for (const k of ['slug', 'title', 'intro', 'eventId', 'ctaLabel'] as const) if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  if ('ctaUrl' in patch) data.ctaUrl = cleanStoredUrl(patch.ctaUrl, 'CTA')
  if ('deadline' in patch && patch.deadline) data.deadline = parseDate(patch.deadline, 'fecha límite')
  await prisma.$transaction(async (tx) => {
    await tx.convocatoria.update({ where: { id }, data })
    if (patch.fields) {
      // Reemplazo completo de los campos (createMany con order recalculado). createMany NO es
      // relacional → necesita la FK convocatoriaId en cada fila (a diferencia del nested create).
      await tx.convocatoriaField.deleteMany({ where: { convocatoriaId: id } })
      if (patch.fields.length) await tx.convocatoriaField.createMany({ data: fieldRows(patch.fields).map((r) => ({ ...r, convocatoriaId: id })) })
    }
    if (patch.logos) {
      await tx.convocatoriaLogo.deleteMany({ where: { convocatoriaId: id } })
      if (patch.logos.length) await tx.convocatoriaLogo.createMany({ data: logoRows(patch.logos).map((r) => ({ ...r, convocatoriaId: id })) })
    }
  })
  return readConvocatoria(id)
}

export async function deleteConvocatoria(id: string): Promise<void> {
  // No borrar una convocatoria con postulaciones (Application cascada → perdería datos).
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Convocatoria" WHERE id = ${id} FOR UPDATE`
    const apps = await tx.application.count({ where: { convocatoriaId: id } })
    if (apps > 0) throw conflict('CONVOCATORIA_HAS_APPLICATIONS', `No se puede borrar: tiene ${apps} postulación(es).`)
    await tx.convocatoria.delete({ where: { id } })
  })
}
