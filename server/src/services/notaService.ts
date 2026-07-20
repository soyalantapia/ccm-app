import { prisma } from '../lib/prisma.js'
import { toNota } from '../lib/serialize.js'
import { notFound } from '../lib/errors.js'
import { parseDate } from '../lib/dates.js'
import { sanitizeNotaBody } from '../lib/sanitizeBody.js'
import type { Nota } from '@domain/types'

/** Notas publicadas: orden manual de prensa (order asc) y, a igualdad, más recientes primero. */
export async function getNotas(): Promise<Nota[]> {
  const rows = await prisma.nota.findMany({
    where: { published: true },
    orderBy: [{ order: 'asc' }, { publishedAt: 'desc' }],
  })
  return rows.map(toNota)
}

export async function getNota(slug: string): Promise<Nota> {
  const n = await prisma.nota.findUnique({ where: { slug } })
  if (!n || !n.published) throw notFound('NOTA_NOT_FOUND', 'Nota no encontrada')
  return toNota(n)
}

/** Admin (prensa): todas, incl. borradores. */
export async function getAllNotas(): Promise<Nota[]> {
  const rows = await prisma.nota.findMany({ orderBy: [{ order: 'asc' }, { publishedAt: 'desc' }] })
  return rows.map(toNota)
}

export async function createNota(n: Nota): Promise<Nota> {
  const row = await prisma.nota.create({
    data: {
      id: n.id, slug: n.slug, title: n.title, excerpt: n.excerpt, body: sanitizeNotaBody(n.body),
      cover: n.cover ?? null, author: n.author ?? null, category: n.category ?? null,
      youtubeId: n.youtubeId ?? null, published: n.published ?? true,
      publishedAt: parseDate(n.publishedAt, 'fecha de publicación'), order: n.order ?? 0,
    },
  })
  return toNota(row)
}

export async function updateNota(id: string, patch: Partial<Nota>): Promise<Nota> {
  const data: Record<string, unknown> = {}
  for (const k of ['slug', 'title', 'excerpt', 'body', 'cover', 'author', 'category', 'youtubeId', 'published', 'order'] as const) {
    if (k in patch) data[k] = (patch as Record<string, unknown>)[k]
  }
  // El cuerpo se limpia también al editar: si no, alcanzaba con un PATCH para meter HTML crudo.
  if (typeof data.body === 'string') data.body = sanitizeNotaBody(data.body)
  if (patch.publishedAt) data.publishedAt = parseDate(patch.publishedAt, 'fecha de publicación')
  const row = await prisma.nota.update({ where: { id }, data })
  return toNota(row)
}

export async function deleteNota(id: string): Promise<void> {
  await prisma.nota.delete({ where: { id } })
}
