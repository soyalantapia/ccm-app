import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, Input, Select, SectionTitle, Tabs } from '../../components/ui'
import { useStore } from '../../data/store'
import type { Application, ApplicationStatus } from '../../data/types'
import { OpsApplicationCard } from '../../features/admin/OpsApplicationCard'
import {
  deriveApplicationFields,
  filterByApplicationTab,
  parseApplicationTab,
  type ApplicationTab,
} from '../../features/admin/applicationFields'

export default function AdminPostulaciones() {
  const applications = useStore((s) => s.getAdminApplications())
  const convocatorias = useStore((s) => s.getConvocatorias())
  const fallo = useStore((s) => s.applicationsFailed())
  // El tab vive en la URL (?tab=): así la card arma el link a la ficha con el filtro activo, y
  // "Volver" desde la ficha reconstruye exactamente esta misma vista (antes era un useState local
  // que se perdía al navegar).
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseApplicationTab(searchParams.get('tab'))
  const setTab = (id: ApplicationTab) => setSearchParams(id === 'todas' ? {} : { tab: id }, { replace: true })

  // Búsqueda y filtro de convocatoria NO van a la URL, a propósito: el contrato de ↑/↓ en la
  // ficha (AdminPostulacionDetalle) recorre el MISMO subconjunto que filterByApplicationTab(tab)
  // — eso es lo único que la ficha sabe reconstruir. Si estos dos vivieran en la URL sin que la
  // ficha los aplicara también, tendríamos exactamente el tipo de promesa vacía que esta tarea
  // vino a sacar: un filtro "aplicado" que en silencio no vale para ↑/↓. Son refinamientos
  // rápidos de ESTA lista, no una vista que haya que reconstruir al volver.
  const [busqueda, setBusqueda] = useState('')
  const [convocatoriaId, setConvocatoriaId] = useState('todas')

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

  // Convocatorias representadas de VERDAD en la cola (no todas las que existen en el sistema:
  // ofrecer un filtro por una convocatoria sin ninguna postulación es ruido). Con una sola, el
  // filtro tampoco decide nada — por eso se oculta.
  const convocatoriaIdsEnCola = Array.from(new Set(applications.map((a) => a.convocatoriaId)))
  const mostrarFiltroConvocatoria = convocatoriaIdsEnCola.length > 1
  const opcionesConvocatoria = [
    { value: 'todas', label: 'Todas las convocatorias' },
    ...convocatoriaIdsEnCola.map((id) => ({
      value: id,
      label: convocatorias.find((c) => c.id === id)?.title ?? 'Convocatoria eliminada',
    })),
  ]

  const query = busqueda.trim().toLowerCase()
  const matchesQuery = (app: Application) => {
    if (!query) return true
    const fields = convocatorias.find((c) => c.id === app.convocatoriaId)?.fields ?? []
    const { title, email } = deriveApplicationFields(app, fields)
    return title.toLowerCase().includes(query) || (email ?? '').toLowerCase().includes(query)
  }

  const filtered = filterByApplicationTab(applications, tab)
    .filter((a) => convocatoriaId === 'todas' || a.convocatoriaId === convocatoriaId)
    .filter(matchesQuery)

  // Las de `fromSeed` (datos de ejemplo del seed) van en un grupo propio, después de las reales:
  // antes se veían idénticas y competían por la atención del organizador con postulaciones de
  // gente real.
  const reales = filtered.filter((a) => !a.fromSeed)
  const ejemplo = filtered.filter((a) => a.fromSeed)
  const hayFiltroActivo = query !== '' || convocatoriaId !== 'todas'

  return (
    <div className="px-5 py-8 md:px-10">
      <SectionTitle
        eyebrow="Admin · Postulaciones"
        title="Postulaciones"
        lead="Cola de revisión de todas las convocatorias: la decisión siempre la toma una persona del equipo, postulación por postulación."
      />

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o email…"
          aria-label="Buscar postulaciones"
          className="sm:max-w-xs"
        />
        {mostrarFiltroConvocatoria && (
          <Select
            value={convocatoriaId}
            onChange={(e) => setConvocatoriaId(e.target.value)}
            options={opcionesConvocatoria}
            aria-label="Filtrar por convocatoria"
            className="sm:max-w-xs"
          />
        )}
      </div>

      <Tabs
        tabs={tabs}
        active={tab}
        onChange={(id) => setTab(id as ApplicationTab)}
        className="mt-8"
      />

      {filtered.length === 0 ? (
        <EmptyState title="Nada por acá" className="mt-4">
          {hayFiltroActivo
            ? 'No hay postulaciones que coincidan con la búsqueda o el filtro.'
            : 'No hay postulaciones en este estado todavía.'}
        </EmptyState>
      ) : (
        <div className="mt-6 max-w-3xl space-y-10">
          {reales.length > 0 && (
            <div className="space-y-4">
              {reales.map((app) => (
                <OpsApplicationCard key={app.id} app={app} tab={tab} />
              ))}
            </div>
          )}

          {ejemplo.length > 0 && (
            <div>
              <p className="eyebrow text-[10px] text-ink-soft">
                Postulaciones de ejemplo — datos de demo, no de gente real
              </p>
              <div className="mt-4 space-y-4">
                {ejemplo.map((app) => (
                  <OpsApplicationCard key={app.id} app={app} tab={tab} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
