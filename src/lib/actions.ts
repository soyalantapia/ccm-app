import type { NavigateFunction } from 'react-router-dom'
import { requireProfile } from './profileRequest'
import { store } from '../data/store'
import { IDS } from '../data/ids'
import { toast } from '../components/ui'

/**
 * Acción compartida "Registrate gratis" (header, landing, /entradas):
 * perfil progresivo → inscripción al evento principal → Mi QR.
 */
export async function registerFree(navigate: NavigateFunction): Promise<void> {
  if (store.isRegistered(IDS.events.principal)) {
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
  store.register(IDS.events.principal)
  toast('¡Listo! Ya estás en CCM 2026')
  navigate('/mi-qr')
}
