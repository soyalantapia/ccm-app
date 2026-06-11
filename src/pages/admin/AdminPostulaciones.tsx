import { useState } from 'react'
import { EmptyState, SectionTitle, Tabs } from '../../components/ui'
import { useStore } from '../../data/store'
import type { ApplicationStatus } from '../../data/types'
import { OpsApplicationCard } from '../../features/admin/OpsApplicationCard'

type TabId = 'todas' | ApplicationStatus

export default function AdminPostulaciones() {
  const applications = useStore((s) => s.getApplications())
  const [tab, setTab] = useState<TabId>('todas')

  const count = (status: ApplicationStatus) => applications.filter((a) => a.status === status).length
  const tabs = [
    { id: 'todas', label: 'Todas', count: applications.length },
    { id: 'preinscripta', label: 'Preinscriptas', count: count('preinscripta') },
    { id: 'aceptada', label: 'Aceptadas', count: count('aceptada') },
    { id: 'rechazada', label: 'Rechazadas', count: count('rechazada') },
  ]
  const filtered = tab === 'todas' ? applications : applications.filter((a) => a.status === tab)

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
        onChange={(id) => setTab(id as TabId)}
        className="mt-10"
      />

      {filtered.length === 0 ? (
        <EmptyState title="Nada por acá" className="mt-4">
          No hay postulaciones en este estado todavía.
        </EmptyState>
      ) : (
        <div className="mt-6 max-w-3xl space-y-4">
          {filtered.map((app) => (
            <OpsApplicationCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  )
}
