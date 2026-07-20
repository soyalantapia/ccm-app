import { describe, it, expect, beforeAll } from 'vitest'

// El módulo firma con ADMIN_TOKEN_SECRET vía lib/env: hay que tenerlo antes de importarlo.
// Mínimo 32 caracteres, igual que exige el contrato de entorno.
const SECRETO_ADMIN = 'secreto-de-test-admin-con-largo-suficiente'
process.env.ADMIN_TOKEN_SECRET ??= SECRETO_ADMIN
process.env.DEVICE_TOKEN_SECRET ??= 'secreto-de-test-device-con-largo-suficiente'

import type { AdminSessionRecord } from './adminSession.js'

const { signSessionToken, verifySessionToken, validateSession, sessionExpiry, SESSION_TTL_MS } =
  await import('./adminSession.js')

const NOW = new Date('2026-07-20T12:00:00.000Z')
const SID = 'ses_abc123'

function rec(over: Partial<AdminSessionRecord> = {}): AdminSessionRecord {
  return {
    expiresAt: sessionExpiry(NOW),
    userId: 'adm_1',
    role: 'OWNER' as AdminSessionRecord['role'],
    userStatus: 'active',
    ...over,
  }
}

describe('token de sesión (firma HMAC)', () => {
  it('va y vuelve: lo que firmo es lo que verifico', () => {
    const t = signSessionToken(SID, sessionExpiry(NOW))
    expect(verifySessionToken(t)).toEqual({ sessionId: SID })
  })

  it('NO lleva el secreto adentro', () => {
    const t = signSessionToken(SID, sessionExpiry(NOW))
    expect(t).not.toContain(SECRETO_ADMIN)
  })

  it('rechaza un token con la firma alterada', () => {
    const t = signSessionToken(SID, sessionExpiry(NOW))
    const [body, sig] = t.split('.')
    const otraSig = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')
    expect(verifySessionToken(`${body}.${otraSig}`)).toBeNull()
  })

  it('rechaza un token con el CUERPO alterado (no se puede cambiar el id de sesión)', () => {
    const t = signSessionToken(SID, sessionExpiry(NOW))
    const sig = t.split('.')[1]
    const otroBody = Buffer.from(JSON.stringify({ s: 'ses_del_jefe', exp: Date.now() + 1000 })).toString('base64url')
    expect(verifySessionToken(`${otroBody}.${sig}`)).toBeNull()
  })

  it('rechaza basura, vacío y tokens sin punto', () => {
    for (const malo of ['', '.', 'sinpunto', 'a.b', '....', 'null.null']) {
      expect(verifySessionToken(malo)).toBeNull()
    }
  })

  it('un token de DEVICE no vale como token de admin (secretos distintos)', async () => {
    const { signDeviceToken } = await import('./deviceToken.js')
    const deviceTok = signDeviceToken('dev_1', 'pub_1')
    expect(verifySessionToken(deviceTok)).toBeNull()
  })

  it('la sesión dura una semana', () => {
    expect(sessionExpiry(NOW).getTime() - NOW.getTime()).toBe(SESSION_TTL_MS)
    expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })
})

describe('validateSession (pura)', () => {
  it('acepta una sesión viva de alguien activo', () => {
    expect(validateSession(SID, rec(), NOW)).toBe('ok')
  })

  it('sin token no hay sesión', () => {
    expect(validateSession(undefined, rec(), NOW)).toBe('no_token')
  })

  it('si la fila no está, la sesión fue REVOCADA (esto es lo que hace real el cerrar sesión)', () => {
    expect(validateSession(SID, null, NOW)).toBe('revoked')
  })

  it('rechaza una sesión vencida', () => {
    expect(validateSession(SID, rec({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe('expired')
  })

  it('vence exactamente en el borde', () => {
    expect(validateSession(SID, rec({ expiresAt: new Date(NOW.getTime()) }), NOW)).toBe('expired')
  })

  it('a alguien desactivado se lo saca aunque su sesión siga viva', () => {
    expect(validateSession(SID, rec({ userStatus: 'disabled' }), NOW)).toBe('user_disabled')
  })

  it('alguien invitado que todavía no entró sí puede entrar', () => {
    expect(validateSession(SID, rec({ userStatus: 'invited' }), NOW)).toBe('ok')
  })

  it('revocada gana sobre vencida: sin fila no hay nada que mirar', () => {
    expect(validateSession(SID, null, new Date(NOW.getTime() + SESSION_TTL_MS * 10))).toBe('revoked')
  })
})
