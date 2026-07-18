import { describe, it, expect } from 'vitest'
import { signDeviceToken, verifyDeviceToken } from './deviceToken'

describe('deviceToken — identidad de device firmada (HMAC-SHA256)', () => {
  it('firma y verifica ida y vuelta', () => {
    const token = signDeviceToken('dev-123', 'pub-abc')
    expect(verifyDeviceToken(token)).toEqual({ deviceId: 'dev-123', publicId: 'pub-abc' })
  })

  it('rechaza un token con la firma adulterada', () => {
    const token = signDeviceToken('dev-123', 'pub-abc')
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa')
    expect(verifyDeviceToken(tampered)).toBeNull()
  })

  it('rechaza basura (sin punto separador, o vacío)', () => {
    expect(verifyDeviceToken('no-dot-token')).toBeNull()
    expect(verifyDeviceToken('')).toBeNull()
    expect(verifyDeviceToken('.solo-firma')).toBeNull()
  })

  it('rechaza un body forjado (deviceId ajeno) reusando una firma válida — cierra la suplantación', () => {
    const token = signDeviceToken('dev-123', 'pub-abc')
    const validSig = token.split('.')[1]
    const forgedBody = Buffer.from(
      JSON.stringify({ d: 'dev-EVIL', p: 'pub-abc', iat: Date.now() }),
    ).toString('base64url')
    expect(verifyDeviceToken(`${forgedBody}.${validSig}`)).toBeNull()
  })
})
