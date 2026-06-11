import { bus } from './bus'
import { missingFields } from './identity'
import type { ProfileFieldKey } from '../data/types'

/**
 * requireProfile (D22): toda acción gated lo invoca antes de ejecutar.
 * Si el perfil ya tiene los campos, resuelve al instante; si no, abre el
 * sheet global (ProfileSheetProvider) pidiendo SOLO los campos faltantes.
 * Resuelve true cuando el usuario completó, false si canceló.
 */

export interface ProfileRequest {
  fields: ProfileFieldKey[]
  action: string
  title: string
  message?: string
  resolve: (ok: boolean) => void
}

export const FIELD_META: Record<
  ProfileFieldKey,
  { label: string; type: string; placeholder?: string; autocomplete?: string }
> = {
  firstName: { label: 'Nombre', type: 'text', placeholder: 'Tu nombre', autocomplete: 'given-name' },
  lastName: { label: 'Apellido', type: 'text', placeholder: 'Tu apellido', autocomplete: 'family-name' },
  email: { label: 'Email', type: 'email', placeholder: 'tu@email.com', autocomplete: 'email' },
  profession: { label: 'Profesión', type: 'text', placeholder: 'Ej: diseñadora, fotógrafo, empresaria' },
  phone: { label: 'Teléfono', type: 'tel', placeholder: '+54 351 ...', autocomplete: 'tel' },
  dni: { label: 'DNI', type: 'text', placeholder: 'Sin puntos' },
  city: { label: 'Ciudad', type: 'text', placeholder: 'Ej: Córdoba', autocomplete: 'address-level2' },
  instagram: { label: 'Instagram', type: 'text', placeholder: '@tuusuario' },
}

export function requireProfile(
  fields: ProfileFieldKey[],
  action: string,
  opts?: { title?: string; message?: string },
): Promise<boolean> {
  if (missingFields(fields).length === 0) return Promise.resolve(true)
  return new Promise((resolve) => {
    const request: ProfileRequest = {
      fields,
      action,
      title: opts?.title ?? 'Para continuar necesitamos estos datos',
      message: opts?.message,
      resolve,
    }
    bus.emit('ui:profile-request', request)
  })
}
