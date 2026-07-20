/**
 * Espejo de los roles y permisos del backend (`server/src/domain/adminRoles.ts`).
 *
 * Acá viven sólo los TIPOS y las etiquetas para la UI. La lista de permisos de cada persona
 * la manda el server en el login: el front nunca deduce qué puede hacer alguien, sólo dibuja
 * lo que le dijeron. Esconder un botón es cosmética; quien decide es el backend, que rechaza
 * con 403 aunque el botón se haya mostrado.
 */

export type AdminRole = 'OWNER' | 'EDITOR' | 'CONTENT' | 'STAFF' | 'VIEWER'

export type Permission =
  | 'events:write'
  | 'convocatorias:write'
  | 'applications:read'
  | 'applications:decide'
  | 'catalog:write'
  | 'content:write'
  | 'sponsors:write'
  | 'analytics:read'
  | 'orders:read'
  | 'team:manage'
  | 'upload'

export const ROLE_LABEL: Record<AdminRole, string> = {
  OWNER: 'Dueño',
  EDITOR: 'Organizador',
  CONTENT: 'Contenido',
  STAFF: 'Puerta',
  VIEWER: 'Lectura',
}

export const ROLE_BLURB: Record<AdminRole, string> = {
  OWNER: 'Acceso total, incluida la gestión del equipo.',
  EDITOR: 'Eventos, convocatorias, postulaciones, catálogo y sponsors.',
  CONTENT: 'Novedades, galerías, banners y beneficios.',
  STAFF: 'Acreditación en la puerta del evento.',
  VIEWER: 'Solo lectura de métricas.',
}
