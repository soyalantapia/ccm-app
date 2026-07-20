import type { AdSlot } from '../../data/types'
import { PRICE_PER_HOUR_BY_SLOT, priceForCampaign } from '../../lib/pricing'

/** Catálogo de espacios publicitarios autogestionables (PRD §11). */
export interface SlotMeta {
  slot: AdSlot
  name: string
  /** Dónde aparece, en lenguaje del anunciante. */
  where: string
  /** Precio por hora (demo, editable). */
  pricePerHour: number
  /** Impresiones estimadas por hora. */
  reachPerHour: number
  /** A dónde mandar al anunciante para ver su aviso en vivo. */
  liveAt: string
}

export const AD_SLOTS: SlotMeta[] = [
  { slot: 'S1', name: 'Splash de apertura', where: 'Pantalla completa al abrir la app', pricePerHour: PRICE_PER_HOUR_BY_SLOT.S1, reachPerHour: 420, liveAt: '/app' },
  { slot: 'S2', name: 'Feed nativo', where: 'Banner destacado en el inicio del público', pricePerHour: PRICE_PER_HOUR_BY_SLOT.S2, reachPerHour: 320, liveAt: '/app' },
  { slot: 'S3', name: 'Pre-descarga de foto', where: 'Antes de bajar cada foto del evento', pricePerHour: PRICE_PER_HOUR_BY_SLOT.S3, reachPerHour: 260, liveAt: '/fotos' },
  { slot: 'S6', name: 'Pantalla Mi QR', where: 'En el carnet de acceso de cada asistente', pricePerHour: PRICE_PER_HOUR_BY_SLOT.S6, reachPerHour: 180, liveAt: '/mi-qr' },
]

export interface Duration {
  label: string
  hours: number
}

export const DURATIONS: Duration[] = [
  { label: '1 hora', hours: 1 },
  { label: '5 horas', hours: 5 },
  { label: '1 jornada · 12 h', hours: 12 },
  { label: 'Todo el evento · 2 días', hours: 24 },
]

export function slotMeta(slot: AdSlot): SlotMeta {
  return AD_SLOTS.find((s) => s.slot === slot) ?? AD_SLOTS[1]
}

export function priceFor(slot: AdSlot, hours: number): number {
  return priceForCampaign(slot, hours)
}

export function reachFor(slot: AdSlot, hours: number): number {
  return slotMeta(slot).reachPerHour * hours
}
