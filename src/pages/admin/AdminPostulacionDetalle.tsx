import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge, Button, EmptyState } from '../../components/ui'
import { useStore } from '../../data/store'
import type { ConvocatoriaField } from '../../data/types'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'
import { OpsDecisionSheet } from '../../features/admin/OpsDecisionSheet'
import { formatDateTime } from '../../features/admin/opsFormat'
import { APPLICATION_STATUS_META } from '../../features/admin/coreFormat'
import {
  applicationTabQuery,
  deriveApplicationFields,
  filterByApplicationTab,
  parseApplicationTab,
} from '../../features/admin/applicationFields'

const linkCls = 'text-[15px] text-ink underline decoration-line underline-offset-2 transition-colors hover:decoration-ink'

/**
 * Ficha completa de una postulación, en su propia ruta compartible con el equipo — antes era un
 * acordeón que expandía la card y desordenaba la posición en la lista al abrir/cerrar (revisar
 * cuarenta postulaciones así era incómodo). El tab activo de la lista viaja en `?tab=` para que
 * "Volver" y ↑ / ↓ se muevan dentro del MISMO subconjunto filtrado que se estaba mirando.
 */
export default function AdminPostulacionDetalle() {
  const { id = '' } = useParams()
  // key={id}: fuerza un remount COMPLETO de la ficha al cambiar de postulación. Sin esto, React
  // Router cambia el :id de la URL pero reutiliza la MISMA instancia (mismo tipo de elemento, misma
  // posición en el árbol) — el estado `decision` de acá abajo (panel de aceptar/rechazar abierto) y
  // el `note`/`skipEmail` de OpsDecisionSheet sobreviven al cambio de id. Es la tercera pata del
  // BLOQUEANTE 1 del review: junto con los dos guards del atajo de teclado, esto asegura que el
  // estado de UNA postulación nunca quede flotando sobre otra.
  return <AdminPostulacionDetalleFicha key={id} id={id} />
}

function AdminPostulacionDetalleFicha({ id }: { id: string }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tab = parseApplicationTab(searchParams.get('tab'))
  const backTo = `/admin/postulaciones${applicationTabQuery(tab)}`
  const [decision, setDecision] = useState<'aceptada' | 'rechazada' | null>(null)

  const applications = useStore((s) => s.getAdminApplications())
  const fallo = useStore((s) => s.applicationsFailed())
  const app = applications?.find((a) => a.id === id)
  const convocatoria = useStore((s) =>
    app ? s.getConvocatorias().find((c) => c.id === app.convocatoriaId) : undefined,
  )

  // Hermanas del MISMO subconjunto filtrado (el que se ve al volver), para ↑ / ↓.
  const siblings = applications ? filterByApplicationTab(applications, tab) : []
  const index = app ? siblings.findIndex((a) => a.id === app.id) : -1
  const prevId = index > 0 ? siblings[index - 1].id : undefined
  const nextId = index >= 0 && index < siblings.length - 1 ? siblings[index + 1].id : undefined

  useEffect(() => {
    if (index < 0) return
    const onKey = (e: KeyboardEvent) => {
      // Guard 1: con el panel de decisión abierto, ↑/↓ NO tiene que cambiar de postulación —
      // confirmar ahí manda un mail real e irreversible, y no puede terminar apuntando a otra
      // persona por una flecha de más.
      if (decision !== null) return
      // Guard 2: si el foco está escribiendo (la nota interna es un textarea; también cubre
      // inputs y cualquier contenteditable), ↓ es "bajar una línea", no "siguiente postulación".
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.key === 'ArrowUp' && prevId) {
        e.preventDefault() // si no, además de navegar, scrollea la página
        navigate(`/admin/postulaciones/${prevId}${applicationTabQuery(tab)}`)
      }
      if (e.key === 'ArrowDown' && nextId) {
        e.preventDefault()
        navigate(`/admin/postulaciones/${nextId}${applicationTabQuery(tab)}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, prevId, nextId, tab, navigate, decision])

  // null = todavía no hidrató o falló el fetch real (mismo criterio que AdminPostulaciones):
  // nunca cae al seed cuando SÍ hay backend, y "cargando" es un estado DISTINTO de "no existe".
  if (!applications) {
    return (
      <div className="px-5 py-8 md:px-10">
        <Link to={backTo} className="eyebrow inline-flex items-center gap-2 text-[9px] text-ink-soft hover:text-ink">
          <ArrowLeft size={12} strokeWidth={2} /> Postulaciones
        </Link>
        <p className="mt-8 text-sm text-ink-soft">
          {fallo
            ? 'No pudimos traer las postulaciones. No mostramos nada para no darte una ficha equivocada.'
            : 'Cargando…'}
        </p>
      </div>
    )
  }

  // Ya cargó, pero este id no está entre las postulaciones: puede haberse borrado o ser un link
  // viejo. Distinto del caso de arriba — ahí no sabíamos si existía, acá ya sabemos que no.
  if (!app) {
    return (
      <div className="px-5 py-8 md:px-10">
        <EmptyState
          title="Postulación no encontrada"
          action={
            <Link to={backTo} className="eyebrow inline-flex items-center gap-2 text-[10px] text-ink-soft hover:text-ink">
              <ArrowLeft size={12} strokeWidth={2} /> Volver a Postulaciones
            </Link>
          }
        >
          El ID no corresponde a ninguna postulación — puede que se haya eliminado.
        </EmptyState>
      </div>
    )
  }

  const fields: ConvocatoriaField[] = convocatoria?.fields ?? []
  const { title, story, email, telefono, rowKeys, labelOf } = deriveApplicationFields(app, fields)
  const meta = APPLICATION_STATUS_META[app.status]

  return (
    <div className="px-5 py-8 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to={backTo}
          className="eyebrow group inline-flex items-center gap-2 text-[9px] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft size={12} strokeWidth={2} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
          Postulaciones
        </Link>

        {/* index < 0: la postulación decidida desde ACÁ MISMO acaba de salir de este subconjunto
         *  filtrado (ej. se aceptó mirando "Preinscriptas") — mejor ocultar el contador/flechas
         *  que mostrar un "0 / N" inerte. */}
        {siblings.length > 1 && index >= 0 && (
          <div className="flex items-center gap-1">
            <button
              disabled={!prevId}
              onClick={() => prevId && navigate(`/admin/postulaciones/${prevId}${applicationTabQuery(tab)}`)}
              aria-label="Postulación anterior"
              className="rounded-sm p-2 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronUp size={16} strokeWidth={1.75} />
            </button>
            <span className="text-[11px] tabular-nums text-ink-soft">
              {index + 1} / {siblings.length}
            </span>
            <button
              disabled={!nextId}
              onClick={() => nextId && navigate(`/admin/postulaciones/${nextId}${applicationTabQuery(tab)}`)}
              aria-label="Postulación siguiente"
              className="rounded-sm p-2 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronDown size={16} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="type-serif text-3xl text-ink">{title}</h1>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      {story && (
        <blockquote className="mt-6 border-l-2 border-accent pl-4">
          <p className="type-serif text-lg leading-relaxed text-ink">{story}</p>
        </blockquote>
      )}

      <div className="mt-10 grid gap-x-10 gap-y-10 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="eyebrow text-[10px] text-ink-soft">Datos de la postulación</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-5 border-t border-line pt-5 sm:grid-cols-2">
            {email && (
              <div>
                <dt className="eyebrow text-[10px] text-ink-soft">Email</dt>
                <dd className="mt-1">
                  <a href={`mailto:${email}`} className={linkCls}>
                    {email}
                  </a>
                </dd>
              </div>
            )}
            {telefono && (
              <div>
                <dt className="eyebrow text-[10px] text-ink-soft">Teléfono</dt>
                <dd className="mt-1">
                  <a href={`tel:${telefono}`} className={linkCls}>
                    {telefono}
                  </a>
                </dd>
              </div>
            )}
            {rowKeys.map((key) => (
              <div key={key}>
                <dt className="eyebrow text-[10px] text-ink-soft">{labelOf(key)}</dt>
                <dd className="mt-1 break-words text-[15px] text-ink">{app.data[key] || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside className="space-y-8">
          <section className="border-t border-line pt-5">
            <h2 className="eyebrow text-[10px] text-ink-soft">Decisión</h2>
            {app.status === 'preinscripta' ? (
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                Todavía no fue decidida — está en la cola de revisión.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5 text-sm leading-relaxed">
                {/* Sin punto final fijo: formatDateTime (es-AR) puede terminar en "a. m."/"p. m.",
                 *  que YA trae su propio punto — uno fijo acá producía "a. m..". */}
                <p className="text-ink">
                  {app.status === 'aceptada' ? 'Aceptada' : 'Rechazada'}
                  {app.decidedAt ? ` el ${formatDateTime(app.decidedAt)}` : ''}
                  {app.decidedBy ? ` por ${app.decidedBy}` : ''}
                </p>
                {/* Los tres estados de la notificación se ven parecido y significan cosas
                 *  distintas: se avisó (con fecha), se intentó y falló (con motivo), o nunca se
                 *  intentó — y en este último caso NO inventamos por qué (puede ser que no haya
                 *  email, que sea una postulación de la demo, o que se haya elegido no avisar). */}
                {app.notifiedAt ? (
                  <p className="text-ink-soft">Se avisó a la persona el {formatDateTime(app.notifiedAt)}</p>
                ) : app.notifyError ? (
                  <p className="text-danger">No se pudo avisar: {app.notifyError}</p>
                ) : (
                  <p className="text-ink-soft/80">
                    No se avisó a la persona (sin más detalle disponible).
                  </p>
                )}
                {/* Nota interna del equipo al decidir — el server solo la manda en esta ruta
                 *  (forAdmin): el postulante NUNCA la ve, ni por acá ni por mail. Si nadie la
                 *  muestra, escribirla es un gesto vacío — por eso va junto al resto del
                 *  registro de la decisión. */}
                {app.decisionNote && (
                  <p className="text-ink-soft">
                    <span className="eyebrow text-[10px] text-ink-soft/70">Nota interna: </span>
                    {app.decisionNote}
                  </p>
                )}
              </div>
            )}
          </section>

          {app.status === 'preinscripta' && (
            <section className="flex gap-2.5">
              <OpsDangerButton className="flex-1 justify-center" onClick={() => setDecision('rechazada')}>
                Rechazar
              </OpsDangerButton>
              <Button className="flex-1 justify-center" onClick={() => setDecision('aceptada')}>
                Aceptar
              </Button>
            </section>
          )}
        </aside>
      </div>

      {decision && <OpsDecisionSheet app={app} status={decision} open onClose={() => setDecision(null)} />}
    </div>
  )
}
