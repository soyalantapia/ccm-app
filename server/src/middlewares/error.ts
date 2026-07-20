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
  // Errores conocidos de Prisma (P2025 no encontrado, P2002 único, P2003 FK).
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    const code = (err as { code: string }).code
    if (code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } })
      return
    }
    if (code === 'P2002') {
      res.status(409).json({ error: { code: 'DUPLICATE', message: 'Ya existe un recurso con esa clave' } })
      return
    }
    if (code === 'P2003' || code === 'P2014') {
      res.status(409).json({ error: { code: 'FK_CONSTRAINT', message: 'No se puede borrar: tiene dependientes (ej. galerías)' } })
      return
    }
  }
  // Errores de http-errors que emite express.json() ANTES de tocar una ruta: JSON malformado
  // (400) y body > límite (413). Sin esto caían al 500 INTERNAL de abajo (respuesta engañosa +
  // ruido en los logs de error por lo que en realidad es una request malformada del cliente).
  if (err && typeof err === 'object' && ('status' in err || 'statusCode' in err)) {
    const raw = (err as { status?: unknown; statusCode?: unknown })
    const status = typeof raw.status === 'number' ? raw.status : typeof raw.statusCode === 'number' ? raw.statusCode : undefined
    if (status !== undefined && status >= 400 && status < 500) {
      const tooLarge = status === 413 || (err as { type?: unknown }).type === 'entity.too.large'
      res.status(status).json({
        error: {
          code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
          message: tooLarge ? 'El cuerpo de la solicitud es demasiado grande.' : 'Solicitud malformada (JSON inválido).',
        },
      })
      return
    }
  }
  // PrismaClientValidationError: input con tipo/forma equivocada (campo required ausente, enum
  // inválido, string donde va número). Es culpa del cliente → 400, no un 500 INTERNAL. Cubre los
  // writes admin/públicos que no tienen zod por-campo (defensa transversal). No filtra el detalle
  // de Prisma al cliente (puede tener nombres de columnas), solo un 400 genérico.
  if (err && typeof err === 'object' && (err as { name?: unknown }).name === 'PrismaClientValidationError') {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Datos inválidos o incompletos.' } })
    return
  }
  // No filtrar internals ni PII al cliente; loguear server-side (sin payloads crudos).
  console.error('[error]', err instanceof Error ? err.stack : err)
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno' } })
}
