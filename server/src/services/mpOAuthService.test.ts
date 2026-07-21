import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    mpConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))
vi.mock('../lib/mpApi.js', () => ({
  exchangeCodeForTokens: vi.fn(),
  refreshTokens: vi.fn(),
}))

import { prisma } from '../lib/prisma.js'
import * as mpApi from '../lib/mpApi.js'
import { ApiError } from '../lib/errors.js'
import { buildAuthUrl, exchangeCode, getStatus, getValidToken, disconnect } from './mpOAuthService.js'

const filaConectada = (vence: Date) => ({
  id: 'default',
  mpUserId: '1928447',
  accessToken: 'ACCESS-vigente',
  refreshToken: 'REFRESH-1',
  publicKey: 'PUB-1',
  expiresAt: vence,
  scope: null,
  connectedAt: new Date('2026-07-20T14:32:00Z'),
  updatedAt: new Date(),
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('mpOAuthService — estado de la conexión', () => {
  it('informa desconectado cuando no hay fila', async () => {
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(null as never)
    expect(await getStatus()).toEqual({ conectado: false })
  })

  it('NUNCA devuelve los tokens en el estado', async () => {
    const dentroDeUnMes = new Date(Date.now() + 30 * 24 * 3600_000)
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(filaConectada(dentroDeUnMes) as never)
    const status = await getStatus()
    expect(status.conectado).toBe(true)
    expect(status.cuenta).toBe('1928447')
    expect(JSON.stringify(status)).not.toContain('ACCESS-vigente')
    expect(JSON.stringify(status)).not.toContain('REFRESH-1')
  })
})

describe('mpOAuthService — el state protege la vuelta de MP', () => {
  it('un state que no se emitió acá se rechaza', async () => {
    await expect(exchangeCode('CODE-1', 'state-inventado')).rejects.toMatchObject({ code: 'MP_STATE_INVALID' })
    expect(mpApi.exchangeCodeForTokens).not.toHaveBeenCalled()
  })

  it('el state es de un solo uso: no se puede reutilizar', async () => {
    vi.mocked(mpApi.exchangeCodeForTokens).mockResolvedValue({
      access_token: 'A', refresh_token: 'R', user_id: 9, public_key: 'P', expires_in: 15552000,
    } as never)
    vi.mocked(prisma.mpConnection.upsert).mockResolvedValue({} as never)

    const url = await buildAuthUrl()
    const state = new URL(url).searchParams.get('state')!
    await exchangeCode('CODE-1', state)
    await expect(exchangeCode('CODE-2', state)).rejects.toMatchObject({ code: 'MP_STATE_INVALID' })
  })
})

describe('mpOAuthService — renovación del token', () => {
  it('devuelve el token tal cual si todavía está lejos de vencer', async () => {
    const dentroDeUnMes = new Date(Date.now() + 30 * 24 * 3600_000)
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(filaConectada(dentroDeUnMes) as never)
    expect(await getValidToken()).toBe('ACCESS-vigente')
    expect(mpApi.refreshTokens).not.toHaveBeenCalled()
  })

  it('renueva cuando está por vencer', async () => {
    const enUnaHora = new Date(Date.now() + 3600_000)
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(filaConectada(enUnaHora) as never)
    vi.mocked(mpApi.refreshTokens).mockResolvedValue({
      access_token: 'ACCESS-nuevo', refresh_token: 'REFRESH-2', user_id: 1928447, public_key: 'P', expires_in: 15552000,
    } as never)
    vi.mocked(prisma.mpConnection.upsert).mockResolvedValue({} as never)

    expect(await getValidToken()).toBe('ACCESS-nuevo')
    expect(mpApi.refreshTokens).toHaveBeenCalledWith('REFRESH-1')
  })

  it('si no hay conexión, falla con un código que la UI entiende', async () => {
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(null as never)
    await expect(getValidToken()).rejects.toMatchObject({ code: 'MP_NOT_CONNECTED' })
  })

  it('dos llamadas concurrentes con el token por vencer disparan una sola renovación', async () => {
    const enUnaHora = new Date(Date.now() + 3600_000)
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(filaConectada(enUnaHora) as never)
    vi.mocked(mpApi.refreshTokens).mockResolvedValue({
      access_token: 'ACCESS-nuevo', refresh_token: 'REFRESH-2', user_id: 1928447, public_key: 'P', expires_in: 15552000,
    } as never)
    vi.mocked(prisma.mpConnection.upsert).mockResolvedValue({} as never)

    const [t1, t2] = await Promise.all([getValidToken(), getValidToken()])

    expect(t1).toBe('ACCESS-nuevo')
    expect(t2).toBe('ACCESS-nuevo')
    expect(mpApi.refreshTokens).toHaveBeenCalledTimes(1)
  })

  it('si la renovación falla, el lock se libera y una llamada posterior puede reintentar', async () => {
    const enUnaHora = new Date(Date.now() + 3600_000)
    vi.mocked(prisma.mpConnection.findUnique).mockResolvedValue(filaConectada(enUnaHora) as never)
    vi.mocked(mpApi.refreshTokens).mockRejectedValueOnce(new ApiError(502, 'MP_API_ERROR', 'Mercado Pago respondió 500'))

    await expect(getValidToken()).rejects.toMatchObject({ code: 'MP_API_ERROR' })

    vi.mocked(mpApi.refreshTokens).mockResolvedValue({
      access_token: 'ACCESS-reintento', refresh_token: 'REFRESH-3', user_id: 1928447, public_key: 'P', expires_in: 15552000,
    } as never)
    vi.mocked(prisma.mpConnection.upsert).mockResolvedValue({} as never)

    expect(await getValidToken()).toBe('ACCESS-reintento')
    expect(mpApi.refreshTokens).toHaveBeenCalledTimes(2)
  })
})

describe('mpOAuthService — desconectar', () => {
  it('borra la conexión', async () => {
    vi.mocked(prisma.mpConnection.deleteMany).mockResolvedValue({ count: 1 } as never)
    await disconnect()
    expect(prisma.mpConnection.deleteMany).toHaveBeenCalled()
  })
})
