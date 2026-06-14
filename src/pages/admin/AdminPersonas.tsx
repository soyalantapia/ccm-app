import { Badge, Card } from '../../components/ui'
import { useStore } from '../../data/store'
import type { ProfileFieldKey } from '../../data/types'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { CorePanel } from '../../features/admin/CorePanel'
import { DeviceTimeline } from '../../features/admin/DeviceTimeline'
import {
  APPLICATION_STATUS_META,
  PROFILE_FIELD_LABELS,
  PROFILE_FIELD_ORDER,
  formatDateTime,
  formatRelative,
  sourceLabel,
} from '../../features/admin/coreFormat'

const CONSENT_LABELS: { key: 'terms' | 'news' | 'sponsors'; label: string }[] = [
  { key: 'terms', label: 'Términos y condiciones' },
  { key: 'news', label: 'Novedades por email' },
  { key: 'sponsors', label: 'Compartir datos con sponsors' },
]

export default function AdminPersonas() {
  const profile = useStore((s) => s.getProfile())
  const registrations = useStore((s) => s.getRegistrations())
  const downloads = useStore((s) => s.getDownloads())
  const orders = useStore((s) => s.getOrders())
  const applications = useStore((s) => s.getApplications())
  const analytics = useStore((s) => s.getAnalytics())

  // Timeline del dato: eventos de ESTE dispositivo, en orden cronológico.
  const deviceEvents = analytics.filter((e) => e.deviceId === profile.deviceId)

  const capturedFields = PROFILE_FIELD_ORDER.filter(
    (key): key is ProfileFieldKey => Boolean(profile.fields[key]?.value),
  )
  const deviceName =
    [profile.fields.firstName?.value, profile.fields.lastName?.value].filter(Boolean).join(' ') ||
    'Visitante anónimo'
  const activity = [
    { label: 'Inscripciones', value: registrations.filter((r) => r.status === 'confirmada').length },
    { label: 'Descargas de fotos', value: downloads.length },
    { label: 'Órdenes', value: orders.length },
  ]

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        eyebrow="CRM"
        title="Personas"
        live
        lead="Cada campo registra cuándo y en qué acción se capturó — ese origen es el oro de la base propia (PRD §10.5)."
      />

      {/* Ficha 360 del perfil de este dispositivo */}
      <Card className="mt-10 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="eyebrow text-[9px] text-accent">Perfil del dispositivo</p>
            <p className="type-serif mt-2 text-2xl text-ink">{deviceName}</p>
            <p className="mt-1.5 text-[11px] text-ink-soft">
              {profile.deviceId} · creado el {formatDateTime(profile.createdAt)}
            </p>
          </div>
          <Badge tone="accent">Este dispositivo</Badge>
        </div>

        {/* Dato · Origen · Cuándo */}
        <div className="mt-7">
          {capturedFields.length === 0 ? (
            <p className="border-t border-line py-5 text-sm leading-relaxed text-ink-soft">
              Todavía no se capturó ningún dato. Usá la app: inscribite a un bloque, comprá una
              entrada o postulate — cada campo aparece acá con su acción de origen.
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-y border-line">
                  <th className="eyebrow py-2.5 pr-4 text-[9px] font-semibold text-ink-soft">Dato</th>
                  <th className="eyebrow py-2.5 pr-4 text-[9px] font-semibold text-ink-soft">Origen</th>
                  <th className="eyebrow hidden py-2.5 text-right text-[9px] font-semibold text-ink-soft sm:table-cell">
                    Cuándo
                  </th>
                </tr>
              </thead>
              <tbody>
                {capturedFields.map((key) => {
                  const field = profile.fields[key]!
                  return (
                    <tr key={key} className="border-b border-line">
                      <td className="py-3 pr-4 align-top">
                        <p className="eyebrow text-[8px] text-ink-soft/70">{PROFILE_FIELD_LABELS[key]}</p>
                        <p className="mt-0.5 break-all text-[14px] text-ink">{field.value}</p>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <Badge tone="outline">{sourceLabel(field.source)}</Badge>
                        <p className="mt-1 text-[10px] text-ink-soft/70 sm:hidden">
                          {formatRelative(field.capturedAt)}
                        </p>
                      </td>
                      <td className="hidden py-3 text-right align-top text-[12px] tabular-nums text-ink-soft sm:table-cell">
                        {formatDateTime(field.capturedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Consentimientos con timestamp */}
        <div className="mt-7">
          <p className="eyebrow text-[9px] text-ink-soft">Consentimientos</p>
          <ul className="mt-3 space-y-2.5">
            {CONSENT_LABELS.map(({ key, label }) => {
              const ts = profile.consents[key]
              return (
                <li key={key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-[13px] text-ink">{label}</span>
                  {ts ? (
                    <span className="flex items-center gap-2.5">
                      <Badge tone="success">Otorgado</Badge>
                      <span className="text-[11px] tabular-nums text-ink-soft/70">{formatDateTime(ts)}</span>
                    </span>
                  ) : (
                    <Badge tone="outline">Sin otorgar</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        {/* Actividad del perfil */}
        <div className="mt-7 border-t border-line pt-5">
          <p className="eyebrow text-[9px] text-ink-soft">Actividad</p>
          <div className="mt-3 flex flex-wrap gap-x-10 gap-y-3">
            {activity.map((a) => (
              <p key={a.label} className="text-[12px] text-ink-soft">
                <span className="type-serif mr-1.5 text-xl text-ink">{a.value}</span>
                {a.label}
              </p>
            ))}
          </div>
        </div>

        {/* Timeline del dato propio — el remate del pitch (PRD §10.5) */}
        <div className="mt-7 border-t border-line pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="eyebrow text-[9px] text-accent">Timeline del dato</p>
            <span className="eyebrow flex items-center gap-1.5 text-[8px] text-success">
              <span aria-hidden className="animate-pulse leading-none">
                ●
              </span>
              En vivo
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
            Cada acción de este dispositivo queda registrada con su origen y su hora exacta. Probá:
            esa acción de hace unos segundos ya es esta fila.
          </p>
          <div className="mt-4">
            <DeviceTimeline events={deviceEvents} />
          </div>
        </div>
      </Card>

      {/* Personas derivadas de postulaciones */}
      <CorePanel
        className="mt-12"
        title="Personas de postulaciones"
        note="Origen: convocatoria Camino a CCM 2026"
      >
        <ul>
          {applications.map((app) => (
            <li
              key={app.id}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 border-b border-line py-4 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="type-serif text-base text-ink">{app.data.nombre || 'Sin nombre'}</p>
                <p className="mt-0.5 truncate text-[12px] text-ink-soft">
                  {[app.data.email, app.data.telefono].filter(Boolean).join(' · ') || 'Sin contacto'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge tone={APPLICATION_STATUS_META[app.status].tone}>
                  {APPLICATION_STATUS_META[app.status].label}
                </Badge>
                <span className="text-[11px] text-ink-soft/70">{formatRelative(app.ts)}</span>
              </div>
            </li>
          ))}
          {applications.length === 0 && (
            <li className="py-4 text-sm text-ink-soft">Sin postulaciones registradas todavía.</li>
          )}
        </ul>
        <p className="mt-5 text-[11px] leading-relaxed text-ink-soft/70">
          Export CSV solo admin · D18 inviolable: los datos nunca se comparten sin consentimiento
          específico. Segmentos guardados y ficha 360 completa llegan en Fase 1.
        </p>
      </CorePanel>
    </div>
  )
}
