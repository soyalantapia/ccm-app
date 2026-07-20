import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Download, Printer, X } from 'lucide-react'
import { Button } from '../../components/ui'
import { config } from '../../config'
import { store, useDataVersion } from '../../data/store'
import { useFocusTrap } from '../../lib/useFocusTrap'
import type { AdSlot, Sponsor } from '../../data/types'
import { ctr, formatDate } from './opsFormat'
import { bloquearScroll } from '../../lib/useFocusTrap'
import { csvCell } from '../../lib/csv'

/** Slots con un nombre legible para el desglose del reporte (PRD §11). */
const SLOT_LABELS: Record<AdSlot, string> = {
  S1: 'S1 · Bienvenida (splash)',
  S2: 'S2 · Feed nativo',
  S3: 'S3 · Pre-descarga de foto',
  S4: 'S4 · Video patrocinado',
  S6: 'S6 · Pantalla Mi QR',
}
const SLOT_ORDER: AdSlot[] = ['S1', 'S2', 'S3', 'S4', 'S6']

interface SlotRow {
  slot: AdSlot
  impressions: number
  clicks: number
}

interface ReportMetrics {
  impressions: number
  clicks: number
  reach: number
  downloads: number
  slots: SlotRow[]
  galleryTitles: string[]
}

/** Calcula las métricas reales del sponsor desde el log de analytics (PRD §13). */
function useSponsorMetrics(sponsorId: string): ReportMetrics {
  const v = useDataVersion() // recomputar si el analytics del backend hidrata mientras el reporte está abierto
  return useMemo(() => {
    const analytics = store.getAnalytics()
    const galleries = store.getGalleries()

    const slotMap = new Map<AdSlot, SlotRow>()
    const reachDevices = new Set<string>()
    let impressions = 0
    let clicks = 0
    let downloads = 0

    for (const ev of analytics) {
      const p = ev.payload
      if (!p || p.sponsorId !== sponsorId) continue
      const slot = typeof p.slot === 'string' ? (p.slot as AdSlot) : undefined

      if (ev.event === 'ad_impression') {
        impressions += 1
        if (ev.deviceId) reachDevices.add(ev.deviceId)
        if (slot) {
          const row = slotMap.get(slot) ?? { slot, impressions: 0, clicks: 0 }
          row.impressions += 1
          slotMap.set(slot, row)
        }
      } else if (ev.event === 'ad_click') {
        clicks += 1
        if (slot) {
          const row = slotMap.get(slot) ?? { slot, impressions: 0, clicks: 0 }
          row.clicks += 1
          slotMap.set(slot, row)
        }
      } else if (ev.event === 'photo_download') {
        downloads += 1
      }
    }

    const slots = SLOT_ORDER.filter((s) => slotMap.has(s)).map((s) => slotMap.get(s)!)
    const galleryTitles = galleries.filter((g) => g.sponsorId === sponsorId).map((g) => g.title)

    return { impressions, clicks, reach: reachDevices.size, downloads, slots, galleryTitles }
  }, [sponsorId, v])
}

/** Período del evento principal, p. ej. "19 y 20 de septiembre de 2026". */
function eventPeriod(): string {
  const principal = store.getEvents().find((e) => e.type === 'principal')
  if (!principal) return `CCM ${config.year}`
  const year = new Date(principal.startDate).getFullYear() || config.year
  return `${principal.dateLabel} de ${year}`
}

/** Nombre de archivo seguro a partir del nombre del sponsor. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Arma y descarga un CSV real (por slot + totales) como blob. */
function downloadCsv(sponsor: Sponsor, metrics: ReportMetrics, period: string): void {
  const esc = csvCell // helper compartido: neutraliza prefijos de fórmula, no solo RFC4180
  const lines: string[] = []
  lines.push(`Reporte Tecnico de Impacto;CCM ${config.year}`)
  lines.push(`Sponsor;${esc(sponsor.name)}`)
  lines.push(`Nivel;${esc(sponsor.level)}`)
  lines.push(`Rubro;${esc(sponsor.industry)}`)
  lines.push(`Exclusividad de rubro;${sponsor.exclusive ? 'Si' : 'No'}`)
  lines.push(`Periodo;${esc(period)}`)
  lines.push('')
  lines.push('Slot;Impresiones;Clics;CTR')
  for (const row of metrics.slots) {
    lines.push(
      `${esc(SLOT_LABELS[row.slot])};${row.impressions};${row.clicks};${esc(ctr(row.impressions, row.clicks))}`,
    )
  }
  lines.push('')
  lines.push(`Total impresiones;${metrics.impressions}`)
  lines.push(`Total clics;${metrics.clicks}`)
  lines.push(`CTR global;${esc(ctr(metrics.impressions, metrics.clicks))}`)
  lines.push(`Alcance estimado (dispositivos unicos);${metrics.reach}`)
  lines.push(`Descargas bajo su banner;${metrics.downloads}`)

  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sponsor-${slugify(sponsor.name)}-ccm${config.year}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface SponsorReportProps {
  sponsor: Sponsor
  onClose: () => void
}

/** Métrica grande en el cuerpo del documento. */
function Figure({ value, label, accent }: { value: string | number; label: string; accent?: boolean }) {
  return (
    <div className="rounded-sm border border-line/70 px-4 py-3">
      <div className={`type-serif text-3xl ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
      <div className="eyebrow mt-1 text-[9px] text-ink-soft">{label}</div>
    </div>
  )
}

/**
 * Reporte Técnico de Impacto por sponsor (PRD §10.9) — entregable de 1 página
 * con cara de documento, exportable a CSV y a PDF (vía impresión).
 */
export function SponsorReport({ sponsor, onClose }: SponsorReportProps) {
  const metrics = useSponsorMetrics(sponsor.id)
  const period = useMemo(eventPeriod, [])
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    store.track('sponsor_report_generated', { sponsorId: sponsor.id })
  }, [sponsor.id])

  // Bloquea el scroll del fondo mientras el reporte está abierto.
  useEffect(() => {
    return bloquearScroll() // conteo compartido: un diálogo encima no desbloquea a este
  }, [])

  // Foco atrapado + Escape para cerrar + restitución del foco al botón que abrió.
  useFocusTrap(true, overlayRef, onClose)

  return createPortal(
    <>
      {/* Reglas de impresión: oculta TODO menos el documento (#sponsor-report-doc). */}
      <style media="print">{`
        body * { visibility: hidden !important; }
        #sponsor-report-doc, #sponsor-report-doc * { visibility: visible !important; }
        #sponsor-report-doc {
          position: absolute !important;
          inset: 0 !important;
          margin: 0 !important;
          max-width: none !important;
          width: 100% !important;
          box-shadow: none !important;
          border: 0 !important;
          border-radius: 0 !important;
        }
        .sponsor-report-noprint { display: none !important; }
        @page { margin: 14mm; }
      `}</style>

      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-night/60 p-4 backdrop-blur-[2px] sm:p-8"
      >
        <button
          onClick={onClose}
          autoFocus
          aria-label="Cerrar reporte"
          className="sponsor-report-noprint absolute right-4 top-4 z-10 rounded-sm p-2.5 text-night-ink/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={22} strokeWidth={1.5} />
        </button>

        {/* DOCUMENTO — papel marfil */}
        <div
          id="sponsor-report-doc"
          role="dialog"
          aria-modal="true"
          aria-label={`Reporte de impacto de ${sponsor.name}`}
          className="w-full max-w-2xl animate-rise rounded-lg border border-line bg-bg p-7 shadow-2xl sm:p-10"
        >
          {/* Encabezado con marca + dorado */}
          <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b-2 border-accent pb-5">
            <div>
              <div className="eyebrow text-accent-strong">{config.appName}</div>
              <h2 className="type-display mt-2 text-[clamp(1.6rem,5vw,2.4rem)] leading-none text-ink">
                Reporte de Impacto
              </h2>
              <p className="mt-2 text-xs text-ink-soft">Período del evento · {period}</p>
            </div>
            <div className="text-right">
              <div className="type-serif text-xl text-ink">{sponsor.name}</div>
              <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                <span className="rounded-sm border border-line px-2 py-0.5 text-[10px] text-ink-soft">
                  {sponsor.level}
                </span>
                {sponsor.exclusive && (
                  <span className="rounded-sm bg-accent px-2 py-0.5 text-[10px] text-accent-ink">
                    Exclusividad de rubro
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-xs text-ink-soft">{sponsor.industry}</div>
            </div>
          </header>

          {/* Totales */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure value={metrics.impressions.toLocaleString('es-AR')} label="Impresiones" />
            <Figure value={metrics.clicks.toLocaleString('es-AR')} label="Clics" />
            <Figure value={ctr(metrics.impressions, metrics.clicks)} label="CTR" accent />
            <Figure value={metrics.reach.toLocaleString('es-AR')} label="Alcance estimado" />
          </section>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-soft/80">
            <em className="text-accent-strong">Alcance estimado</em> = dispositivos únicos que vieron al menos
            una pieza del sponsor (impresiones únicas por <em className="text-accent-strong">deviceId</em>).
          </p>

          {/* Desglose por slot */}
          <section className="mt-7">
            <div className="eyebrow text-ink-soft">Desglose por espacio</div>
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="eyebrow py-2 text-[9px] font-normal text-ink-soft">Espacio</th>
                  <th className="eyebrow py-2 text-right text-[9px] font-normal text-ink-soft">Impr.</th>
                  <th className="eyebrow py-2 text-right text-[9px] font-normal text-ink-soft">Clics</th>
                  <th className="eyebrow py-2 text-right text-[9px] font-normal text-ink-soft">CTR</th>
                </tr>
              </thead>
              <tbody>
                {metrics.slots.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-xs text-ink-soft">
                      Sin impresiones registradas en este período.
                    </td>
                  </tr>
                ) : (
                  metrics.slots.map((row) => (
                    <tr key={row.slot} className="border-b border-line/60">
                      <td className="py-2.5 text-ink">{SLOT_LABELS[row.slot]}</td>
                      <td className="py-2.5 text-right text-ink">
                        {row.impressions.toLocaleString('es-AR')}
                      </td>
                      <td className="py-2.5 text-right text-ink">
                        {row.clicks.toLocaleString('es-AR')}
                      </td>
                      <td className="py-2.5 text-right text-accent-strong">{ctr(row.impressions, row.clicks)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* Descargas bajo su banner (si es sponsor de una galería) */}
          {metrics.galleryTitles.length > 0 && (
            <section className="mt-6 rounded-sm border border-line/70 bg-surface px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <div className="eyebrow text-[9px] text-ink-soft">Descargas bajo su banner</div>
                <div className="type-serif text-2xl text-ink">
                  {metrics.downloads.toLocaleString('es-AR')}
                </div>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft/80">
                Fotos descargadas con el banner del sponsor en {metrics.galleryTitles.join(' · ')}.
              </p>
            </section>
          )}

          {/* Cierre con la frase del deck */}
          <footer className="mt-8 border-t border-line pt-4">
            <p className="eyebrow text-accent-strong">Reporte Técnico de Impacto · CCM {config.year}</p>
            <p className="mt-2 text-[11px] text-ink-soft/80">
              Datos propios, medidos en la plataforma · Generado el {formatDate(new Date().toISOString())}.
            </p>
          </footer>
        </div>

        {/* Acciones (no se imprimen) */}
        <div className="sponsor-report-noprint mt-5 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => downloadCsv(sponsor, metrics, period)}
            className="justify-center"
          >
            <Download size={16} strokeWidth={1.75} />
            Descargar CSV
          </Button>
          <Button onClick={() => window.print()} className="justify-center">
            <Printer size={16} strokeWidth={1.75} />
            Imprimir / Guardar PDF
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}
