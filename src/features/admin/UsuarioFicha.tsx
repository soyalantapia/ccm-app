import { Badge, Sheet } from '../../components/ui'
import { usePerson } from '../../data/queries'
import { RegalarEntradas } from './RegalarEntradas'
import {
  campoLabel,
  formatDateTime,
  formatMoney,
  formatRelative,
  sourceLabel,
  APPLICATION_STATUS_META,
  ORDER_STATUS_META,
} from './coreFormat'
import type { OrderStatus } from '../../data/types'

interface Props {
  personId: string | null
  onClose: () => void
}

/**
 * Ficha completa en panel lateral (no página nueva): así no se pierden los filtros ni la
 * posición en la lista al volver.
 */
export function UsuarioFicha({ personId, onClose }: Props) {
  const { data, isLoading, isError, error } = usePerson(personId)

  return (
    <Sheet open={personId !== null} onClose={onClose} title={data?.nombre ?? 'Ficha'} size="lg">
      {isLoading && <p className="py-8 text-center text-sm text-ink-soft">Cargando…</p>}

      {isError && (
        <p className="py-8 text-center text-sm text-danger">
          No se pudo cargar la ficha: {(error as Error).message}
        </p>
      )}

      {data && (
        <div className="space-y-7">
          <div className="flex flex-wrap gap-1.5">
            {data.esSocio && <Badge tone="accent">Socio</Badge>}
            {data.inscripciones > 0 && (
              <Badge tone="success">
                {data.inscripciones} {data.inscripciones === 1 ? 'inscripción' : 'inscripciones'}
              </Badge>
            )}
            {data.postulaciones > 0 && (
              <Badge tone="neutral">
                {data.postulaciones} {data.postulaciones === 1 ? 'postulación' : 'postulaciones'}
              </Badge>
            )}
          </div>

          <section>
            <p className="eyebrow text-[9px] text-ink-soft">Datos, y de dónde salió cada uno</p>
            {data.campos.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">Todavía no dejó ningún dato.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {data.campos.map((c, i) => (
                  <li key={`${c.key}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-[13px] text-ink-soft">
                      {campoLabel(c.key)}
                    </span>
                    <span className="text-[13px] text-ink">{c.value}</span>
                    <span className="w-full text-[11px] text-ink-soft/70">
                      {sourceLabel(c.source)} · {formatDateTime(c.capturedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="eyebrow text-[9px] text-ink-soft">Consentimientos</p>
            <ul className="mt-3 space-y-2">
              {([['terms', 'Términos y condiciones'], ['news', 'Novedades por email'], ['sponsors', 'Compartir datos con sponsors']] as const).map(
                ([k, label]) => (
                  <li key={k} className="flex items-baseline justify-between gap-4">
                    <span className="text-[13px] text-ink">{label}</span>
                    <span className="text-[11px] text-ink-soft">
                      {data.consentimientos[k] ? formatDateTime(data.consentimientos[k]!) : 'Sin otorgar'}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </section>

          <section>
            <p className="eyebrow text-[9px] text-ink-soft">Entradas y pagos</p>
            {data.ordenesDetalle.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">Todavía no compró entradas.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.ordenesDetalle.map((o) => (
                  <li key={o.id} className="rounded-sm border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="text-[13px] text-ink">
                        {o.planTitle}
                        {o.qty > 1 && <span className="text-ink-soft"> × {o.qty}</span>}
                      </span>
                      <Badge tone={ORDER_STATUS_META[o.status as OrderStatus]?.tone ?? 'neutral'}>
                        {ORDER_STATUS_META[o.status as OrderStatus]?.label ?? o.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-soft">
                      {formatMoney(o.total)} · {formatDateTime(o.ts)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {personId && <RegalarEntradas personId={personId} />}

          {data.postulacionesDetalle.length > 0 && (
            <section>
              <p className="eyebrow text-[9px] text-ink-soft">Postulaciones</p>
              <ul className="mt-3 space-y-3">
                {data.postulacionesDetalle.map((a) => (
                  <li key={a.id} className="rounded-sm border border-line p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] text-ink">{a.convocatoriaTitle ?? a.convocatoriaId}</span>
                      <Badge tone={APPLICATION_STATUS_META[a.status as keyof typeof APPLICATION_STATUS_META]?.tone ?? 'neutral'}>
                        {APPLICATION_STATUS_META[a.status as keyof typeof APPLICATION_STATUS_META]?.label ?? a.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-soft">{formatDateTime(a.ts)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.actividad.length > 0 && (
            <section>
              <p className="eyebrow text-[9px] text-ink-soft">Actividad</p>
              <ul className="mt-3 space-y-1.5">
                {data.actividad.slice(0, 25).map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 text-[12px]">
                    <span className="text-ink">{a.type}</span>
                    <span className="text-ink-soft">{formatRelative(a.ts)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  )
}
