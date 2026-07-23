import type { NavigateFunction } from 'react-router-dom'
import { requireProfile } from './profileRequest'
import { store } from '../data/store'
import { IDS } from '../data/ids'
import { toast } from '../components/ui'

/**
 * Acción compartida "Registrate gratis" (header, landing, /entradas):
 * perfil progresivo → inscripción → Mi QR.
 *
 * `eventId` por defecto es el principal, que es de dónde salen casi todos los llamados. Pero el
 * parámetro NO es decorativo: el selector de entradas ahora se muestra en la ficha de cualquier
 * evento, y su entrada gratuita llamaba acá sin decir a cuál. Resultado: el visitante apretaba
 * "Inscribirme" en un taller y quedaba anotado en CCM 2026 —otro evento, con su QR y todo—
 * mientras el taller seguía sin nadie.
 */
export async function registerFree(
  navigate: NavigateFunction,
  eventId: string = IDS.events.principal,
): Promise<void> {
  if (store.isRegistered(eventId)) {
    navigate('/mi-qr')
    return
  }
  const ok = await requireProfile(
    ['firstName', 'lastName', 'email', 'profession'],
    'registro_general',
    {
      title: 'Para inscribirte necesitamos estos datos',
      message: 'Entrada general gratuita con inscripción obligatoria. Una sola vez: después ya no te preguntamos nada.',
    },
  )
  if (!ok) return
  store.register(eventId)
  // El mensaje nombra el evento real: "Ya estás en CCM 2026" después de anotarse a un taller es
  // la misma confusión que causaba el bug, contada de otra forma.
  const titulo = store.getEventById(eventId)?.title
  toast(titulo ? `¡Listo! Ya estás en ${titulo}` : '¡Listo! Ya estás inscripto')
  navigate('/mi-qr')
}
