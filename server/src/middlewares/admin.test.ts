import { describe, it, expect, vi } from 'vitest'
import { requireAdmin } from './admin'
import { signSessionToken, sessionExpiry } from '../lib/adminSession.js'

/**
 * Al panel se entra SÓLO con una sesión personal. Estos tests cubren lo que se puede decidir
 * sin tocar la base: qué pasa cuando el token falta, no está firmado por nosotros, o está
 * manipulado. Los casos que dependen de la fila de sesión (vencida, revocada, persona dada de
 * baja) viven en adminSession.test.ts (la lógica pura) y en la suite de aceptación, que los
 * ejercita contra la API real.
 */

function fakeReq(auth?: string) {
  return {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? auth : undefined),
  } as never
}

describe('requireAdmin — sólo entra una sesión válida', () => {
  it('401 si falta el header Authorization', () => {
    const next = vi.fn()
    requireAdmin(fakeReq(undefined), {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401, code: 'ADMIN_REQUIRED' })
  })

  it('401 si el header no tiene el esquema Bearer', () => {
    const next = vi.fn()
    requireAdmin(fakeReq('Basic dXNlcjpwYXNz'), {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401, code: 'ADMIN_REQUIRED' })
  })

  it('401 si el token no está firmado por nosotros', () => {
    const next = vi.fn()
    requireAdmin(fakeReq('Bearer no.es.un.token.nuestro'), {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401, code: 'ADMIN_SESSION_INVALID' })
  })

  it('401 si le manipularon la firma a un token que era válido', () => {
    const bueno = signSessionToken('ses_123', sessionExpiry(new Date()))
    const manipulado = bueno.slice(0, -3) + 'AAA'
    const next = vi.fn()
    requireAdmin(fakeReq(`Bearer ${manipulado}`), {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401 })
  })

  it('401 si le manipularon el contenido (otro sessionId con la firma vieja)', () => {
    const bueno = signSessionToken('ses_123', sessionExpiry(new Date()))
    const firma = bueno.split('.')[1]
    const otroPayload = Buffer.from(JSON.stringify({ s: 'ses_OTRO', exp: Date.now() + 9e6 }))
      .toString('base64url')
    const next = vi.fn()
    requireAdmin(fakeReq(`Bearer ${otroPayload}.${firma}`), {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401 })
  })

  it('ya NO acepta un secreto compartido: la vía del ADMIN_TOKEN viejo está retirada', () => {
    // Antes cualquiera con esta cadena entraba como OWNER. Ahora es un token cualquiera.
    const next = vi.fn()
    requireAdmin(fakeReq('Bearer test-admin-token-abcdef'), {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401 })
  })
})
