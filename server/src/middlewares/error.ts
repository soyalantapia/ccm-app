import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { ApiError } from '../lib/errors.js'

/** 404 para rutas no matcheadas. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } })
}

/** Handler de error central. Formato uniforme { error: { code, message, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details: err.flatten() },
    })
    return
  }
  // No filtrar internals ni PII al cliente; loguear server-side (sin payloads crudos).
  console.error('[error]', err instanceof Error ? err.stack : err)
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno' } })
}
