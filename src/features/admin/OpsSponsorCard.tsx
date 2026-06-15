import { useState } from 'react'
import { FileText, Pencil, Trash2 } from 'lucide-react'
import { Badge, Button, Card } from '../../components/ui'
import type { BadgeTone } from '../../components/ui/Badge'
import type { Sponsor, SponsorCreative } from '../../data/types'
import { ctr } from './opsFormat'
import { SponsorReport } from './SponsorReport'

const LEVEL_TONE: Record<Sponsor['level'], BadgeTone> = {
  Principal: 'night',
  Oro: 'accent',
  Plata: 'outline',
}

/** Mini-preview visual de una creatividad según su slot (PRD §11). */
function CreativePreview({ creative }: { creative: SponsorCreative }) {
  if (creative.slot === 'S3') {
    return (
      <div className="overflow-hidden rounded-sm border-t-2 border-accent bg-night px-4 py-2.5">
        <div className="eyebrow text-[8px] text-night-ink/50">S3 · Pre-descarga de foto</div>
        <div className="type-serif mt-1 line-clamp-1 text-sm text-night-ink">{creative.headline}</div>
      </div>
    )
  }
  if (creative.slot === 'S6') {
    return (
      <div className="rounded-sm border border-line bg-bg px-4 py-2.5 text-center">
        <div className="eyebrow text-[8px] text-ink-soft/60">S6 · Pantalla Mi QR</div>
        <div className="eyebrow mt-1.5 line-clamp-1 text-[9px] text-ink-soft">{creative.headline}</div>
      </div>
    )
  }
  // S2 — banner nativo de feed
  return (
    <div className="relative overflow-hidden rounded-sm border border-line bg-bg">
      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
      <div className="py-2.5 pl-4 pr-3">
        <div className="eyebrow text-[8px] text-ink-soft/60">S2 · Feed nativo</div>
        <div className="type-serif mt-1 line-clamp-1 text-sm text-ink">{creative.headline}</div>
      </div>
    </div>
  )
}

interface OpsSponsorCardProps {
  sponsor: Sponsor
  impressions: number
  clicks: number
  onEdit?: () => void
  onDelete?: () => void
}

/** Card de sponsor con creatividades por slot y métricas de impacto (PRD §10.9). */
export function OpsSponsorCard({ sponsor, impressions, clicks, onEdit, onDelete }: OpsSponsorCardProps) {
  const [reportOpen, setReportOpen] = useState(false)
  return (
    <Card className="flex h-full flex-col p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="type-serif text-2xl text-ink">{sponsor.name}</h3>
          <p className="mt-1 text-xs text-ink-soft">{sponsor.industry}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Badge tone={LEVEL_TONE[sponsor.level]}>{sponsor.level}</Badge>
            {sponsor.exclusive && <Badge tone="accent">Exclusividad de rubro</Badge>}
          </div>
          {(onEdit || onDelete) && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  onClick={onEdit}
                  aria-label="Editar sponsor"
                  className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  <Pencil size={14} strokeWidth={1.75} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  aria-label="Eliminar sponsor"
                  className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {sponsor.creatives.map((creative, i) => (
          <CreativePreview key={`${creative.slot}-${i}`} creative={creative} />
        ))}
      </div>

      <dl className="mt-auto grid grid-cols-3 gap-4 border-t border-line pt-4 [&>div]:min-w-0">
        <div>
          <dd className="type-serif text-2xl text-ink">{impressions}</dd>
          <dt className="eyebrow mt-1 text-[9px] text-ink-soft">Impresiones</dt>
        </div>
        <div>
          <dd className="type-serif text-2xl text-ink">{clicks}</dd>
          <dt className="eyebrow mt-1 text-[9px] text-ink-soft">Clics</dt>
        </div>
        <div>
          <dd className="type-serif text-2xl text-accent">{ctr(impressions, clicks)}</dd>
          <dt className="eyebrow mt-1 text-[9px] text-ink-soft">CTR</dt>
        </div>
      </dl>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setReportOpen(true)}
        className="mt-4 w-full justify-center"
      >
        <FileText size={15} strokeWidth={1.75} />
        Generar reporte
      </Button>

      {reportOpen && <SponsorReport sponsor={sponsor} onClose={() => setReportOpen(false)} />}
    </Card>
  )
}
