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
  // Sin backend (demo) el Dashboard no muestra NINGÚN número: LocalDataStore.getAdminStats()
  // devuelve null y Dashboard.tsx pinta EstadoSinDatos. Sirve para no "arreglar" acá una
  // contradicción que en la demo no existe — ver el comentario de `contadas`.
  const hayBackend = useStore((s) => s.hasBackend())
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

  // CON backend los contadores cuentan SOLO las reales, con la misma regla que el Dashboard
  // (server/src/services/statsService.ts, SOLO_REALES). Antes sumaban también las del seed, así
  // que el panel se contradecía a sí mismo: "Nadie esperando respuesta" en el Dashboard y
  // "Preinscriptas 12" acá, sobre las mismas filas.
  //
  // Es una EXCEPCIÓN deliberada a la decisión 3 del CRM de Usuarios
  // (docs/superpowers/specs/2026-07-20-crm-usuarios-design.md §3 y §12): allá los datos de demo
  // "se ven como usuarios normales" y la salvaguarda única es el export. Allá la pantalla es un
  // directorio y el riesgo era nacer vacía; acá es una cola de trabajo y el número contesta
  // "cuántas me faltan contestar", la misma pregunta que ya contesta el Dashboard sin el seed.
  // La decisión se respeta en lo que decide: las 24 de ejemplo se siguen viendo enteras y se
  // siguen pudiendo abrir y decidir. Lo que se les saca es el número, no la presencia.
  //
  // SIN backend no se excluye nada: el seed ES el contenido de la demo y el Dashboard no muestra
  // ningún número contra el cual contradecirse, así que descontarlas ahí sería degradar la demo
  // para arreglar un problema que en la demo no pasa.
  const contadas = hayBackend ? applications.filter((a) => !a.fromSeed) : applications
  const count = (status: ApplicationStatus) => contadas.filter((a) => a.status === status).length
  const tabs = [
    { id: 'todas', label: 'Todas', count: contadas.length },
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
          {reales.length > 0 ? (
            <div className="space-y-4">
              {reales.map((app) => (
                <OpsApplicationCard key={app.id} app={app} tab={tab} />
              ))}
            </div>
          ) : (
            // Con backend el hueco necesita nombre: el tab dice 0 y abajo hay tarjetas. Sin
            // backend los contadores incluyen las de ejemplo, así que no hay cero que explicar.
            hayBackend && (
              <p className="text-sm leading-relaxed text-ink-soft">
                {contadas.length === 0
                  ? 'Todavía no llegó ninguna postulación real.'
                  : 'Ninguna postulación real coincide con esta vista.'}
              </p>
            )
          )}

          {ejemplo.length > 0 && (
            <div>
              <p className="eyebrow text-[10px] text-ink-soft">
                {ejemplo.length} {ejemplo.length === 1 ? 'postulación' : 'postulaciones'} de ejemplo — datos de
                demo, no de gente real
              </p>
              {/* Va colgado del grupo de ejemplo y no del caso "no hay ninguna real": el día
               *  después del lanzamiento la lista es 1 real + 24 de ejemplo, y ahí un "Todas 1"
               *  con veinticinco tarjetas abajo desconcierta igual que el cero.
               *
               *  Dice "de esta pantalla" en vez de "los contadores" a secas porque el badge
               *  "{n} postulaciones" de AdminConvocatorias cuenta sobre la lista sin filtrar
               *  (appsFor) y sí las incluye: prometer que no entran en ningún contador sería
               *  desmentirse en la pantalla de al lado. Que las dos coincidan es trabajo
               *  pendiente en ese archivo, no algo que este rótulo pueda arreglar.
               *
               *  Lo de avisar es verificable acá al lado: OpsDecisionSheet apaga el envío con
               *  `puedeEnviar = !app.fromSeed && !!emailReal`. Sin decirlo, decidir veinte de
               *  ejemplo se siente trabajo hecho y nadie recibe nada. */}
              {hayBackend && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft/80">
                  No entran en los contadores de esta pantalla ni en el Dashboard. Decidirlas no le
                  avisa a nadie.
                </p>
              )}
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
