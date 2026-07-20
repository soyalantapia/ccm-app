import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button, Stat } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { CorePanel } from '../../features/admin/CorePanel'
import { CoreOccupancyBar } from '../../features/admin/CoreOccupancyBar'
import { formatMoney } from '../../features/admin/coreFormat'
import type { AdminStats } from '../../data/types'

/**
 * Dashboard del organizador.
 *
 * Los números salen de GET /admin/stats, o sea de COUNT sobre las tablas de negocio.
 * La versión anterior contaba eventos de analytics en el navegador, sobre una lista
 * truncada a 500 filas: mostraba ~1200 registrados fabricados por el seed, o 0 cuando
 * el evento nunca llegaba al backend (medido en server/scripts/audit-metricas).
 *
 * Acá no hay fallback al seed: si no hay dato, se dice. Un número inventado presentado
 * como real es peor que un estado vacío, porque nadie lo puede notar.
 */

/** "hace 2 min" — para que se note si la pestaña quedó abierta. */
function haceCuanto(iso: string): string {
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seg < 60) return 'recién'
  const min = Math.round(seg / 60)
  if (min < 60) return `hace ${min} min`
  const hs = Math.round(min / 60)
  return hs < 24 ? `hace ${hs} h` : `hace ${Math.round(hs / 24)} d`
}

const plural = (n: number, sing: string, plu: string) => (n === 1 ? sing : plu)

/** Fila de una lista accionable: un dato, un contexto y a dónde ir a resolverlo. */
function FilaAccion({ titulo, detalle, tono }: { titulo: string; detalle: string; tono?: 'urgente' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
      <p className="type-serif min-w-0 truncate text-[15px] text-ink">{titulo}</p>
      <p className={`shrink-0 text-[12px] tabular-nums ${tono === 'urgente' ? 'text-danger' : 'text-ink-soft'}`}>
        {detalle}
      </p>
    </div>
  )
}

/** "Todo al día" es una buena noticia, no un error ni una lista vacía. */
function TodoAlDia({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2 py-3 text-sm text-ink-soft">
      <CheckCircle2 size={15} className="shrink-0 text-success" aria-hidden />
      {children}
    </p>
  )
}

function VerTodo({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="eyebrow mt-3 inline-flex items-center gap-1.5 text-[9px] text-accent-strong transition-colors hover:text-ink"
    >
      {children} <ArrowRight size={12} strokeWidth={2} aria-hidden />
    </Link>
  )
}

export default function Dashboard() {
  const stats = useStore((s) => s.getAdminStats())
  const [intentado, setIntentado] = useState(false)

  // Al MONTAR se piden métricas frescas. El store hidrata una sola vez al arrancar la
  // app, así que sin esto entrar al Dashboard desde otra pantalla mostraba datos viejos.
  useEffect(() => {
    store.refetchAdminStats()
    setIntentado(true)
  }, [])

  const fallo = useStore((s) => s.statsFailed()) && intentado && !stats

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Dashboard"
        lead={
          stats
            ? `Calculado sobre la base de datos · actualizado ${haceCuanto(stats.generatedAt)}`
            : 'Métricas calculadas sobre la base de datos'
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => store.refetchAdminStats()}>
            <RefreshCw size={13} strokeWidth={2} /> Actualizar
          </Button>
        }
      />

      {!stats ? (
        <EstadoSinDatos fallo={fallo} />
      ) : (
        <Contenido stats={stats} />
      )}
    </div>
  )
}

/** Tres estados que se ven parecido y significan cosas opuestas: se distinguen. */
function EstadoSinDatos({ fallo }: { fallo: boolean }) {
  if (fallo) {
    return (
      <div className="mt-10 flex items-start gap-3 rounded-md border border-danger/30 bg-danger/5 p-5">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <div>
          <p className="type-serif text-base text-ink">No pudimos traer las métricas</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            El backend no respondió. No mostramos números para no darte un dato equivocado.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => store.refetchAdminStats()}>
            <RefreshCw size={13} strokeWidth={2} /> Reintentar
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-10 space-y-8" aria-busy="true">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="border-t border-line pt-5">
            <div className="h-10 w-20 animate-pulse rounded-sm bg-ink/5" />
            <div className="mt-2.5 h-2.5 w-16 animate-pulse rounded-sm bg-ink/5" />
          </div>
        ))}
      </div>
      <p className="text-sm text-ink-soft">Calculando métricas…</p>
    </div>
  )
}

function Contenido({ stats }: { stats: AdminStats }) {
  const { kpis, postulacionesPendientes: pend, plataTrabada: trabada, bloquesFlojos, convocatoriasPorCerrar } = stats

  const cifras = [
    { label: 'Registrados', value: kpis.registrados },
    { label: 'Inscripciones', value: kpis.inscripciones },
    { label: 'Socios CCM', value: kpis.socios },
    { label: 'Ingreso socios', value: formatMoney(kpis.ingresoSocios) },
    { label: 'Órdenes cobradas', value: kpis.ordenesConfirmadas },
    { label: 'Postulaciones', value: kpis.postulaciones },
  ]

  return (
    <>
      <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-6">
        {cifras.map((c) => (
          <div key={c.label} className="border-t border-line pt-5">
            <Stat value={c.value} label={c.label} />
          </div>
        ))}
      </div>

      {/* Lo accionable primero: cada bloque termina en un lugar donde resolverlo. */}
      <div className="mt-12 grid gap-x-10 gap-y-10 lg:grid-cols-2">
        <CorePanel
          title="Postulaciones sin responder"
          note={
            pend.masAntiguaDias != null
              ? `La más antigua espera hace ${pend.masAntiguaDias} ${plural(pend.masAntiguaDias, 'día', 'días')}`
              : 'Nadie esperando respuesta'
          }
        >
          {pend.total === 0 ? (
            <TodoAlDia>Todas las postulaciones están respondidas.</TodoAlDia>
          ) : (
            <>
              <p className="type-display mb-3 text-3xl text-ink">{pend.total}</p>
              {pend.items.map((a) => (
                <FilaAccion
                  key={a.id}
                  titulo={a.convocatoriaTitulo}
                  detalle={`espera hace ${a.diasEsperando} ${plural(a.diasEsperando, 'día', 'días')}`}
                  tono={a.diasEsperando >= 7 ? 'urgente' : undefined}
                />
              ))}
              <VerTodo to="/admin/postulaciones">Responder postulaciones</VerTodo>
            </>
          )}
        </CorePanel>

        <CorePanel title="Plata trabada" note="Compras que arrancaron y no se cobraron">
          {trabada.cantidad === 0 ? (
            <TodoAlDia>No hay compras a medio camino.</TodoAlDia>
          ) : (
            <>
              <p className="type-display mb-1 text-3xl text-accent">{formatMoney(trabada.montoTotal)}</p>
              <p className="mb-3 text-[12px] text-ink-soft">
                en {trabada.cantidad} {plural(trabada.cantidad, 'orden', 'órdenes')} sin confirmar
              </p>
              {trabada.porEstado.map((g) => (
                <FilaAccion
                  key={g.status}
                  titulo={g.status === 'iniciada' ? 'Iniciada, no llegó a pagar' : 'Fue a Mercado Pago, no volvió'}
                  detalle={`${g.cantidad} · ${formatMoney(g.monto)}`}
                />
              ))}
              <VerTodo to="/admin/ordenes">Ver órdenes</VerTodo>
            </>
          )}
        </CorePanel>

        <CorePanel title="Bloques que no se llenan" note="De los eventos que todavía no pasaron">
          {bloquesFlojos.items.length === 0 ? (
            <TodoAlDia>No hay bloques futuros con cupo disponible.</TodoAlDia>
          ) : (
            <div className="space-y-5">
              {bloquesFlojos.items.map((b) => (
                <div key={b.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <p className="type-serif min-w-0 truncate text-[15px] text-ink">{b.titulo}</p>
                    <p className="eyebrow shrink-0 text-[9px] text-ink-soft/70">
                      {b.eventoTitulo} · {b.dia}
                    </p>
                  </div>
                  <CoreOccupancyBar className="mt-2" taken={b.taken} capacity={b.capacity} />
                  <p className="mt-1.5 text-[12px] text-ink-soft">
                    faltan {b.faltan} de {b.capacity} lugares
                  </p>
                </div>
              ))}
            </div>
          )}
        </CorePanel>

        <CorePanel title="Convocatorias por cerrar" note="Cierran dentro de los próximos 14 días">
          {convocatoriasPorCerrar.items.length === 0 ? (
            <TodoAlDia>Ninguna convocatoria cierra esta quincena.</TodoAlDia>
          ) : (
            <>
              {convocatoriasPorCerrar.items.map((c) => (
                <FilaAccion
                  key={c.id}
                  titulo={c.titulo}
                  detalle={`cierra en ${c.diasRestantes} ${plural(c.diasRestantes, 'día', 'días')} · ${c.postulaciones} ${plural(c.postulaciones, 'postulación', 'postulaciones')}`}
                  tono={c.diasRestantes <= 3 ? 'urgente' : undefined}
                />
              ))}
              <VerTodo to="/admin/convocatorias">Ver convocatorias</VerTodo>
            </>
          )}
        </CorePanel>
      </div>

      {/* Sponsors: sólo descargas, que salen de una tabla real. Impresiones y clics
          viven en analytics y arrastran el techo de 500 que este panel vino a evitar. */}
      <div className="mt-10">
        <CorePanel title="Sponsors" note="Descargas de fotos con su marca — dato de la base, no telemetría">
          {stats.sponsors.items.length === 0 ? (
            <p className="py-3 text-sm text-ink-soft">Todavía no hay descargas registradas.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="eyebrow py-2.5 pr-4 text-[9px] font-semibold text-ink-soft">Sponsor</th>
                  <th className="eyebrow py-2.5 text-right text-[9px] font-semibold text-ink-soft">Descargas</th>
                </tr>
              </thead>
              <tbody>
                {stats.sponsors.items.map((s) => (
                  <tr key={s.sponsorId} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4">
                      <p className="type-serif text-[15px] text-ink">{s.nombre}</p>
                      {s.nivel && <p className="eyebrow mt-0.5 text-[8px] text-ink-soft/70">{s.nivel}</p>}
                    </td>
                    <td className="py-3 text-right text-[13px] tabular-nums text-ink">{s.descargas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CorePanel>
      </div>
    </>
  )
}
