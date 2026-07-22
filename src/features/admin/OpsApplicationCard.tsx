import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge, Button, Card } from '../../components/ui'
import { useStore } from '../../data/store'
import type { Application, ConvocatoriaField } from '../../data/types'
import { OpsDangerButton } from './OpsDangerButton'
import { OpsDecisionSheet } from './OpsDecisionSheet'
import { formatDateTime, relativeTime } from './opsFormat'
import { APPLICATION_STATUS_META } from './coreFormat'
import { applicationTabQuery, deriveApplicationFields, type ApplicationTab } from './applicationFields'

/** Card de postulación: resumen + link a la ficha completa (su propia ruta) + decisión.
 *  Se arma DINÁMICAMENTE con los campos de la convocatoria real — antes estaba clavada al
 *  form semilla, así que cualquier convocatoria creada por el organizador rendía "Sin nombre"
 *  + todo "—". Ahora deriva título, historia y filas de convocatoria.fields (o de app.data). */
export function OpsApplicationCard({ app, tab }: { app: Application; tab: ApplicationTab }) {
  const meta = APPLICATION_STATUS_META[app.status]
  const [decision, setDecision] = useState<'aceptada' | 'rechazada' | null>(null)

  const convocatoria = useStore((s) => s.getConvocatorias().find((c) => c.id === app.convocatoriaId))
  const fields: ConvocatoriaField[] = convocatoria?.fields ?? []
  const { title, story } = deriveApplicationFields(app, fields)

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="type-serif text-xl text-ink">{title}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-soft">{relativeTime(app.ts)}</span>
          {/* La lista ya las agrupa aparte bajo un rótulo; esto es un segundo aviso a nivel
           *  card, para que "Ejemplo" sea visible aunque se mire una card suelta. */}
          {app.fromSeed && <Badge tone="neutral">Ejemplo</Badge>}
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-[15px] leading-relaxed text-ink-soft">{story || '—'}</p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        <Link
          to={`/admin/postulaciones/${app.id}${applicationTabQuery(tab)}`}
          className="eyebrow flex items-center gap-1.5 text-[10px] text-ink-soft transition-colors hover:text-ink"
        >
          Ver ficha completa <ArrowRight size={13} aria-hidden />
        </Link>

        {app.status === 'preinscripta' ? (
          <div className="flex gap-2.5">
            <OpsDangerButton size="sm" onClick={() => setDecision('rechazada')}>
              Rechazar
            </OpsDangerButton>
            <Button size="sm" onClick={() => setDecision('aceptada')}>
              Aceptar
            </Button>
          </div>
        ) : (
          app.decidedAt && (
            <span className="text-xs text-ink-soft">Decidida el {formatDateTime(app.decidedAt)}</span>
          )
        )}
      </div>

      {decision && <OpsDecisionSheet app={app} status={decision} open onClose={() => setDecision(null)} />}
    </Card>
  )
}
