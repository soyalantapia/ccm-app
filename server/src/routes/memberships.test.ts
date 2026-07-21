import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('../services/mpOAuthService.js', () => ({ isConnected: vi.fn() }))
vi.mock('../services/membershipService.js', () => ({ becomeSocio: vi.fn(), getMembership: vi.fn() }))

import { isConnected } from '../services/mpOAuthService.js'
import * as membershipService from '../services/membershipService.js'
import { signDeviceToken } from '../lib/deviceToken.js'
import { createApp } from '../app.js'

const app = createApp()
// POST /devices emite tokens sin pedir credenciales, así que este token es exactamente lo que
// consigue cualquier visitante anónimo entrando a la web: no representa a nadie de confianza.
const tokenDeVisitante = signDeviceToken('dev_1', 'pub_1')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(membershipService.becomeSocio).mockResolvedValue({ tier: 'socio' } as never)
})

/**
 * La membresía Socio es un producto que se vende (SOCIO_PRICE). Este endpoint la activaba sin
 * cobrar nada: con MP conectado era plata regalada a cualquiera que supiera pegarle a la API.
 */
describe('POST /memberships — no regala la membresía cuando hay con qué cobrarla', () => {
  it('con Mercado Pago conectado NO activa: la membresía la activa el pago acreditado', async () => {
    vi.mocked(isConnected).mockResolvedValue(true)

    await request(app).post('/api/v1/memberships').set('x-device-token', tokenDeVisitante).expect(409)

    expect(membershipService.becomeSocio).not.toHaveBeenCalled()
  })

  it('sin Mercado Pago conectado sigue funcionando (modo demo: no hay forma de cobrar)', async () => {
    vi.mocked(isConnected).mockResolvedValue(false)

    await request(app).post('/api/v1/memberships').set('x-device-token', tokenDeVisitante).expect(201)

    expect(membershipService.becomeSocio).toHaveBeenCalledWith('dev_1')
  })

  it('sin device token no activa nada, con MP conectado o sin él', async () => {
    vi.mocked(isConnected).mockResolvedValue(false)

    await request(app).post('/api/v1/memberships').expect(401)

    expect(membershipService.becomeSocio).not.toHaveBeenCalled()
  })
})
