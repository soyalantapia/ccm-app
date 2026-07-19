import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge, Button, Card, toast } from '../../components/ui'
import type { BadgeTone } from '../../components/ui/Badge'
import { store, useStore } from '../../data/store'
import type { Application, ApplicationStatus, ConvocatoriaField } from '../../data/types'
import { OpsDangerButton } from './OpsDangerButton'
import { formatDateTime, relativeTime } from './opsFormat'

const STATUS_META: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  preinscripta: { label: 'Preinscripta', tone: 'accent' },
  aceptada: { label: 'Aceptada', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
}

/** Humaniza una key sin label (ej. "acompananteDatos" → "Acompañante datos"). */
function humanize(key: string): string {
  const s = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Card de postulación: resumen + ficha completa expandible + decisión.
 *  Se arma DINÁMICAMENTE con los campos de la convocatoria real — antes estaba clavada al
 *  form semilla, así que cualquier convocatoria creada por el organizador rendía "Sin nombre"
 *  + todo "—". Ahora deriva título, historia y filas de convocatoria.fields (o de app.data). */
export function OpsApplicationCard({ app }: { app: Application }) {
  const [open, setOpen] = useState(false)
  const meta = STATUS_META[app.status]

  const convocatoria = useStore((s) => s.getConvocatorias().find((c) => c.id === app.convocatoriaId))
  const fields: ConvocatoriaField[] = convocatoria?.fields ?? []
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? humanize(key)

  // Título: un campo tipo nombre; historia: un textarea largo. Con fallback a las keys de app.data.
  const nameKey = ['nombre', 'name', 'firstName'].find((k) => app.data[k]) ??
    fields.find((f) => /nombre|name/i.test(f.key))?.key
  const storyKey = ['historia', 'bio', 'mensaje', 'story'].find((k) => app.data[k]) ??
    fields.find((f) => f.type === 'textarea')?.key
  const title = (nameKey && app.data[nameKey]) || 'Postulación'
  const story = (storyKey && app.data[storyKey]) || ''
  const rowKeys = Object.keys(app.data).filter((k) => k !== nameKey && k !== storyKey)

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
        <h3 className="type-serif text-xl text-ink">{title}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-soft">{relativeTime(app.ts)}</span>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
      </div>

      {/* Historia: truncada de entrada, destacada en serif al expandir */}
      {open ? (
        <blockquote className="mt-4 border-l-2 border-accent pl-4">
          <p className="type-serif text-lg leading-relaxed text-ink">{story || '—'}</p>
        </blockquote>
      ) : (
        <p className="mt-3 line-clamp-2 text-[15px] leading-relaxed text-ink-soft">{story || '—'}</p>
      )}

      {open && rowKeys.length > 0 && (
        <dl className="mt-6 grid gap-x-8 gap-y-4 border-t border-line pt-5 sm:grid-cols-2">
          {rowKeys.map((key) => (
            <div key={key}>
              <dt className="eyebrow text-[10px] text-ink-soft">{labelOf(key)}</dt>
              <dd className="mt-1 break-words text-[15px] text-ink">{app.data[key] || '—'}</dd>
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
