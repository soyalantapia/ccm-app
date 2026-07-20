import { describe, it, expect } from 'vitest'
import { parseDate } from './dates'

describe('parseDate — guard de fecha (400 INVALID_DATE, no 500 opaco)', () => {
  it('acepta una fecha ISO válida', () => {
    expect(parseDate('2026-09-19T00:00:00.000Z', 'x').toISOString()).toBe('2026-09-19T00:00:00.000Z')
  })

  it('rechaza una string que no es fecha con 400 INVALID_DATE (incluye el campo en el mensaje)', () => {
    try {
      parseDate('no-es-fecha', 'fecha del evento')
      throw new Error('no tiró')
    } catch (e) {
      expect(e).toMatchObject({ status: 400, code: 'INVALID_DATE' })
      expect((e as Error).message).toContain('fecha del evento')
    }
  })

  it('rechaza vacío / null / undefined', () => {
    for (const v of ['', null, undefined]) {
      expect(() => parseDate(v, 'f')).toThrowError()
    }
  })
})
