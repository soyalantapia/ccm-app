import { useSearchParams } from 'react-router-dom'
import { EmptyState, SectionTitle, Tabs } from '../../components/ui'
import { useStore } from '../../data/store'
import type { ApplicationStatus } from '../../data/types'
import { OpsApplicationCard } from '../../features/admin/OpsApplicationCard'
import { filterByApplicationTab, parseApplicationTab, type ApplicationTab } from '../../features/admin/applicationFields'

export default function AdminPostulaciones() {
  const applications = useStore((s) => s.getAdminApplications())
  const fallo = useStore((s) => s.applicationsFailed())
  // El tab vive en la URL (?tab=): así la card arma el link a la ficha con el filtro activo, y
  // "Volver" desde la ficha reconstruye exactamente esta misma vista (antes era un useState local
  // que se perdía al navegar).
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseApplicationTab(searchParams.get('tab'))
  const setTab = (id: ApplicationTab) => setSearchParams(id === 'todas' ? {} : { tab: id }, { replace: true })

  // null = todavía no hidrató o falló el fetch real (solo pasa con backend: en demo el seed
  // ES el contenido y nunca es null). Nunca cae al seed cuando SÍ hay backend: mostrar
  // postulaciones de demo como si fueran reales es peor que no mostrar nada.
  if (!applications) {
    return (
      <div className="px-5 py-8 md:px-10">
        <SectionTitle eyebrow="Admin · Postulaciones" title="Postulaciones" />
        <p className="mt-8 text-sm text-ink-soft">
          {fallo
            ? 'No pudimos traer las postulaciones. No mostramos nada para no darte una lista equivocada.'
            : 'Cargando…'}
        </p>
      </div>
    )
  }

  const count = (status: ApplicationStatus) => applications.filter((a) => a.status === status).length
  const tabs = [
    { id: 'todas', label: 'Todas', count: applications.length },
    { id: 'preinscripta', label: 'Preinscriptas', count: count('preinscripta') },
    { id: 'aceptada', label: 'Aceptadas', count: count('aceptada') },
    { id: 'rechazada', label: 'Rechazadas', count: count('rechazada') },
  ]
  const filtered = filterByApplicationTab(applications, tab)

  return (
    <div className="px-5 py-8 md:px-10">
      <SectionTitle
        eyebrow="Admin · Postulaciones"
        title="Postulaciones"
        lead="Cola de revisión de «Camino a CCM 2026». La decisión es humana, siempre — el score IA sugerido llega en Fase 1."
      />

      <Tabs
        tabs={tabs}
        active={tab}
        onChange={(id) => setTab(id as ApplicationTab)}
        className="mt-10"
      />

      {filtered.length === 0 ? (
        <EmptyState title="Nada por acá" className="mt-4">
          No hay postulaciones en este estado todavía.
        </EmptyState>
      ) : (
        <div className="mt-6 max-w-3xl space-y-4">
          {filtered.map((app) => (
            <OpsApplicationCard key={app.id} app={app} tab={tab} />
          ))}
        </div>
      )}
    </div>
  )
}
