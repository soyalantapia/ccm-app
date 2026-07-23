import type { ReactNode } from 'react'
import { Eyebrow } from '../../components/ui'

interface CorePageHeaderProps {
  title: ReactNode
  eyebrow?: string
  /** Texto fino bajo el título (ej: "Demo local · sincronización en la nube en Fase 1"). */
  lead?: ReactNode
  /** Indicador "● En vivo" (punto success con pulso). */
  live?: boolean
  /**
   * Estado de publicación de la ENTIDAD que se está mirando. Es distinto de `live`, que habla de
   * la conexión con el sistema. En la ficha de un evento los dos se confundían: un borrador
   * mostraba "● En vivo" y se leía como "este evento ya está publicado", que es lo contrario.
   */
  publicado?: boolean
  /** Acciones a la derecha (ej: Exportar CSV). */
  actions?: ReactNode
}

/** Cabecera editorial de página admin: eyebrow dorado + display serif + acciones. */
export function CorePageHeader({ title, eyebrow = 'Admin', lead, live, publicado, actions }: CorePageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Eyebrow>{eyebrow}</Eyebrow>
          {live && (
            <span className="eyebrow flex items-center gap-2 text-[9px] text-success">
              <span aria-hidden className="animate-pulse text-[8px] leading-none">
                ●
              </span>
              En vivo
            </span>
          )}
          {publicado === false && (
            <span className="eyebrow rounded-sm bg-ink/8 px-2.5 py-1 text-[9px] text-ink-soft">
              Borrador · no lo ve el público
            </span>
          )}
        </div>
        <h1 className="type-display mt-4 text-[clamp(2.1rem,6vw,3.2rem)] text-ink">{title}</h1>
        {lead && <p className="mt-3 max-w-xl text-xs leading-relaxed text-ink-soft/80">{lead}</p>}
      </div>
      {actions && <div className="w-full sm:w-auto sm:shrink-0">{actions}</div>}
    </header>
  )
}
