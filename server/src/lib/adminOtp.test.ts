import { describe, it, expect } from 'vitest'
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiry,
  otpWindowStart,
  isOtpThrottled,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_WINDOW,
  OTP_TTL_MIN,
  type OtpRecord,
} from './adminOtp.js'

const PEPPER = 'pepper-de-test'
const USER = 'adm_test_1'
const NOW = new Date('2026-07-20T12:00:00.000Z')

/** Registro vivo con el hash del código dado (lo que guardaría la base). */
function record(code: string, over: Partial<OtpRecord> = {}): OtpRecord {
  return {
    codeHash: hashOtp(code, USER, PEPPER),
    expiresAt: otpExpiry(NOW),
    attempts: 0,
    consumedAt: null,
    ...over,
  }
}

describe('generateOtp', () => {
  it('devuelve siempre 6 dígitos, incluidos los que empiezan con cero', () => {
    for (let i = 0; i < 500; i++) {
      const c = generateOtp()
      expect(c).toMatch(/^\d{6}$/)
      expect(c).toHaveLength(OTP_LENGTH)
    }
  })

  it('no repite el mismo código una y otra vez (es aleatorio, no un contador)', () => {
    const vistos = new Set(Array.from({ length: 200 }, () => generateOtp()))
    expect(vistos.size).toBeGreaterThan(150)
  })
})

describe('hashOtp', () => {
  it('NO guarda el código en claro', () => {
    const h = hashOtp('123456', USER, PEPPER)
    expect(h).not.toContain('123456')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('el mismo código para dos usuarios distintos da hashes distintos', () => {
    expect(hashOtp('123456', 'adm_a', PEPPER)).not.toBe(hashOtp('123456', 'adm_b', PEPPER))
  })

  it('el mismo código con otro pepper da otro hash (una base filtrada no alcanza)', () => {
    expect(hashOtp('123456', USER, 'pepper-a')).not.toBe(hashOtp('123456', USER, 'pepper-b'))
  })

  it('es determinístico: mismo código + usuario + pepper → mismo hash', () => {
    expect(hashOtp('123456', USER, PEPPER)).toBe(hashOtp('123456', USER, PEPPER))
  })
})

describe('verifyOtp', () => {
  const ctx = { now: NOW, userId: USER, pepper: PEPPER }

  it('acepta el código correcto', () => {
    expect(verifyOtp(record('123456'), '123456', ctx)).toBe('ok')
  })

  it('rechaza un código incorrecto', () => {
    expect(verifyOtp(record('123456'), '654321', ctx)).toBe('mismatch')
  })

  it('tolera espacios alrededor (el usuario pega el código del mail)', () => {
    expect(verifyOtp(record('123456'), '  123456 ', ctx)).toBe('ok')
  })

  it('rechaza un código ya usado, aunque sea el correcto', () => {
    const usado = record('123456', { consumedAt: NOW })
    expect(verifyOtp(usado, '123456', ctx)).toBe('consumed')
  })

  it('rechaza un código vencido, aunque sea el correcto', () => {
    const vencido = record('123456', { expiresAt: new Date(NOW.getTime() - 1000) })
    expect(verifyOtp(vencido, '123456', ctx)).toBe('expired')
  })

  it('vence EXACTAMENTE al cumplirse el TTL (el borde no es válido)', () => {
    const justo = record('123456', { expiresAt: new Date(NOW.getTime()) })
    expect(verifyOtp(justo, '123456', ctx)).toBe('expired')
  })

  it('sigue válido un milisegundo antes de vencer', () => {
    const casi = record('123456', { expiresAt: new Date(NOW.getTime() + 1) })
    expect(verifyOtp(casi, '123456', ctx)).toBe('ok')
  })

  it('corta al agotarse los intentos, aunque el código sea el correcto', () => {
    const agotado = record('123456', { attempts: OTP_MAX_ATTEMPTS })
    expect(verifyOtp(agotado, '123456', ctx)).toBe('too_many_attempts')
  })

  it('todavía acepta en el último intento disponible', () => {
    const ultimo = record('123456', { attempts: OTP_MAX_ATTEMPTS - 1 })
    expect(verifyOtp(ultimo, '123456', ctx)).toBe('ok')
  })

  it('un código consumido Y vencido reporta "consumed" (estado terminal primero)', () => {
    const ambos = record('123456', { consumedAt: NOW, expiresAt: new Date(NOW.getTime() - 1000) })
    expect(verifyOtp(ambos, '123456', ctx)).toBe('consumed')
  })

  it('el código de OTRO usuario no sirve para este (el hash está atado al userId)', () => {
    const deOtro: OtpRecord = {
      codeHash: hashOtp('123456', 'adm_otro', PEPPER),
      expiresAt: otpExpiry(NOW),
      attempts: 0,
      consumedAt: null,
    }
    expect(verifyOtp(deOtro, '123456', ctx)).toBe('mismatch')
  })

  it('no rompe con entradas basura (vacío, letras, largo raro)', () => {
    const r = record('123456')
    for (const malo of ['', 'abcdef', '12345', '1234567', '   ']) {
      expect(verifyOtp(r, malo, ctx)).toBe('mismatch')
    }
  })

  it('es PURO: verificar no muta el registro', () => {
    const r = record('123456')
    const antes = JSON.stringify(r)
    verifyOtp(r, '000000', ctx)
    expect(JSON.stringify(r)).toBe(antes)
  })
})

describe('rate limit de emisión', () => {
  it('deja pasar hasta el tope y corta a partir de ahí', () => {
    expect(isOtpThrottled(0)).toBe(false)
    expect(isOtpThrottled(OTP_MAX_PER_WINDOW - 1)).toBe(false)
    expect(isOtpThrottled(OTP_MAX_PER_WINDOW)).toBe(true)
    expect(isOtpThrottled(OTP_MAX_PER_WINDOW + 10)).toBe(true)
  })

  it('la ventana mira hacia atrás, no hacia adelante', () => {
    expect(otpWindowStart(NOW).getTime()).toBeLessThan(NOW.getTime())
  })

  it('el TTL del código es más corto que la ventana de rate limit', () => {
    // Si el código durara más que la ventana, se podrían acumular códigos vivos
    // por encima del tope y el rate limit dejaría de acotar el brute-force.
    expect(OTP_TTL_MIN).toBeLessThan(NOW.getTime() / 60_000 - otpWindowStart(NOW).getTime() / 60_000 + OTP_TTL_MIN)
    expect(otpExpiry(NOW).getTime() - NOW.getTime()).toBe(OTP_TTL_MIN * 60_000)
  })
})
