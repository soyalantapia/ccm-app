import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  Crown,
  Download,
  Eye,
  Heart,
  Inbox,
  Megaphone,
  MousePointerClick,
  PenLine,
  Play,
  ScanLine,
  Sparkles,
  Store,
  Ticket,
  UserPlus,
} from 'lucide-react'
import type { AnalyticsEvent, PlanId, ProfileFieldKey } from '../../data/types'
import type { DataStore } from '../../data/store'
import { PROFILE_FIELD_LABELS, formatMoney } from './coreFormat'
import { csvCell } from '../../lib/csv'

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/** Resuelve el nombre legible del contexto de una inscripción (bloque > evento). */
function registrationContext(payload: Record<string, unknown>, s: DataStore): string {
  const blockId = str(payload.blockId)
  if (blockId) {
    const block = s.getBlock(blockId)
    if (block) return block.title
  }
  const eventId = str(payload.eventId)
  if (eventId) {
    const event = s.getEventById(eventId)
    if (event) return event.title
  }
  return 'Evento'
}

function planName(payload: Record<string, unknown>, s: DataStore): string {
  const planId = str(payload.planId)
  const plan = planId ? s.getPlan(planId as PlanId) : undefined
  return plan?.name ?? 'Entrada'
}

function sponsorName(payload: Record<string, unknown>, s: DataStore): string {
  const sponsorId = str(payload.sponsorId)
  const sponsor = sponsorId ? s.getSponsor(sponsorId) : undefined
  return sponsor?.name ?? 'Sponsor'
}

/**
 * Humaniza un evento de analytics (PRD §13) para la actividad en vivo
 * del dashboard: ícono + label en español con contexto resuelto del seed.
 */
export function describeAnalyticsEvent(
  e: AnalyticsEvent,
  s: DataStore,
): { icon: LucideIcon; label: string } {
  const p = e.payload ?? {}
  switch (e.event) {
    case 'user_created':
      return { icon: UserPlus, label: 'Nuevo dispositivo registrado' }
    case 'profile_field_captured': {
      const field = str(p.field) as ProfileFieldKey | undefined
      const label = field ? (PROFILE_FIELD_LABELS[field] ?? field) : 'dato'
      return { icon: PenLine, label: `Dato capturado · ${label}` }
    }
    case 'registration_created':
      return { icon: CalendarCheck, label: `Nueva inscripción · ${registrationContext(p, s)}` }
    case 'registration_cancelled':
      return { icon: CalendarX, label: `Inscripción cancelada · ${registrationContext(p, s)}` }
    case 'event_view': {
      const event = str(p.eventId) ? s.getEventById(str(p.eventId)!) : undefined
      return { icon: CalendarDays, label: `Evento visto · ${event?.title ?? 'Evento'}` }
    }
    case 'block_view': {
      const block = str(p.blockId) ? s.getBlock(str(p.blockId)!) : undefined
      return { icon: CalendarDays, label: `Bloque visto · ${block?.title ?? 'Bloque'}` }
    }
    case 'ticket_order_created':
      return { icon: Ticket, label: `Orden ${planName(p, s)} iniciada` }
    case 'ticket_order_redirected_mp':
      return { icon: Ticket, label: `Orden ${planName(p, s)} redirigida a Mercado Pago` }
    case 'ticket_order_confirmed':
      return { icon: Ticket, label: `Orden ${planName(p, s)} confirmada` }
    case 'photo_view':
      return { icon: Eye, label: 'Foto vista en galería' }
    case 'photo_download':
      return { icon: Download, label: 'Foto descargada' }
    case 'photo_favorite':
      return { icon: Heart, label: 'Foto guardada en favoritas' }
    case 'ad_impression':
      return { icon: Megaphone, label: `Impresión publicitaria · ${sponsorName(p, s)}` }
    case 'ad_click':
      return { icon: MousePointerClick, label: `Clic en publicidad · ${sponsorName(p, s)}` }
    case 'video_play':
      return { icon: Play, label: 'Video reproducido' }
    case 'content_view':
      return { icon: Play, label: 'Contenido visto' }
    case 'membership_purchased': {
      const total = typeof p.total === 'number' ? p.total : 0
      return { icon: Crown, label: `Nuevo Socio CCM · ${formatMoney(total)}` }
    }
    case 'application_submitted':
      return { icon: Inbox, label: 'Nueva postulación · Camino a CCM 2026' }
    case 'application_accepted':
      return { icon: Inbox, label: 'Postulación aceptada' }
    case 'application_rejected':
      return { icon: Inbox, label: 'Postulación rechazada' }
    case 'profile_view':
      return { icon: Eye, label: 'Perfil del catálogo visto' }
    case 'stand_lead_captured':
      return { icon: ScanLine, label: `Lead captado en stand · ${sponsorName(p, s)}` }
    case 'stand_view':
      return { icon: Eye, label: `Stand visitado · ${sponsorName(p, s)}` }
    case 'sponsor_lead':
      return { icon: Store, label: 'Consulta comercial de sponsor' }
    case 'calendar_export':
      return { icon: CalendarPlus, label: 'Evento agregado al calendario' }
    case 'onboarding_completed':
      return { icon: Sparkles, label: 'Onboarding completado' }
    default: {
      const pretty = e.event.replace(/_/g, ' ')
      return { icon: Activity, label: pretty.charAt(0).toUpperCase() + pretty.slice(1) }
    }
  }
}

/* ─── Export CSV (PRD §10.1) ───────────────────────────────────────── */

/** Genera el CSV de analytics en memoria y dispara la descarga (blob). */
export function downloadAnalyticsCsv(events: AnalyticsEvent[]): void {
  const header = ['id', 'event', 'ts', 'device_id', 'origin', 'payload']
  const rows = events.map((e) =>
    [
      e.id,
      e.event,
      e.ts,
      e.deviceId ?? '',
      e.seed ? 'seed' : 'demo',
      e.payload ? JSON.stringify(e.payload) : '',
    ]
      .map(csvCell)
      .join(','),
  )
  const csv = '\uFEFF' + [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ccm-analytics-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
