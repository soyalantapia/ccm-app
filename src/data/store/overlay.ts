import { readJSON, writeJSON } from '../../lib/storage'

/**
 * Capa de edición local sobre la semilla estática (Fase 0). Cada colección
 * (eventos, bloques, galerías, sponsors, …) guarda en localStorage qué se
 * creó, editó y borró; `mergeOverlay` la aplica sobre el seed inmutable.
 * Patrón único reutilizable por todas las entidades → CRUD real sin backend.
 * Como `writeJSON` emite en el bus, la UI se re-renderiza sola; y el "Reiniciar
 * demo" (que limpia las claves `ccm:`) borra también estas ediciones.
 */
export interface Overlay<T> {
  created: T[]
  edited: Record<string, Partial<T>>
  deleted: string[]
}

export function readOverlay<T>(key: string): Overlay<T> {
  const o = readJSON<Partial<Overlay<T>>>(key, {})
  return { created: o.created ?? [], edited: o.edited ?? {}, deleted: o.deleted ?? [] }
}

/** Aplica creados/editados/borrados sobre la semilla. */
export function mergeOverlay<T extends { id: string }>(seed: readonly T[], key: string): T[] {
  const ov = readOverlay<T>(key)
  const deleted = new Set(ov.deleted)
  const fromSeed = seed
    .filter((s) => !deleted.has(s.id))
    .map((s) => (ov.edited[s.id] ? { ...s, ...ov.edited[s.id] } : s))
  const created = ov.created
    .filter((c) => !deleted.has(c.id))
    .map((c) => (ov.edited[c.id] ? { ...c, ...ov.edited[c.id] } : c))
  return [...fromSeed, ...created]
}

export function overlayCreate<T extends { id: string }>(key: string, item: T): T {
  const ov = readOverlay<T>(key)
  writeJSON(key, { ...ov, created: [...ov.created, item] })
  return item
}

export function overlayEdit<T extends { id: string }>(key: string, id: string, patch: Partial<T>): void {
  const ov = readOverlay<T>(key)
  if (ov.created.some((c) => c.id === id)) {
    writeJSON(key, { ...ov, created: ov.created.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  } else {
    writeJSON(key, { ...ov, edited: { ...ov.edited, [id]: { ...ov.edited[id], ...patch } } })
  }
}

export function overlayDelete(key: string, id: string): void {
  const ov = readOverlay<{ id: string }>(key)
  writeJSON(key, {
    ...ov,
    created: ov.created.filter((c) => c.id !== id),
    deleted: ov.deleted.includes(id) ? ov.deleted : [...ov.deleted, id],
  })
}

/** Slug seguro a partir de un texto (para rutas /eventos/:slug, etc.). */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'item'
  )
}
