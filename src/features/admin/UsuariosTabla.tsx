import { Badge } from '../../components/ui'
import { formatRelative } from './coreFormat'
import type { PersonaListItem } from '../../data/queries'

interface Props {
  items: PersonaListItem[]
  onAbrir: (id: string) => void
}

/**
 * Lista de usuarios. En pantallas chicas se muestra como tarjetas apiladas: cuatro columnas
 * de datos no entran en un celular, y el equipo usa esto desde el teléfono durante el evento.
 */
export function UsuariosTabla({ items, onAbrir }: Props) {
  return (
    <ul className="divide-y divide-line">
      {items.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onAbrir(p.id)}
            className="flex w-full flex-col gap-2 px-1 py-4 text-left transition-colors hover:bg-bg/60 sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-ink">
                {p.nombre ?? <span className="text-ink-soft">Sin nombre</span>}
              </span>
              <span className="mt-0.5 block truncate text-xs text-ink-soft">
                {[p.email, p.telefono].filter(Boolean).join(' · ') || 'Sin contacto'}
              </span>
            </span>

            <span className="flex flex-wrap items-center gap-1.5">
              {p.esSocio && <Badge tone="accent">Socio</Badge>}
              {p.inscripciones > 0 && <Badge tone="success">{p.inscripciones} inscripción{p.inscripciones > 1 ? 'es' : ''}</Badge>}
              {p.postulaciones > 0 && <Badge tone="neutral">{p.postulaciones} postulación{p.postulaciones > 1 ? 'es' : ''}</Badge>}
            </span>

            <span className="shrink-0 text-xs text-ink-soft sm:w-32 sm:text-right">
              {p.ultimaActividad ? formatRelative(p.ultimaActividad) : '—'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
