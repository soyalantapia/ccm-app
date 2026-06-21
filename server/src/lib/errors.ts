/**
 * Errores de API con formato uniforme (canon: doc 05 — formato de errores).
 * Respuesta de error: { error: { code, message, details? } }.
 * Los `code` de negocio (BLOCK_FULL, SOCIO_ONLY, ADMIN_REQUIRED, etc.) los emiten
 * las fases que los necesitan; acá viven la clase base y los genéricos.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new ApiError(400, code, message, details)
export const unauthorized = (code = 'UNAUTHORIZED', message = 'No autenticado') =>
  new ApiError(401, code, message)
export const forbidden = (code = 'FORBIDDEN', message = 'Sin permiso') =>
  new ApiError(403, code, message)
export const notFound = (code = 'NOT_FOUND', message = 'No encontrado') =>
  new ApiError(404, code, message)
export const conflict = (code: string, message: string, details?: unknown) =>
  new ApiError(409, code, message, details)
