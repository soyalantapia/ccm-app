import type { Sponsor } from '../../data/types'

/**
 * Los sponsors del seed no traen `slug` propio: derivamos uno estable y
 * legible a partir del nombre para resolver el QR del stand (`/stand/:slug`).
 * Honesto y sin marcas reales — el slug es solo el nombre normalizado.
 */
export function sponsorSlug(sponsor: Sponsor): string {
  return sponsor.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca acentos (marcas diacríticas)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Encuentra el sponsor cuyo slug derivado coincide con el de la URL. */
export function findSponsorBySlug<T extends Sponsor>(sponsors: T[], slug: string): T | undefined {
  const target = slug.toLowerCase()
  return sponsors.find((s) => sponsorSlug(s) === target)
}

/**
 * Monograma tipográfico (sin logos reales): iniciales de las primeras dos
 * palabras del nombre, o las dos primeras letras si es una sola palabra.
 */
export function sponsorMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
