import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge, Button, Card, toast } from '../../components/ui'
import type { BadgeTone } from '../../components/ui/Badge'
import { store } from '../../data/store'
import type { Application, ApplicationStatus } from '../../data/types'
import { OpsDangerButton } from './OpsDangerButton'
import { formatDateTime, relativeTime } from './opsFormat'

const STATUS_META: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  preinscripta: { label: 'Preinscripta', tone: 'accent' },
  aceptada: { label: 'Aceptada', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
}

/** Filas de la ficha = TODOS los campos del form real "Camino a CCM 2026" (PRD §10.3). */
const FICHA_ROWS: { key: string; label: string }[] = [
  { key: 'dni', label: 'DNI' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'acompanante', label: '¿Solo o con acompañante?' },
  { key: 'acompananteDatos', label: 'Acompañante' },
  { key: 'desfile', label: '¿Desfile previo?' },
  { key: 'extra', label: 'Algo más' },
]

/** Card de postulación: resumen + ficha completa expandible + decisión (PRD §10.4). */
export function OpsApplicationCard({ app }: { app: Application }) {
  const [open, setOpen] = useState(false)
  const meta = STATUS_META[app.status]

  const decide = (status: 'aceptada' | 'rechazada') => {
    store.decideApplication(app.id, status)
    toast(
      status === 'aceptada' ? '✓ Postulación aceptada' : 'Postulación rechazada',
      status === 'aceptada' ? 'success' : 'info',
    )
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="type-serif text-xl text-ink">{app.data.nombre ?? 'Sin nombre'}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-soft">{relativeTime(app.ts)}</span>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
      </div>

      {/* Historia: truncada de entrada, destacada en serif al expandir */}
      {open ? (
        <blockquote className="mt-4 border-l-2 border-accent pl-4">
          <p className="type-serif text-lg leading-relaxed text-ink">{app.data.historia ?? '—'}</p>
        </blockquote>
      ) : (
        <p className="mt-3 line-clamp-2 text-[15px] leading-relaxed text-ink-soft">
          {app.data.historia ?? '—'}
        </p>
      )}

      {open && (
        <dl className="mt-6 grid gap-x-8 gap-y-4 border-t border-line pt-5 sm:grid-cols-2">
          {FICHA_ROWS.map((row) => (
            <div key={row.key}>
              <dt className="eyebrow text-[10px] text-ink-soft">{row.label}</dt>
              <dd className="mt-1 break-words text-[15px] text-ink">{app.data[row.key] || '—'}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="eyebrow flex items-center gap-1.5 text-[10px] text-ink-soft transition-colors hover:text-ink"
        >
          {open ? 'Cerrar ficha' : 'Ver ficha completa'}
          <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>

        {app.status === 'preinscripta' ? (
          <div className="flex gap-2.5">
            <OpsDangerButton size="sm" onClick={() => decide('rechazada')}>
              Rechazar
            </OpsDangerButton>
            <Button size="sm" onClick={() => decide('aceptada')}>
              Aceptar
            </Button>
          </div>
        ) : (
          app.decidedAt && (
            <span className="text-xs text-ink-soft">Decidida el {formatDateTime(app.decidedAt)}</span>
          )
        )}
      </div>

      {app.status === 'preinscripta' && (
        <p className="mt-3 text-right text-[11px] leading-relaxed text-ink-soft/80">
          Al aceptar, en Fase 1 se dispara el mail de invitación + WhatsApp automático.
        </p>
      )}
    </Card>
  )
}
