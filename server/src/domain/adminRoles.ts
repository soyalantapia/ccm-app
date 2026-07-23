import type { AdminRole } from '@prisma/client'

/**
 * Roles del panel y qué puede hacer cada uno (canon 9 + S1 de docs/SECURITY.md).
 *
 * Un permiso describe una CAPACIDAD del negocio, no un endpoint. Eso hace que agregar una
 * pantalla no obligue a tocar la matriz: se le asigna el permiso que ya existe. Y hace que la
 * pregunta "¿quién puede ver el DNI de un postulante?" tenga una sola respuesta buscable.
 *
 * La regla que ordena todo: `applications:read` es el permiso sensible. Ahí está la PII
 * (nombre, email, teléfono, DNI) que captura la plataforma. Todo lo demás es contenido público
 * o configuración del evento.
 */

export const PERMISSIONS = [
  'events:write', // eventos y sus bloques
  'convocatorias:write', // convocatorias y sus formularios
  'applications:read', // ⚠️ PII: ver postulaciones (nombre, email, teléfono, DNI)
  'applications:decide', // aceptar / rechazar postulaciones
  'people:read', // ⚠️ PII: ver el CRM de usuarios (nombre, email, teléfono, DNI, actividad)
  'catalog:write', // perfiles del catálogo de participantes
  'content:write', // notas, galerías, banners, beneficios, contenidos
  'sponsors:write', // sponsors y planes de entrada
  'analytics:read', // dashboard y métricas
  'orders:read', // entradas y órdenes
  'grants:write', // regalar entradas de cortesía desde el CRM
  'team:manage', // invitar, cambiar rol, desactivar
  'upload', // subir imágenes
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Qué puede hacer cada rol.
 *
 * OWNER no se lista: puede todo por definición (ver `can`). Listarlo sería duplicar la matriz
 * y correr el riesgo de que un permiso nuevo se olvide de agregársele.
 */
const GRANTS: Record<Exclude<AdminRole, 'OWNER'>, readonly Permission[]> = {
  // Operación del evento. Ve postulantes porque es quien los evalúa.
  EDITOR: [
    'events:write',
    'convocatorias:write',
    'applications:read',
    'applications:decide',
    'people:read',
    'catalog:write',
    'sponsors:write',
    'content:write',
    'analytics:read',
    'orders:read',
    'grants:write',
    'upload',
  ],
  // Prensa y marketing. Publica contenido; NO ve datos de postulantes.
  CONTENT: ['content:write', 'analytics:read', 'upload'],
  // Puerta: escanear QR. Todavía sin permisos porque todavía no existe la pantalla.
  STAFF: [],
  // Lectura / reporte a sponsors. Ídem: pendiente de un reporte scopeado en el server.
  VIEWER: [],
}

/**
 * Roles que HOY pueden iniciar sesión.
 *
 * STAFF y VIEWER están definidos en el enum pero deshabilitados a propósito: no existe todavía
 * la superficie que los justifica (pantalla de acreditación por QR con su endpoint de check-in;
 * reporte a sponsors agregado y scopeado del lado del server). Dejarlos entrar sería darles un
 * panel vacío —o peor, acceso a pantallas de edición con botones destructivos— para cumplir con
 * un rol de nombre. Se habilitan agregándolos acá el día que exista su pantalla.
 */
export const LOGIN_ENABLED_ROLES: readonly AdminRole[] = ['OWNER', 'EDITOR', 'CONTENT']

export const canLogin = (role: AdminRole): boolean => LOGIN_ENABLED_ROLES.includes(role)

/** Roles que se pueden asignar desde el panel. Se ofrecen sólo los que sirven para algo:
 *  invitar a alguien a un rol que no puede entrar sería regalarle una cuenta muerta. */
export const ROLES_ASIGNABLES = LOGIN_ENABLED_ROLES

/** ¿El rol tiene esta capacidad? OWNER siempre; el resto, según la matriz. */
export function can(role: AdminRole, permission: Permission): boolean {
  if (role === 'OWNER') return true
  return (GRANTS[role as Exclude<AdminRole, 'OWNER'>] ?? []).includes(permission)
}

/** Todos los permisos efectivos de un rol — se lo mandamos al front para que arme su menú. */
export function permissionsOf(role: AdminRole): Permission[] {
  if (role === 'OWNER') return [...PERMISSIONS]
  return [...(GRANTS[role as Exclude<AdminRole, 'OWNER'>] ?? [])]
}

/** Etiquetas para la UI y para el email de invitación. */
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

/** Lo que se le cuenta a la persona en el email de invitación: qué va a poder hacer. */
export const ROLE_CAPS: Record<AdminRole, string[]> = {
  OWNER: [
    'Gestionar todo el panel de CCM',
    'Invitar gente al equipo y asignarle permisos',
    'Ver postulaciones y datos de los postulantes',
  ],
  EDITOR: [
    'Crear y editar eventos, bloques y convocatorias',
    'Revisar postulaciones y aceptarlas o rechazarlas',
    'Administrar el catálogo de participantes y los sponsors',
  ],
  CONTENT: [
    'Publicar novedades y notas',
    'Cargar galerías de fotos y banners',
    'Administrar los beneficios para socios',
  ],
  STAFF: ['Acreditar asistentes escaneando su QR en la puerta'],
  VIEWER: ['Ver las métricas del evento'],
}

/** A dónde aterriza cada rol al entrar (su pantalla más útil). */
export function homePathFor(role: AdminRole): string {
  if (role === 'CONTENT') return '/admin/novedades'
  return '/admin'
}
