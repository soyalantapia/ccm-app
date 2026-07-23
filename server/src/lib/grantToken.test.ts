import { describe, it, expect, beforeAll } from 'vitest'

// El secreto tiene que estar antes de importar el módulo: env.ts lo lee al cargar.
beforeAll(() => {
  process.env.GRANT_TOKEN_SECRET = 'x'.repeat(40)
})

const { derivarTokenGrant, verificarTokenGrant } = await import('./grantToken.js')

describe('grantToken — el link de una entrada regalada', () => {
  it('el token es estable: el mismo grant+versión da el mismo token (permite reenviar el link)', () => {
    const a = derivarTokenGrant('grant_abc', 1)
    const b = derivarTokenGrant('grant_abc', 1)
    expect(a).toBe(b)
  })

  it('verifica el token que él mismo derivó', () => {
    const t = derivarTokenGrant('grant_abc', 1)
    expect(verificarTokenGrant('grant_abc', 1, t)).toBe(true)
  })

  it('rechaza el token de OTRO grant (no se puede pasar de un regalo a otro)', () => {
    const t = derivarTokenGrant('grant_abc', 1)
    expect(verificarTokenGrant('grant_xyz', 1, t)).toBe(false)
  })

  it('subir tokenVersion invalida el link viejo (rotar sin borrar el grant)', () => {
    const viejo = derivarTokenGrant('grant_abc', 1)
    const nuevo = derivarTokenGrant('grant_abc', 2)
    expect(nuevo).not.toBe(viejo)
    expect(verificarTokenGrant('grant_abc', 2, viejo)).toBe(false) // el link viejo ya no sirve
    expect(verificarTokenGrant('grant_abc', 2, nuevo)).toBe(true) // el nuevo sí
  })

  it('rechaza un token vacío o adulterado sin reventar', () => {
    expect(verificarTokenGrant('grant_abc', 1, '')).toBe(false)
    expect(verificarTokenGrant('grant_abc', 1, 'basura')).toBe(false)
    const t = derivarTokenGrant('grant_abc', 1)
    expect(verificarTokenGrant('grant_abc', 1, t + 'x')).toBe(false)
  })

  it('el token no contiene el id ni la versión en claro (es un HMAC opaco)', () => {
    const t = derivarTokenGrant('grant_secreto_123', 1)
    expect(t).not.toContain('grant_secreto_123')
    expect(t).not.toContain('.')
  })
})
