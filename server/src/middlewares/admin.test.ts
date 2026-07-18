import { describe, it, expect, vi } from 'vitest'
import { requireAdmin } from './admin'

// setup.ts fija process.env.ADMIN_TOKEN = 'test-admin-token-abcdef', que lib/env.ts parsea.
const GOOD = 'test-admin-token-abcdef'

function fakeReq(auth?: string) {
  return {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? auth : undefined),
  } as never
}

describe('requireAdmin — auth del organizador (Bearer, comparación constant-time)', () => {
  it('deja pasar (next sin error) con el ADMIN_TOKEN correcto', () => {
    const next = vi.fn()
    requireAdmin(fakeReq(`Bearer ${GOOD}`), {} as never, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeUndefined()
  })

  it('401 si falta el header Authorization', () => {
    const next = vi.fn()
    requireAdmin(fakeReq(undefined), {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401, code: 'ADMIN_REQUIRED' })
  })

  it('403 si el token es incorrecto (mismo largo)', () => {
    const next = vi.fn()
    requireAdmin(fakeReq('Bearer test-admin-token-XXXXXX'), {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 403, code: 'ADMIN_FORBIDDEN' })
  })

  it('403 si el token tiene largo distinto — el chequeo de largo evita el throw de timingSafeEqual', () => {
    const next = vi.fn()
    requireAdmin(fakeReq(`Bearer ${GOOD}-EXTRA-LARGO`), {} as never, next)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 403 })
  })
})
