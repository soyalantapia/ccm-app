import { CalendarPlus } from 'lucide-react'
import { Button } from '../../components/ui'
import type { ButtonSize } from '../../components/ui/Button'
import { store } from '../../data/store'
import { downloadIcs } from '../../lib/ics'
import type { EventItem } from '../../data/types'

interface AddToCalendarProps {
  event: EventItem
  /** Texto corto para filas compactas (default "Agregar al calendario"). */
  label?: string
  size?: ButtonSize
  className?: string
}

/**
 * Botón "Agregar al calendario": descarga el .ics del evento (sin sacar al
 * usuario de la app) y trackea `calendar_export`. Estilo outline del kit.
 */
export function AddToCalendar({ event, label = 'Agregar al calendario', size = 'sm', className }: AddToCalendarProps) {
  const handleClick = () => {
    store.track('calendar_export', { eventId: event.id })
    downloadIcs(event)
  }

  return (
    <Button variant="outline" size={size} onClick={handleClick} className={className}>
      <CalendarPlus size={15} strokeWidth={1.75} />
      {label}
    </Button>
  )
}
